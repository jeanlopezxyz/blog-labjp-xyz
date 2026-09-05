---
title: "RAG Enterprise en Java: de la teoría a producción"
description: "Construye sistemas RAG robustos para entornos empresariales usando Java, pgvector y modelos locales."
pubDate: 2026-01-20
updatedDate: 2026-09-05
tags: ["ia", "rag", "java", "enterprise"]
categories: ["ia"]
featured: true
image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&h=630&fit=crop"
lang: es
---

RAG (Retrieval Augmented Generation) permite a los LLMs responder preguntas usando tus propios datos. En este artículo recorremos cómo implementar una solución enterprise-grade en Java, desde la teoría hasta las decisiones que realmente importan cuando el sistema llega a producción.

## ¿Por qué RAG?

Los LLMs tienen limitaciones importantes:

- **Conocimiento estático**: No conocen tus datos internos
- **Alucinaciones**: Inventan información cuando no saben
- **Sin actualizaciones**: Su conocimiento tiene fecha de corte

RAG resuelve estos problemas conectando el LLM a tu base de conocimiento. En vez de reentrenar o hacer fine-tuning cada vez que cambia un documento, recuperas los fragmentos relevantes en el momento de la consulta y se los pasas al modelo como contexto.

## Arquitectura RAG

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Usuario    │────▶│   Retriever  │────▶│ Vector Store │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │
       │                    ▼
       │            ┌──────────────┐
       │            │  Documentos  │
       │            │  relevantes  │
       │            └──────────────┘
       │                    │
       ▼                    ▼
┌──────────────────────────────────┐
│              LLM                  │
│   (pregunta + contexto)          │
└──────────────────────────────────┘
                │
                ▼
        ┌──────────────┐
        │   Respuesta  │
        │  fundamentada│
        └──────────────┘
```

## Stack tecnológico

- **LangChain4j**: Framework de IA para Java
- **PostgreSQL + pgvector (0.7+)**: Vector store escalable. A partir de la serie 0.7 pgvector incorporó mejoras relevantes en los índices HNSW y soporte para tipos de vector más compactos (`halfvec`), que son los que hacen viable el escenario enterprise que describo aquí.
- **Quarkus**: Framework cloud-native
- **Ollama**: Modelos locales (privacidad)

La elección de pgvector sobre una base vectorial dedicada no es casual: en la mayoría de organizaciones con las que trabajo ya existe PostgreSQL, ya existe quien lo opera, ya hay backups y ya hay HA. Añadir una extensión es mucho más barato operativamente que introducir un componente nuevo con su propio ciclo de vida.

## Configuración de pgvector

```sql
-- Habilitar extensión (requiere pgvector 0.7 o superior)
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabla de embeddings
CREATE TABLE document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    metadata JSONB,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índice HNSW: la opción por defecto para cargas de consulta
CREATE INDEX ON document_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

## Rendimiento: HNSW vs IVFFlat

Este es el punto donde más veces he visto fallar proyectos RAG al pasar de la demo a producción. pgvector ofrece dos tipos de índice aproximado (ANN) y la decisión afecta directamente la latencia, la precisión y el coste de ingesta.

### IVFFlat

Divide el espacio vectorial en `lists` clusters y, en cada consulta, solo explora los `probes` clusters más cercanos.

- **Construcción**: rápida y con poco consumo de memoria.
- **Requisito**: necesita datos existentes para calcular los centroides. Si creas el índice sobre una tabla vacía o lo haces antes de una carga masiva, los clusters quedan mal distribuidos y el recall se degrada.
- **Consulta**: el trade-off se controla con `ivfflat.probes`. Pocos probes significa consultas rápidas pero con más falsos negativos; muchos probes se acerca a un scan secuencial.
- **Cuándo usarlo**: datasets relativamente estáticos donde puedes reconstruir el índice tras cada carga, o entornos con memoria muy limitada.

### HNSW

Construye un grafo jerárquico de vecinos cercanos. No necesita entrenamiento previo y se puede crear sobre una tabla vacía.

- **Construcción**: más lenta y con mayor consumo de memoria que IVFFlat. En cargas iniciales grandes conviene subir `maintenance_work_mem` y, si tu versión lo soporta, aprovechar la construcción paralela.
- **Consulta**: mejor relación velocidad/recall que IVFFlat para la misma latencia objetivo. El parámetro `hnsw.ef_search` controla cuántos candidatos se exploran; subirlo mejora la precisión a costa de latencia.
- **Inserciones incrementales**: el grafo se mantiene bien con inserts continuos, que es el patrón habitual en una base de conocimiento empresarial que se actualiza a diario.
- **Cuándo usarlo**: prácticamente siempre que el volumen de consultas importe más que el tiempo de ingesta. Es mi opción por defecto.

