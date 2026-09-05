---
title: "LangChain4j 1.x: Generative AI for Java Developers, in Production"
description: "Build generative AI applications in Java with LangChain4j 1.x: AI Services, RAG with pgvector, tools, memory, Quarkus, and OpenShift deployment with secrets, retries and rate limiting."
pubDate: 2026-01-19
updatedDate: 2026-09-05
tags: ["ai", "langchain4j", "java", "llm", "quarkus", "openshift-ai"]
categories: ["ia", "cloud-native"]
featured: true
image: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=630&fit=crop"
lang: en
---

When I first wrote this post, LangChain4j was at 0.27 and every release broke something. In 2025 the project shipped a stable 1.0, and since then the core and the main modules (OpenAI, Ollama, AI Services, RAG) have an API that no longer shifts every month. I have rewritten the whole article against the 1.x API and added the things customers actually ask me when they take this to OpenShift: where the API keys go, what happens when the provider returns a 429, and how you deploy next to a model served by OpenShift AI.

If you are coming from 0.x, the "What changed in 1.x" section will save you an afternoon of failed builds.

## What is LangChain4j?

LangChain4j is the Java library for working with LLMs without coupling yourself to a provider. What it gives you:

- **Model abstraction**: OpenAI, Anthropic, Azure OpenAI, Ollama, Google, Mistral, and any OpenAI-compatible endpoint (vLLM, OpenShift AI)
- **AI Services**: annotated Java interfaces that the library implements for you
- **RAG**: document loading, splitting, embeddings and vector stores (pgvector, Elasticsearch, Qdrant, Milvus, in-memory)
- **Tools / function calling**: Java methods the model can invoke
- **Conversation memory**: per-user or per-session context
- **Quarkus and Spring Boot integration** with declarative configuration

## What changed in 1.x

The concepts are the same, but there are renames that break compilation:

- `ChatLanguageModel` is now `ChatModel` (and `StreamingChatLanguageModel` is `StreamingChatModel`)
- `model.generate(...)` is gone; it is now `model.chat(...)`, returning a `String` for the simple case or a `ChatResponse` when you pass messages
- In `AiServices.builder(...)`, `.chatLanguageModel(model)` became `.chatModel(model)`
- Document ingestion uses `EmbeddingStoreIngestor` instead of hand-chaining splitter, embed and `addAll`
- There is now a BOM (`langchain4j-bom`) to align versions across modules

Everything below is written against that API.

## Dependencies

I use the BOM so I stop chasing versions module by module. The provider modules (OpenAI, Ollama, pgvector) version alongside the core on the 1.x line.

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

Replace `1.x.y` with the latest stable 1.x release on Maven Central.

## First chat

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

String answer = model.chat("Explain Kubernetes in three sentences");
System.out.println(answer);
```

Two settings I never leave out of a builder, and that almost nobody set back in 0.x: `timeout` and `maxRetries`. Without a timeout, a hung call blocks a thread indefinitely. Without retries, the provider's first 429 or 503 becomes an error in front of the user.

## AI Services: the idiomatic way

The whole point of LangChain4j is that you rarely call `model.chat()` directly. You declare an interface and the library generates the implementation; prompts, response parsing, tools, memory and RAG are configured around it.

```java
import dev.langchain4j.service.AiServices;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;

interface Assistant {

    @SystemMessage("You are an expert OpenShift and Cloud Native consultant. Be concise.")
    String chat(@UserMessage String message);

    @SystemMessage("Summarize the text in at most three bullet points.")
    @UserMessage("Text: {{text}}")
    String summarize(@V("text") String text);
}

Assistant assistant = AiServices.builder(Assistant.class)
    .chatModel(model)
    .build();

String response = assistant.chat("When should I use Kubernetes instead of Docker Compose?");
```

A pattern I lean on heavily with customers: structured return types. If the method returns a `record` or an `enum`, LangChain4j asks the model for JSON and deserializes it. That turns the LLM into a typed function you can test like any other.

```java
enum Priority { LOW, MEDIUM, HIGH, CRITICAL }

record TicketTriage(Priority priority, String team, String summary) {}

interface TriageService {

    @SystemMessage("Classify support tickets for an OpenShift platform.")
    @UserMessage("Ticket: {{ticket}}")
    TicketTriage triage(@V("ticket") String ticket);
}
```

## Local models with Ollama (and models on OpenShift AI)

For development, and for customers who cannot send data outside, a local model is mandatory. Ollama on the developer's machine:

```java
import dev.langchain4j.model.ollama.OllamaChatModel;

ChatModel localModel = OllamaChatModel.builder()
    .baseUrl("http://localhost:11434")
    .modelName("llama3.1")
    .temperature(0.0)
    .timeout(ofSeconds(120))
    .build();

String containerfile = localModel.chat("Generate a Containerfile for a Java 21 app on UBI 9");
```

In production on OpenShift, the model is usually served by OpenShift AI (KServe with vLLM), which exposes an OpenAI-compatible API. That means the same `langchain4j-open-ai` module works against the internal service; only `baseUrl` and the model name change. The application has no idea whether it is talking to OpenAI or to a Granite or Llama running in your cluster:

```java
ChatModel clusterModel = OpenAiChatModel.builder()
    .baseUrl("https://granite-predictor.ai-models.svc.cluster.local/v1")
    .apiKey(System.getenv("MODEL_API_KEY"))
    .modelName("granite-3-8b-instruct")
    .timeout(ofSeconds(90))
    .build();
