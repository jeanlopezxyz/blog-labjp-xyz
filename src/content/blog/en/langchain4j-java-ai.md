---
title: "LangChain4j: Generative AI for Java Developers"
description: "Integrate language models and build AI applications in Java using LangChain4j with practical examples."
pubDate: 2026-01-19
tags: ["ai", "langchain4j", "java", "llm"]
categories: ["ia"]
featured: true
image: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=630&fit=crop"
lang: en
---

LangChain4j brings the power of LLMs to the Java ecosystem. Learn to build generative AI applications simply and effectively.

## What is LangChain4j?

LangChain4j is a Java framework that simplifies integration with language models:

- **Model abstraction**: OpenAI, Ollama, Azure, Anthropic, etc.
- **Built-in RAG**: Embeddings and vector stores
- **Agents**: Tools and function calling
- **Memory**: Conversations with context

## Initial Setup

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

## First Chat with OpenAI

```java
ChatLanguageModel model = OpenAiChatModel.builder()
    .apiKey(System.getenv("OPENAI_API_KEY"))
    .modelName("gpt-4")
    .temperature(0.7)
    .build();

String response = model.generate("Explain Kubernetes in 3 sentences");
System.out.println(response);
```

## AI Services: The Idiomatic Way

```java
interface Assistant {

    @SystemMessage("You are an expert in DevOps and Cloud Native")
    String chat(String userMessage);

    @SystemMessage("Summarize the following text in maximum 3 points")
    String summarize(@UserMessage String text);
}

// Create instance
Assistant assistant = AiServices.create(Assistant.class, model);

// Use
String response = assistant.chat("When to use Kubernetes vs Docker Compose?");
```

## Local Models with Ollama

```java
ChatLanguageModel localModel = OllamaChatModel.builder()
    .baseUrl("http://localhost:11434")
    .modelName("llama3")
    .temperature(0.0)
    .build();

// Ideal for development and sensitive data
String response = localModel.generate("Generate a Dockerfile for Java 21");
```

## RAG: Retrieval Augmented Generation

```java
// 1. Create embedding model
EmbeddingModel embeddingModel = OpenAiEmbeddingModel.builder()
    .apiKey(apiKey)
    .modelName("text-embedding-3-small")
    .build();

// 2. Vector store (in-memory or PostgreSQL)
EmbeddingStore<TextSegment> store = new InMemoryEmbeddingStore<>();

// 3. Load documents
DocumentParser parser = new TextDocumentParser();
Document doc = FileSystemDocumentLoader.loadDocument("docs/manual.pdf", parser);

// 4. Split into chunks
DocumentSplitter splitter = DocumentSplitters.recursive(500, 50);
List<TextSegment> segments = splitter.split(doc);

// 5. Generate embeddings and store
List<Embedding> embeddings = embeddingModel.embedAll(segments).content();
store.addAll(embeddings, segments);

// 6. Create retriever
ContentRetriever retriever = EmbeddingStoreContentRetriever.builder()
    .embeddingStore(store)
    .embeddingModel(embeddingModel)
    .maxResults(3)
    .build();

// 7. AI Service with RAG
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

    @Tool("Gets the current weather for a city")
    String getWeather(@P("City name") String city) {
        // Call weather API
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

// The model can call getWeather automatically
assistant.chat("What's the weather in Madrid?");
```

## Conversation Memory

```java
ChatMemory memory = MessageWindowChatMemory.withMaxMessages(20);

interface ConversationalAssistant {
    String chat(@MemoryId String sessionId, String message);
}

ConversationalAssistant assistant = AiServices.builder(ConversationalAssistant.class)
    .chatLanguageModel(model)
    .chatMemoryProvider(memoryId -> memory)
    .build();

// Maintains context between messages
assistant.chat("user-123", "My name is John");
assistant.chat("user-123", "What's my name?"); // "Your name is John"
```

## Integration with Quarkus

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

## Conclusion

LangChain4j democratizes access to generative AI for Java developers. With its intuitive API and support for multiple providers, it's the ideal tool for building intelligent applications in the Java ecosystem.
