---
title: "LangChain4j: IA generativa para desarrolladores Java"
description: "Integra modelos de lenguaje y construye aplicaciones de IA en Java usando LangChain4j con ejemplos prácticos."
pubDate: 2026-01-19
tags: ["ia", "langchain4j", "java", "llm"]
categories: ["ia"]
featured: true
image: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=630&fit=crop"
lang: es
---

LangChain4j trae el poder de los LLMs al ecosistema Java. Aprende a construir aplicaciones de IA generativa de forma sencilla y efectiva.

## ¿Qué es LangChain4j?

LangChain4j es un framework Java que simplifica la integración con modelos de lenguaje:

- **Abstracción de modelos**: OpenAI, Ollama, Azure, Anthropic, etc.
- **RAG integrado**: Embeddings y vector stores
- **Agentes**: Tools y function calling
- **Memoria**: Conversaciones con contexto

## Configuración inicial

```xml
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j</artifactId>
    <version>0.27.0</version>
</dependency>

<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-open-ai</artifactId>
    <version>0.27.0</version>
</dependency>
```

## Primer chat con OpenAI

```java
ChatLanguageModel model = OpenAiChatModel.builder()
    .apiKey(System.getenv("OPENAI_API_KEY"))
    .modelName("gpt-4")
    .temperature(0.7)
    .build();

String response = model.generate("Explica Kubernetes en 3 frases");
System.out.println(response);
```

## AI Services: La forma idiomática

```java
interface Assistant {

    @SystemMessage("Eres un experto en DevOps y Cloud Native")
    String chat(String userMessage);

    @SystemMessage("Resume el siguiente texto en máximo 3 puntos")
    String summarize(@UserMessage String text);
}

// Crear instancia
Assistant assistant = AiServices.create(Assistant.class, model);

// Usar
String response = assistant.chat("¿Cuándo usar Kubernetes vs Docker Compose?");
```

## Modelos locales con Ollama

```java
ChatLanguageModel localModel = OllamaChatModel.builder()
    .baseUrl("http://localhost:11434")
    .modelName("llama3")
    .temperature(0.0)
    .build();

// Ideal para desarrollo y datos sensibles
String response = localModel.generate("Genera un Dockerfile para Java 21");
```

## RAG: Retrieval Augmented Generation

```java
// 1. Crear embedding model
EmbeddingModel embeddingModel = OpenAiEmbeddingModel.builder()
    .apiKey(apiKey)
    .modelName("text-embedding-3-small")
    .build();

// 2. Vector store (en memoria o PostgreSQL)
EmbeddingStore<TextSegment> store = new InMemoryEmbeddingStore<>();

// 3. Cargar documentos
DocumentParser parser = new TextDocumentParser();
Document doc = FileSystemDocumentLoader.loadDocument("docs/manual.pdf", parser);

// 4. Dividir en chunks
DocumentSplitter splitter = DocumentSplitters.recursive(500, 50);
List<TextSegment> segments = splitter.split(doc);

// 5. Generar embeddings y almacenar
List<Embedding> embeddings = embeddingModel.embedAll(segments).content();
store.addAll(embeddings, segments);

// 6. Crear retriever
ContentRetriever retriever = EmbeddingStoreContentRetriever.builder()
    .embeddingStore(store)
    .embeddingModel(embeddingModel)
    .maxResults(3)
    .build();

// 7. AI Service con RAG
interface KnowledgeAssistant {
    String answer(String question);
}

KnowledgeAssistant assistant = AiServices.builder(KnowledgeAssistant.class)
    .chatLanguageModel(model)
    .contentRetriever(retriever)
    .build();
```

## Function Calling / Tools

```java
class WeatherTool {

    @Tool("Obtiene el clima actual de una ciudad")
    String getWeather(@P("Nombre de la ciudad") String city) {
        // Llamar a API de clima
        return weatherService.getCurrentWeather(city);
    }
}

interface WeatherAssistant {
    String chat(String message);
}

WeatherAssistant assistant = AiServices.builder(WeatherAssistant.class)
    .chatLanguageModel(model)
    .tools(new WeatherTool())
    .build();

// El modelo puede llamar a getWeather automáticamente
assistant.chat("¿Qué tiempo hace en Madrid?");
```

## Memoria de conversación

```java
ChatMemory memory = MessageWindowChatMemory.withMaxMessages(20);

interface ConversationalAssistant {
    String chat(@MemoryId String sessionId, String message);
}

ConversationalAssistant assistant = AiServices.builder(ConversationalAssistant.class)
    .chatLanguageModel(model)
    .chatMemoryProvider(memoryId -> memory)
    .build();

// Mantiene contexto entre mensajes
assistant.chat("user-123", "Mi nombre es Juan");
assistant.chat("user-123", "¿Cómo me llamo?"); // "Te llamas Juan"
```

## Integración con Quarkus

```java
@ApplicationScoped
public class AiConfig {

    @Produces
    @ApplicationScoped
    ChatLanguageModel chatModel() {
        return OpenAiChatModel.builder()
            .apiKey(ConfigProvider.getConfig().getValue("openai.api-key", String.class))
            .build();
    }
}

@Path("/api/chat")
public class ChatResource {

    @Inject
    ChatLanguageModel model;

    @POST
    public String chat(String message) {
        return model.generate(message);
    }
}
```

## Conclusión

LangChain4j democratiza el acceso a la IA generativa para desarrolladores Java. Con su API intuitiva y soporte para múltiples proveedores, es la herramienta ideal para construir aplicaciones inteligentes en el ecosistema Java.
