---
title: "RAG Enterprise en Java: de la teoria a produccion"
description: "Construye sistemas RAG robustos para entornos empresariales usando Java, pgvector y modelos locales."
pubDate: 2026-01-20
tags: ["ia", "rag", "java", "enterprise"]
categories: ["ia"]
featured: true
image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&h=630&fit=crop"
lang: es
---

RAG (Retrieval Augmented Generation) permite a los LLMs responder preguntas usando tus propios datos. Aprende a implementar soluciones enterprise-grade en Java.

## ¿Por qué RAG?

Los LLMs tienen limitaciones importantes:

- **Conocimiento estático**: No conocen tus datos internos
- **Alucinaciones**: Inventan información cuando no saben
- **Sin actualizaciones**: Su conocimiento tiene fecha de corte

RAG resuelve estos problemas conectando el LLM a tu base de conocimiento.

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
- **PostgreSQL + pgvector**: Vector store escalable
- **Quarkus**: Framework cloud-native
- **Ollama**: Modelos locales (privacidad)

## Configuración de pgvector

```sql
-- Habilitar extensión
CREATE EXTENSION vector;

-- Tabla de embeddings
CREATE TABLE document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    metadata JSONB,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índice para búsqueda eficiente
CREATE INDEX ON document_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

## Implementación con LangChain4j

### Configuración del EmbeddingStore

```java
@ApplicationScoped
public class VectorStoreConfig {

    @ConfigProperty(name = "pgvector.host")
    String host;

    @ConfigProperty(name = "pgvector.database")
    String database;

    @Produces
    @ApplicationScoped
    EmbeddingStore<TextSegment> embeddingStore() {
        return PgVectorEmbeddingStore.builder()
            .host(host)
            .port(5432)
            .database(database)
            .user("app")
            .password("secret")
            .table("document_embeddings")
            .dimension(1536)
            .build();
    }
}
```

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

### 2. Metadata enriquecida

```java
TextSegment segment = TextSegment.from(
    content,
    Metadata.from("source", "manual-v2.pdf")
        .add("page", "15")
        .add("section", "Configuración")
);
```

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

RAG transforma los LLMs de curiosidades a herramientas empresariales reales. Con Java, pgvector y LangChain4j, puedes construir sistemas robustos que respetan la privacidad de tus datos y escalan con tu organización.
