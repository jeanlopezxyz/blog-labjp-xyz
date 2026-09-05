---
title: "LangChain4j 1.x: IA generativa para desarrolladores Java, en producción"
description: "Construye aplicaciones de IA generativa en Java con LangChain4j 1.x: AI Services, RAG con pgvector, tools, memoria, Quarkus y despliegue en OpenShift con secrets, retries y rate limiting."
pubDate: 2026-01-19
updatedDate: 2026-09-05
tags: ["ia", "langchain4j", "java", "llm", "quarkus", "openshift-ai"]
categories: ["ia", "cloud-native"]
featured: true
image: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=630&fit=crop"
lang: es
---

Cuando escribí la primera versión de este post, LangChain4j iba por la 0.27 y cada release rompía algo. En 2025 el proyecto publicó la 1.0 estable, y desde entonces el core y los módulos principales (OpenAI, Ollama, AI Services, RAG) tienen una API que ya no cambia cada mes. He reescrito el artículo completo con la API 1.x, y he añadido lo que de verdad me preguntan los clientes cuando llevan esto a OpenShift: dónde van las API keys, qué pasa cuando el proveedor devuelve un 429, y cómo se despliega junto a un modelo servido en OpenShift AI.

Si vienes de 0.x, la sección "Qué cambió en 1.x" te ahorra una tarde de compilaciones fallidas.

## ¿Qué es LangChain4j?

LangChain4j es la librería Java para trabajar con LLMs sin acoplarte a un proveedor. Lo que aporta:

- **Abstracción de modelos**: OpenAI, Anthropic, Azure OpenAI, Ollama, Google, Mistral y cualquier endpoint compatible con la API de OpenAI (vLLM, OpenShift AI)
- **AI Services**: interfaces Java anotadas que la librería implementa por ti
- **RAG**: carga de documentos, splitting, embeddings y vector stores (pgvector, Elasticsearch, Qdrant, Milvus, en memoria)
- **Tools / function calling**: métodos Java que el modelo puede invocar
- **Memoria de conversación**: contexto por usuario o sesión
- **Integración con Quarkus y Spring Boot** con configuración declarativa

## Qué cambió en 1.x

Los conceptos son los mismos, pero hay renombrados que rompen la compilación:

- `ChatLanguageModel` pasa a llamarse `ChatModel` (y `StreamingChatLanguageModel` a `StreamingChatModel`)
- `model.generate(...)` desaparece; ahora es `model.chat(...)`, que devuelve `String` para el caso simple o un `ChatResponse` si le pasas mensajes
- En `AiServices.builder(...)`, `.chatLanguageModel(model)` pasa a ser `.chatModel(model)`
- La ingesta de documentos se hace con `EmbeddingStoreIngestor` en lugar de encadenar splitter, embed y `addAll` a mano
- Aparece un BOM (`langchain4j-bom`) para alinear versiones de todos los módulos

Todo lo que ves a continuación está escrito contra esa API.

## Dependencias

Uso el BOM para no perseguir versiones módulo a módulo. Los módulos de integración con proveedores (OpenAI, Ollama, pgvector) versionan junto al core en la rama 1.x.

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>dev.langchain4j</groupId>
            <artifactId>langchain4j-bom</artifactId>
            <version>1.x.y</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>

<dependencies>
    <dependency>
        <groupId>dev.langchain4j</groupId>
        <artifactId>langchain4j</artifactId>
    </dependency>
    <dependency>
        <groupId>dev.langchain4j</groupId>
        <artifactId>langchain4j-open-ai</artifactId>
    </dependency>
    <dependency>
        <groupId>dev.langchain4j</groupId>
        <artifactId>langchain4j-ollama</artifactId>
    </dependency>
    <dependency>
        <groupId>dev.langchain4j</groupId>
        <artifactId>langchain4j-pgvector</artifactId>
    </dependency>
</dependencies>
```

Sustituye `1.x.y` por la última versión estable de la rama 1.x publicada en Maven Central.

## Primer chat

```java
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.openai.OpenAiChatModel;

import static java.time.Duration.ofSeconds;

ChatModel model = OpenAiChatModel.builder()
    .apiKey(System.getenv("OPENAI_API_KEY"))
    .modelName("gpt-4o-mini")
    .temperature(0.3)
    .timeout(ofSeconds(60))
    .maxRetries(3)
    .build();