### Cómo decidir

| Criterio | IVFFlat | HNSW |
|----------|---------|------|
| Tiempo de construcción | Menor | Mayor |
| Memoria del índice | Menor | Mayor |
| Recall a latencia fija | Menor | Mayor |
| Índice sobre tabla vacía | No recomendado | Sí |
| Inserts continuos | Requiere reindexar periódicamente | Se mantiene bien |

No voy a dar números absolutos porque dependen del modelo de embeddings, la dimensionalidad, el hardware y la distribución de tus datos. Lo que sí recomiendo es medir el recall contra una búsqueda exacta (sin índice) sobre un conjunto de consultas reales de tu dominio antes de fijar los parámetros. En pgvector puedes hacerlo con `SET enable_indexscan = off` en una sesión de prueba y comparar los top-k resultados.

### Otras consideraciones de producción

- **Dimensionalidad**: 1536 dimensiones es el tamaño de los embeddings de OpenAI; los modelos locales suelen usar 384, 768 o 1024. Menos dimensiones significa índices más pequeños y consultas más rápidas. Elige el modelo de embeddings pensando también en esto.
- **Filtrado por metadata**: si filtras por `metadata->>'tenant'` junto con la búsqueda vectorial, el planificador puede decidir no usar el índice ANN. Para escenarios multi-tenant con mucho volumen, considera particionar la tabla por tenant o crear índices parciales.
- **Distancia**: usa el operador coherente con el modelo. La mayoría de modelos de embeddings están pensados para similitud coseno (`vector_cosine_ops`); si normalizas los vectores, el producto interno (`vector_ip_ops`) da el mismo ranking y es ligeramente más barato.
- **Vacuum y bloat**: las tablas con inserts y deletes frecuentes acumulan bloat rápidamente. Configura autovacuum de forma agresiva para esta tabla.

## Implementación con LangChain4j

### Configuración del EmbeddingStore

```java
@ApplicationScoped
public class VectorStoreConfig {

    @ConfigProperty(name = "pgvector.host")
    String host;

    @ConfigProperty(name = "pgvector.database")
    String database;

    @ConfigProperty(name = "pgvector.user")
    String user;

    @ConfigProperty(name = "pgvector.password")
    String password;

    @Produces
    @ApplicationScoped
    EmbeddingStore<TextSegment> embeddingStore() {
        return PgVectorEmbeddingStore.builder()
            .host(host)
            .port(5432)
            .database(database)
            .user(user)
            .password(password)
            .table("document_embeddings")
            .dimension(1536)
            .build();
    }
}
```

Las credenciales vienen siempre de configuración externa (Secret de Kubernetes, Vault, variables de entorno). Nunca en el código.

### Ingesta de documentos

```java
@ApplicationScoped
public class DocumentIngestionService {

    @Inject
    EmbeddingStore<TextSegment> store;

    @Inject
    EmbeddingModel embeddingModel;

    public void ingest(Path documentPath) {
        // 1. Cargar documento
        Document document = FileSystemDocumentLoader.loadDocument(
            documentPath,
            new ApachePdfBoxDocumentParser()
        );

        // 2. Dividir en chunks
        DocumentSplitter splitter = DocumentSplitters.recursive(
            500,   // max chunk size
            50     // overlap
        );
        List<TextSegment> segments = splitter.split(document);

        // 3. Generar embeddings
        List<Embedding> embeddings = embeddingModel.embedAll(segments).content();

        // 4. Almacenar
        store.addAll(embeddings, segments);
    }
}
```

### Servicio RAG

```java
@ApplicationScoped
public class RagService {

    private final Assistant assistant;

    @Inject
    public RagService(
        ChatLanguageModel model,
        EmbeddingStore<TextSegment> store,
        EmbeddingModel embeddingModel
    ) {
        ContentRetriever retriever = EmbeddingStoreContentRetriever.builder()
            .embeddingStore(store)
            .embeddingModel(embeddingModel)
            .maxResults(5)
            .minScore(0.7)
            .build();

        this.assistant = AiServices.builder(Assistant.class)
            .chatLanguageModel(model)
            .contentRetriever(retriever)
            .build();
    }

    public String query(String question) {
        return assistant.answer(question);
    }

    interface Assistant {
        @SystemMessage("""
            Eres un asistente experto. Responde SOLO basándote en el contexto proporcionado.
            Si no encuentras la información, di "No tengo información sobre eso".
            Cita las fuentes cuando sea posible.
            """)
        String answer(@UserMessage String question);
    }
}
```

