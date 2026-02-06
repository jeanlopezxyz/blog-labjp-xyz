---
title: "Enterprise RAG in Java: From Theory to Production"
description: "Build robust RAG systems for enterprise environments using Java, pgvector, and local models."
pubDate: 2026-01-20
tags: ["ai", "rag", "java", "enterprise"]
categories: ["ia"]
featured: true
image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&h=630&fit=crop"
lang: en
---

RAG (Retrieval Augmented Generation) enables LLMs to answer questions using your own data. Learn how to implement enterprise-grade solutions in Java.

## Why RAG?

LLMs have important limitations:

- **Static knowledge**: They don't know your internal data
- **Hallucinations**: They make up information when they don't know
- **No updates**: Their knowledge has a cutoff date

RAG solves these problems by connecting the LLM to your knowledge base.

## RAG Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│     User     │────▶│   Retriever  │────▶│ Vector Store │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │
       │                    ▼
       │            ┌──────────────┐
       │            │   Relevant   │
       │            │  Documents   │
       │            └──────────────┘
       │                    │
       ▼                    ▼
┌──────────────────────────────────┐
│              LLM                  │
│   (question + context)           │
└──────────────────────────────────┘
                │
                ▼
        ┌──────────────┐
        │   Grounded   │
        │   Response   │
        └──────────────┘
```

## Tech Stack

- **LangChain4j**: AI framework for Java
- **PostgreSQL + pgvector**: Scalable vector store
- **Quarkus**: Cloud-native framework
- **Ollama**: Local models (privacy)

## pgvector Setup

```sql
-- Enable extension
CREATE EXTENSION vector;

-- Embeddings table
CREATE TABLE document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    metadata JSONB,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for efficient search
CREATE INDEX ON document_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

## Implementation with LangChain4j

### EmbeddingStore Configuration

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

### Document Ingestion

```java
@ApplicationScoped
public class DocumentIngestionService {

    @Inject
    EmbeddingStore<TextSegment> store;

    @Inject
    EmbeddingModel embeddingModel;

    public void ingest(Path documentPath) {
        // 1. Load document
        Document document = FileSystemDocumentLoader.loadDocument(
            documentPath,
            new ApachePdfBoxDocumentParser()
        );

        // 2. Split into chunks
        DocumentSplitter splitter = DocumentSplitters.recursive(
            500,   // max chunk size
            50     // overlap
        );
        List<TextSegment> segments = splitter.split(document);

        // 3. Generate embeddings
        List<Embedding> embeddings = embeddingModel.embedAll(segments).content();

        // 4. Store
        store.addAll(embeddings, segments);
    }
}
```

### RAG Service

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
            You are an expert assistant. Answer ONLY based on the provided context.
            If you don't find the information, say "I don't have information about that".
            Cite sources when possible.
            """)
        String answer(@UserMessage String question);
    }
}
```

## Production Improvements

### 1. Smart Chunking

```java
DocumentSplitter splitter = DocumentSplitters.recursive(
    500,
    50,
    new OpenAiTokenizer("gpt-4")  // Count real tokens
);
```

### 2. Enriched Metadata

```java
TextSegment segment = TextSegment.from(
    content,
    Metadata.from("source", "manual-v2.pdf")
        .add("page", "15")
        .add("section", "Configuration")
);
```

## Conclusion

RAG transforms LLMs from curiosities into real enterprise tools. With Java, pgvector, and LangChain4j, you can build robust systems that respect your data privacy and scale with your organization.