String answer = model.chat("Explica Kubernetes en tres frases");
System.out.println(answer);
```

Dos detalles que nunca faltan en mis builders y que en 0.x casi nadie ponía: `timeout` y `maxRetries`. Sin timeout, una llamada colgada bloquea un hilo indefinidamente. Sin retries, el primer 429 o 503 del proveedor se convierte en un error para el usuario.

## AI Services: la forma idiomática

La gracia de LangChain4j es que casi nunca llamas a `model.chat()` directamente. Declaras una interfaz y la librería genera la implementación: prompts, parsing de la respuesta, tools, memoria y RAG se configuran alrededor.

```java
import dev.langchain4j.service.AiServices;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;

interface Assistant {

    @SystemMessage("Eres un consultor experto en OpenShift y Cloud Native. Responde de forma concisa.")
    String chat(@UserMessage String message);

    @SystemMessage("Resume el texto en máximo tres puntos.")
    @UserMessage("Texto: {{text}}")
    String summarize(@V("text") String text);
}

Assistant assistant = AiServices.builder(Assistant.class)
    .chatModel(model)
    .build();

String response = assistant.chat("¿Cuándo usar Kubernetes vs Docker Compose?");
```

Un patrón que uso mucho en clientes: devolver tipos estructurados. Si el método devuelve un `record` o un `enum`, LangChain4j pide al modelo salida JSON y la deserializa. Esto convierte al LLM en una función tipada que puedes testear como cualquier otra.

```java
enum Priority { LOW, MEDIUM, HIGH, CRITICAL }

record TicketTriage(Priority priority, String team, String summary) {}

interface TriageService {

    @SystemMessage("Clasifica tickets de soporte de una plataforma OpenShift.")
    @UserMessage("Ticket: {{ticket}}")
    TicketTriage triage(@V("ticket") String ticket);
}
```

## Modelos locales con Ollama (y modelos en OpenShift AI)

Para desarrollo, y para clientes que no pueden enviar datos fuera, un modelo local es obligatorio. Ollama en la máquina del desarrollador:

```java
import dev.langchain4j.model.ollama.OllamaChatModel;

ChatModel localModel = OllamaChatModel.builder()
    .baseUrl("http://localhost:11434")
    .modelName("llama3.1")
    .temperature(0.0)
    .timeout(ofSeconds(120))
    .build();

String dockerfile = localModel.chat("Genera un Containerfile para una app Java 21 con UBI 9");
```

En producción sobre OpenShift, lo habitual es que el modelo lo sirva OpenShift AI (KServe con vLLM), que expone una API compatible con OpenAI. Eso significa que el mismo módulo `langchain4j-open-ai` funciona apuntando al servicio interno; solo cambia `baseUrl` y el modelo. La aplicación no se entera de si habla con OpenAI o con un Granite o Llama desplegado en tu cluster:

```java
ChatModel clusterModel = OpenAiChatModel.builder()
    .baseUrl("https://granite-predictor.ai-models.svc.cluster.local/v1")
    .apiKey(System.getenv("MODEL_API_KEY"))
    .modelName("granite-3-8b-instruct")
    .timeout(ofSeconds(90))
    .build();
```

Esto es lo que me permite tener el mismo código en tres entornos: Ollama en local, OpenAI en un sandbox y OpenShift AI en producción, cambiando solo configuración.

## RAG con pgvector

RAG sigue siendo el caso de uso que más despliego. En 1.x el flujo de ingesta se simplificó con `EmbeddingStoreIngestor`, que encadena splitting, embeddings y almacenamiento.

```java
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.parser.apache.pdfbox.ApachePdfBoxDocumentParser;
import dev.langchain4j.data.document.splitter.DocumentSplitters;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.openai.OpenAiEmbeddingModel;
import dev.langchain4j.rag.content.retriever.ContentRetriever;
import dev.langchain4j.rag.content.retriever.EmbeddingStoreContentRetriever;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.EmbeddingStoreIngestor;
import dev.langchain4j.store.embedding.pgvector.PgVectorEmbeddingStore;

import static dev.langchain4j.data.document.loader.FileSystemDocumentLoader.loadDocument;

// 1. Modelo de embeddings
EmbeddingModel embeddingModel = OpenAiEmbeddingModel.builder()
    .apiKey(System.getenv("OPENAI_API_KEY"))
    .modelName("text-embedding-3-small")
    .build();

// 2. Vector store en PostgreSQL con la extension pgvector
EmbeddingStore<TextSegment> store = PgVectorEmbeddingStore.builder()
    .host(System.getenv("PGHOST"))
    .port(5432)
    .database("knowledge")
    .user(System.getenv("PGUSER"))
    .password(System.getenv("PGPASSWORD"))
    .table("document_embeddings")
    .dimension(embeddingModel.dimension())
    .createTable(true)
    .build();

// 3. Ingesta: cargar, dividir, embeber y guardar
Document doc = loadDocument("docs/runbook-openshift.pdf", new ApachePdfBoxDocumentParser());