## Mejoras para producción

### 1. Chunking inteligente

```java
DocumentSplitter splitter = DocumentSplitters.recursive(
    500,
    50,
    new OpenAiTokenizer("gpt-4")  // Cuenta tokens reales
);
```

El tamaño de chunk es una de las palancas más infravaloradas. Chunks muy pequeños pierden contexto; chunks muy grandes diluyen la señal del embedding y consumen ventana del modelo. En documentación técnica con estructura clara (manuales, runbooks), dividir por secciones antes de aplicar el splitter recursivo suele dar mejores resultados que un tamaño fijo.

### 2. Metadata enriquecida

```java
TextSegment segment = TextSegment.from(
    content,
    Metadata.from("source", "manual-v2.pdf")
        .add("page", "15")
        .add("section", "Configuración")
);
```

La metadata no es solo para citar fuentes: es lo que te permite filtrar por tenant, por fecha de vigencia o por nivel de confidencialidad antes de que el fragmento llegue al modelo.

### 3. Reranking

```java
ContentRetriever retriever = EmbeddingStoreContentRetriever.builder()
    .embeddingStore(store)
    .embeddingModel(embeddingModel)
    .maxResults(20)  // Traer más
    .build();

// Reranker reduce a los más relevantes
Reranker reranker = CohereReranker.builder()
    .apiKey(cohereApiKey)
    .build();
```

La búsqueda vectorial es buena recuperando candidatos, pero no tan buena ordenándolos. Un reranker (cross-encoder) evalúa cada par pregunta-fragmento con más precisión. Si no puedes enviar datos a un servicio externo, existen modelos de reranking que puedes servir localmente con el mismo enfoque de privacidad que Ollama.

### 4. Caché semántico

```java
@ApplicationScoped
public class SemanticCache {

    private final EmbeddingStore<TextSegment> cacheStore;
    private final EmbeddingModel embeddingModel;

    public Optional<String> get(String query) {
        Embedding queryEmbedding = embeddingModel.embed(query).content();
        List<EmbeddingMatch<TextSegment>> matches =
            cacheStore.findRelevant(queryEmbedding, 1, 0.95);

        return matches.isEmpty()
            ? Optional.empty()
            : Optional.of(matches.get(0).embedded().metadata().get("response"));
    }
}
```

Ojo con el umbral: 0.95 es conservador a propósito. Un caché semántico demasiado permisivo devuelve respuestas de preguntas parecidas pero no iguales, y ese tipo de error es difícil de detectar en producción.

### 5. Evaluación continua

Un sistema RAG sin evaluación es un sistema que se degrada en silencio. Mantén un conjunto de preguntas con respuestas esperadas de tu dominio y ejecútalo en cada cambio de modelo de embeddings, de parámetros de índice o de estrategia de chunking. No hace falta un framework sofisticado para empezar: un test de integración con Testcontainers levantando PostgreSQL con pgvector y comprobando que los top-k contienen el fragmento correcto ya detecta la mayoría de regresiones.

## API REST

```java
@Path("/api/rag")
@Produces(MediaType.APPLICATION_JSON)
public class RagResource {

    @Inject
    RagService ragService;

    @POST
    @Path("/query")
    public Response query(QueryRequest request) {
        String answer = ragService.query(request.question());

        return Response.ok(new QueryResponse(
            request.question(),
            answer,
            Instant.now()
        )).build();
    }

    @POST
    @Path("/ingest")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    public Response ingest(@MultipartForm FileUpload upload) {
        ragService.ingest(upload.filePath());
        return Response.accepted().build();
    }
}
```

## Conclusión

RAG transforma los LLMs de curiosidades a herramientas empresariales reales. Con Java, pgvector y LangChain4j puedes construir sistemas robustos que respetan la privacidad de tus datos y escalan con tu organización. La diferencia entre una demo y un sistema en producción no está en el LLM: está en el índice que elegiste, en cómo partiste los documentos y en si tienes forma de saber cuándo la calidad de las respuestas empieza a bajar.