```

This is what lets me run the same code in three environments: Ollama locally, OpenAI in a sandbox, OpenShift AI in production, changing only configuration.

## RAG with pgvector

RAG is still the use case I deploy most. In 1.x the ingestion flow was simplified with `EmbeddingStoreIngestor`, which chains splitting, embedding and storage.

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

// 1. Embedding model
EmbeddingModel embeddingModel = OpenAiEmbeddingModel.builder()
    .apiKey(System.getenv("OPENAI_API_KEY"))
    .modelName("text-embedding-3-small")
    .build();

// 2. Vector store on PostgreSQL with the pgvector extension
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

// 3. Ingest: load, split, embed and store
Document doc = loadDocument("docs/openshift-runbook.pdf", new ApachePdfBoxDocumentParser());

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

// 5. AI Service with RAG
interface RunbookAssistant {
    @SystemMessage("Answer only from the provided context. If it is not there, say so.")
    String answer(@UserMessage String question);
}

RunbookAssistant assistant = AiServices.builder(RunbookAssistant.class)
    .chatModel(model)
    .contentRetriever(retriever)
    .build();
```

Why pgvector and not a dedicated vector store: because the customer already has PostgreSQL in the cluster, already knows how to back it up, already monitors it, and already has a DBA who understands it. An extra Qdrant or Milvus is one more thing to operate. For most corporate RAG cases, pgvector is more than enough.

And a word on `minScore`: set it. Without a threshold the retriever always returns `maxResults` chunks even when none of them relate to the question, and the model hallucinates on irrelevant context.

## Tools / function calling

Tools are Java methods the model decides to invoke. The example I use most in demos for OpenShift customers: let the assistant inspect cluster state.

```java
import dev.langchain4j.agent.tool.P;
import dev.langchain4j.agent.tool.Tool;

class ClusterTools {

    private final KubernetesClient client;

    ClusterTools(KubernetesClient client) {
        this.client = client;
    }

    @Tool("Returns the pods that are not in Running state in a namespace")
    String unhealthyPods(@P("Namespace name") String namespace) {
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

ops.chat("Is anything broken in the payments namespace?");
```

Serious warning: a tool is code that runs with your application's permissions. In production I only expose read-only tools, and the pod's ServiceAccount has a Role with `get/list` and nothing else. I have never given an LLM a tool that can `delete`.

## Conversation memory

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

assistant.chat("user-123", "My name is Jean");
assistant.chat("user-123", "What's my name?"); // "Your name is Jean"
```

Note that the `chatMemoryProvider` creates a fresh memory per `sessionId`. The classic mistake in the original post was sharing one instance across all users. For memory that survives a pod restart, implement `ChatMemoryStore` against Redis or PostgreSQL; the in-memory `MessageWindowChatMemory` is lost on every deploy.

## Quarkus: the declarative way

In Quarkus I do not build models by hand. The `quarkus-langchain4j` extension creates them from `application.properties`, and AI Services are registered as CDI beans.

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

    @SystemMessage("You are an OpenShift operations assistant. Read-only.")
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

`${OPENAI_API_KEY}` and `${LLM_BASE_URL}` resolve from environment variables. That is what lets the same jar point at OpenAI in development and at OpenShift AI in production without a rebuild.

## Production on OpenShift

This is what separates a demo from something a customer signs off on.

### API keys as Secrets, never in code

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: llm-credentials
type: Opaque
stringData:
  OPENAI_API_KEY: "<injected by the pipeline or by External Secrets>"
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

At customers running Vault, the Secret is created by the External Secrets Operator or the Vault Agent Injector; the application never sees more than an environment variable. And keep `quarkus.langchain4j.openai.log-requests=false` in production: with request logging on, the full prompt (including user data) ends up in your logs.

### Retries, timeouts and rate limiting

The LLM provider is an external dependency that fails and that throttles you by quota. Two layers:

1. **Client-side retries** (`max-retries`) for transient errors: 429, 503, network timeouts. With exponential backoff, which is what LangChain4j applies by default.
2. **Service-level fault tolerance** with SmallRye Fault Tolerance, to shield your application from a degraded provider and to avoid burning through your quota during a spike.

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
        return "The assistant is unavailable right now. Please try again in a few minutes.";
    }
}
```

`@RateLimit` at 60 calls per minute is an example; tune it to the provider's real quota or to what your inference service on OpenShift AI can sustain. The `@Fallback` keeps a 429 from becoming a stack trace in the user's face. And `@Timeout` must exceed the LangChain4j client timeout multiplied by the number of retries, or you will cut retries off halfway.

### Observability

With Quarkus, OpenTelemetry instruments the HTTP calls to the provider automatically; the trace shows how long each inference takes. What I add by hand is a metric for tokens consumed per call (the `ChatResponse` exposes them through `tokenUsage()`), because that is what shows up on the invoice and it is the first thing finance will ask about.

## Conclusion

LangChain4j 1.x is the first version I recommend for production without caveats: the API has stabilised, AI Services with structured types turn the LLM into a testable Java function, and the Quarkus integration reduces setup to a properties file. What the library will not do for you, and where a consultant actually earns their keep, is everything around it: secrets out of the code, retries and rate limiting against the provider, read-only tools, and a model served inside the cluster when the data cannot leave. With that handled, Java is a perfectly serious place to build generative AI.