EmbeddingStoreIngestor.builder()
    .documentSplitter(DocumentSplitters.recursive(500, 50))
    .embeddingModel(embeddingModel)
    .embeddingStore(store)
    .build()
    .ingest(doc);

// 4. Retriever
ContentRetriever retriever = EmbeddingStoreContentRetriever.builder()
    .embeddingStore(store)
    .embeddingModel(embeddingModel)
    .maxResults(4)
    .minScore(0.7)
    .build();

// 5. AI Service con RAG
interface RunbookAssistant {
    @SystemMessage("Responde solo con la informacion del contexto. Si no esta, dilo.")
    String answer(@UserMessage String question);
}

RunbookAssistant assistant = AiServices.builder(RunbookAssistant.class)
    .chatModel(model)
    .contentRetriever(retriever)
    .build();
```

Por qué pgvector y no un vector store dedicado: porque el cliente ya tiene PostgreSQL en el cluster, ya sabe hacerle backup, ya tiene monitorización, y ya tiene un DBA que lo entiende. Un Qdrant o Milvus adicional es otra pieza que operar. Para la mayoría de casos de RAG corporativo, pgvector sobra.

Y un consejo sobre `minScore`: ponlo. Sin umbral, el retriever devuelve siempre `maxResults` chunks aunque no tengan nada que ver con la pregunta, y el modelo alucina con contexto irrelevante.

## Tools / function calling

Las tools son métodos Java que el modelo decide invocar. El ejemplo que más uso en demos con clientes de OpenShift: dejar que el asistente consulte el estado del cluster.

```java
import dev.langchain4j.agent.tool.P;
import dev.langchain4j.agent.tool.Tool;

class ClusterTools {

    private final KubernetesClient client;

    ClusterTools(KubernetesClient client) {
        this.client = client;
    }

    @Tool("Devuelve los pods que no estan en estado Running en un namespace")
    String unhealthyPods(@P("Nombre del namespace") String namespace) {
        return client.pods().inNamespace(namespace).list().getItems().stream()
            .filter(p -> !"Running".equals(p.getStatus().getPhase()))
            .map(p -> p.getMetadata().getName() + ": " + p.getStatus().getPhase())
            .collect(Collectors.joining("\n"));
    }
}

interface OpsAssistant {
    String chat(@UserMessage String message);
}

OpsAssistant ops = AiServices.builder(OpsAssistant.class)
    .chatModel(model)
    .tools(new ClusterTools(kubernetesClient))
    .build();

ops.chat("¿Hay algo roto en el namespace payments?");
```

Aviso serio: una tool es código que se ejecuta con los permisos de tu aplicación. En producción solo expongo tools de lectura, y la ServiceAccount del pod tiene un Role con `get/list` y nada más. Nunca he dado a un LLM una tool que haga `delete`.

## Memoria de conversación

```java
import dev.langchain4j.memory.chat.MessageWindowChatMemory;
import dev.langchain4j.service.MemoryId;

interface ConversationalAssistant {
    String chat(@MemoryId String sessionId, @UserMessage String message);
}

ConversationalAssistant assistant = AiServices.builder(ConversationalAssistant.class)
    .chatModel(model)
    .chatMemoryProvider(sessionId -> MessageWindowChatMemory.withMaxMessages(20))
    .build();

assistant.chat("user-123", "Me llamo Jean");
assistant.chat("user-123", "¿Cómo me llamo?"); // "Te llamas Jean"
```

Fíjate en que el `chatMemoryProvider` crea una memoria nueva por `sessionId`. El error clásico del post original era compartir una única instancia entre todos los usuarios. Para que la memoria sobreviva a un reinicio del pod, implementa `ChatMemoryStore` contra Redis o PostgreSQL; el `MessageWindowChatMemory` en memoria se pierde con cada despliegue.

## Quarkus: la forma declarativa

En Quarkus no construyo modelos a mano. La extensión `quarkus-langchain4j` los crea a partir de `application.properties` y los AI Services se registran como beans CDI.

```xml
<dependency>
    <groupId>io.quarkiverse.langchain4j</groupId>
    <artifactId>quarkus-langchain4j-openai</artifactId>
</dependency>
```

```java
import io.quarkiverse.langchain4j.RegisterAiService;
import io.quarkiverse.langchain4j.ToolBox;

@RegisterAiService
@ApplicationScoped
public interface OpsAssistant {

