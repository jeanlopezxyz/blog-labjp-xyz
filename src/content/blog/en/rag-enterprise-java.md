---
title: "Enterprise RAG in Java: From Theory to Production"
description: "Build robust RAG systems for enterprise environments using Java, pgvector, and local models."
pubDate: 2026-09-05
updatedDate: 2026-09-05
tags: ["ai", "rag", "java", "enterprise"]
categories: ["ia"]
featured: true
image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&h=630&fit=crop"
lang: en
---

RAG (Retrieval Augmented Generation) enables LLMs to answer questions using your own data. In this article we walk through how to implement an enterprise-grade solution in Java, from the theory to the decisions that actually matter once the system reaches production.

## Why RAG?

LLMs have important limitations:

- **Static knowledge**: They don't know your internal data
- **Hallucinations**: They make up information when they don't know
- **No updates**: Their knowledge has a cutoff date

RAG solves these problems by connecting the LLM to your knowledge base. Instead of retraining or fine-tuning every time a document changes, you retrieve the relevant fragments at query time and hand them to the model as context.

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
- **PostgreSQL + pgvector (0.7+)**: Scalable vector store. Starting with the 0.7 series, pgvector brought relevant improvements to HNSW indexes and support for more compact vector types (`halfvec`), which are what make the enterprise scenario described here viable.
- **Quarkus**: Cloud-native framework
- **Ollama**: Local models (privacy)

Choosing pgvector over a dedicated vector database is not accidental: in most organizations I work with, PostgreSQL already exists, someone already operates it, backups already exist and so does HA. Adding an extension is far cheaper operationally than introducing a new component with its own lifecycle.

## pgvector Setup

```sql
-- Enable extension (requires pgvector 0.7 or later)
CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings table
CREATE TABLE document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    metadata JSONB,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW()
);

-- HNSW index: the default choice for query-heavy workloads
CREATE INDEX ON document_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

## Performance: HNSW vs IVFFlat

This is where I have most often seen RAG projects fail when moving from demo to production. pgvector offers two approximate (ANN) index types, and the decision directly affects latency, precision and ingestion cost.

### IVFFlat

Splits the vector space into `lists` clusters and, on each query, only explores the `probes` closest clusters.

- **Build**: fast and memory-light.
- **Requirement**: it needs existing data to compute centroids. If you create the index on an empty table, or before a bulk load, the clusters end up poorly distributed and recall degrades.
- **Query**: the trade-off is controlled via `ivfflat.probes`. Few probes means fast queries with more false negatives; many probes approaches a sequential scan.
- **When to use it**: relatively static datasets where you can rebuild the index after each load, or environments with very constrained memory.

### HNSW

Builds a hierarchical graph of nearest neighbors. It needs no prior training and can be created on an empty table.

- **Build**: slower and more memory-hungry than IVFFlat. For large initial loads, raise `maintenance_work_mem` and, if your version supports it, take advantage of parallel index builds.
- **Query**: better speed/recall ratio than IVFFlat for the same target latency. The `hnsw.ef_search` parameter controls how many candidates are explored; raising it improves precision at the cost of latency.
- **Incremental inserts**: the graph holds up well under continuous inserts, which is the usual pattern for an enterprise knowledge base updated daily.
- **When to use it**: almost always when query volume matters more than ingestion time. It is my default.

### How to Decide

| Criterion | IVFFlat | HNSW |
|-----------|---------|------|
| Build time | Lower | Higher |
| Index memory | Lower | Higher |
| Recall at fixed latency | Lower | Higher |
| Index on empty table | Not recommended | Yes |
| Continuous inserts | Requires periodic reindex | Holds up well |

I will not give absolute numbers because they depend on the embedding model, dimensionality, hardware and the distribution of your data. What I do recommend is measuring recall against an exact search (no index) over a set of real queries from your domain before locking in parameters. In pgvector you can do this with `SET enable_indexscan = off` in a test session and compare the top-k results.

### Other Production Considerations

- **Dimensionality**: 1536 dimensions is the size of OpenAI embeddings; local models usually use 384, 768 or 1024. Fewer dimensions means smaller indexes and faster queries. Choose the embedding model with this in mind too.
- **Metadata filtering**: if you filter by `metadata->>'tenant'` alongside the vector search, the planner may decide not to use the ANN index. For high-volume multi-tenant scenarios, consider partitioning the table by tenant or creating partial indexes.
- **Distance**: use the operator that matches the model. Most embedding models are designed for cosine similarity (`vector_cosine_ops`); if you normalize the vectors, inner product (`vector_ip_ops`) yields the same ranking and is slightly cheaper.
- **Vacuum and bloat**: tables with frequent inserts and deletes accumulate bloat quickly. Configure autovacuum aggressively for this table.

## Implementation with LangChain4j

### EmbeddingStore Configuration

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

Credentials always come from external configuration (Kubernetes Secret, Vault, environment variables). Never in code.

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

Chunk size is one of the most underrated levers. Very small chunks lose context; very large chunks dilute the embedding signal and eat into the model's window. For technical documentation with clear structure (manuals, runbooks), splitting by section before applying the recursive splitter usually beats a fixed size.

### 2. Enriched Metadata

```java
TextSegment segment = TextSegment.from(
    content,
    Metadata.from("source", "manual-v2.pdf")
        .add("page", "15")
        .add("section", "Configuration")
);
```

Metadata is not only for citing sources: it is what lets you filter by tenant, validity date or confidentiality level before the fragment ever reaches the model.

### 3. Reranking

```java
ContentRetriever retriever = EmbeddingStoreContentRetriever.builder()
    .embeddingStore(store)
    .embeddingModel(embeddingModel)
    .maxResults(20)  // Fetch more
    .build();

// Reranker narrows down to the most relevant
Reranker reranker = CohereReranker.builder()
    .apiKey(cohereApiKey)
    .build();
```

Vector search is good at retrieving candidates but not as good at ordering them. A reranker (cross-encoder) evaluates each question-fragment pair with more precision. If you cannot send data to an external service, there are reranking models you can serve locally with the same privacy approach as Ollama.

### 4. Semantic Cache

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

Mind the threshold: 0.95 is deliberately conservative. A semantic cache that is too permissive returns answers to questions that are similar but not the same, and that kind of error is hard to detect in production.

### 5. Continuous Evaluation

A RAG system without evaluation is a system that degrades silently. Keep a set of questions with expected answers from your domain and run it on every change of embedding model, index parameters or chunking strategy. You do not need a sophisticated framework to start: an integration test with Testcontainers spinning up PostgreSQL with pgvector and checking that the top-k contains the right fragment already catches most regressions.

## REST API

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

## Conclusion

RAG transforms LLMs from curiosities into real enterprise tools. With Java, pgvector, and LangChain4j, you can build robust systems that respect your data privacy and scale with your organization. The difference between a demo and a production system is not the LLM: it is the index you chose, how you split the documents, and whether you have a way to know when answer quality starts to drop.