    @SystemMessage("Eres un asistente de operaciones de OpenShift. Solo lectura.")
    @ToolBox(ClusterTools.class)
    String chat(@UserMessage String message);
}
```

```properties
quarkus.langchain4j.openai.api-key=${OPENAI_API_KEY}
quarkus.langchain4j.openai.base-url=${LLM_BASE_URL:https://api.openai.com/v1}
quarkus.langchain4j.openai.chat-model.model-name=gpt-4o-mini
quarkus.langchain4j.openai.chat-model.temperature=0.2
quarkus.langchain4j.openai.timeout=60s
quarkus.langchain4j.openai.max-retries=3
quarkus.langchain4j.openai.log-requests=false
```

```java
@Path("/api/ops")
public class OpsResource {

    @Inject
    OpsAssistant assistant;

    @POST
    @Consumes(MediaType.TEXT_PLAIN)
    public String chat(String message) {
        return assistant.chat(message);
    }
}
```

`${OPENAI_API_KEY}` y `${LLM_BASE_URL}` se resuelven desde variables de entorno. Eso es lo que hace que el mismo jar apunte a OpenAI en desarrollo y a OpenShift AI en producción sin recompilar.

## Producción en OpenShift

Aquí está lo que separa una demo de algo que un cliente acepta.

### API keys como Secrets, nunca en el código

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: llm-credentials
type: Opaque
stringData:
  OPENAI_API_KEY: "<inyectado por el pipeline o por External Secrets>"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ops-assistant
spec:
  template:
    spec:
      containers:
        - name: app
          image: image-registry.openshift-image-registry.svc:5000/ai-apps/ops-assistant@sha256:...
          envFrom:
            - secretRef:
                name: llm-credentials
          env:
            - name: LLM_BASE_URL
              value: https://granite-predictor.ai-models.svc.cluster.local/v1
          resources:
            requests:
              memory: 512Mi
              cpu: 250m
            limits:
              memory: 1Gi
```

En clientes con Vault, el Secret lo crea el External Secrets Operator o el Vault Agent Injector; la aplicación nunca ve más que una variable de entorno. Y `quarkus.langchain4j.openai.log-requests=false` en producción: con logging activado, el prompt completo (con datos del usuario) acaba en los logs.

### Retries, timeouts y rate limiting

El proveedor de LLM es una dependencia externa que falla y que te limita por cuota. Dos capas:

1. **Retries del cliente** (`max-retries`) para errores transitorios: 429, 503, timeouts de red. Con backoff exponencial, que es lo que LangChain4j aplica por defecto.
2. **Fault tolerance a nivel de servicio** con SmallRye Fault Tolerance, para proteger a tu aplicación de un proveedor degradado y para no agotar tu cuota en un pico.

```java
import io.smallrye.faulttolerance.api.RateLimit;
import org.eclipse.microprofile.faulttolerance.Fallback;
import org.eclipse.microprofile.faulttolerance.Timeout;

@ApplicationScoped
public class OpsService {

    @Inject
    OpsAssistant assistant;

    @Timeout(value = 45, unit = ChronoUnit.SECONDS)
    @RateLimit(value = 60, window = 1, windowUnit = ChronoUnit.MINUTES)
    @Fallback(fallbackMethod = "unavailable")
    public String ask(String message) {
        return assistant.chat(message);
    }

    String unavailable(String message) {
        return "El asistente no esta disponible ahora mismo. Intentalo en unos minutos.";
    }
}
```

`@RateLimit` a 60 llamadas por minuto es un ejemplo; ajústalo a la cuota real del proveedor o a lo que soporte tu inferencia en OpenShift AI. El `@Fallback` evita que un 429 se convierta en un stack trace en la cara del usuario. Y `@Timeout` debe ser mayor que el timeout del cliente LangChain4j multiplicado por el número de retries, o cortarás reintentos a medias.

### Observabilidad

Con Quarkus, OpenTelemetry instrumenta las llamadas HTTP al proveedor automáticamente; en la traza ves cuánto tarda cada inferencia. Lo que sí añado a mano es una métrica de tokens consumidos por llamada (el `ChatResponse` los expone en `tokenUsage()`), porque es lo que acaba en la factura y lo que primero te preguntará finanzas.

## Conclusión

LangChain4j 1.x es la primera versión que recomiendo sin reservas para producción: la API se ha estabilizado, los AI Services con tipos estructurados convierten el LLM en una función Java testeable, y la integración con Quarkus reduce la configuración a un fichero de propiedades. Lo que no hace la librería por ti, y donde de verdad se gana el sueldo un consultor, es lo de alrededor: secrets fuera del código, retries y rate limiting frente al proveedor, tools solo de lectura, y un modelo servido dentro del cluster cuando los datos no pueden salir. Con eso resuelto, Java es un lugar perfectamente serio desde el que hacer IA generativa.
