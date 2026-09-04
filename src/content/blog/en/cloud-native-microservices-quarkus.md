---
title: "Cloud Native Microservices with Quarkus"
description: "A practical guide to Quarkus 3.x on Java 21: Quarkus REST, virtual threads, Panache, Kafka, health checks and OpenShift deployment, with real production lessons."
pubDate: 2026-01-15
updatedDate: 2026-09-05
tags: ["quarkus", "java", "microservices", "java-21", "virtual-threads", "openshift"]
categories: ["cloud-native"]
featured: true
image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&h=630&fit=crop"
lang: en
---

I have spent the last several years helping banks, retailers and public sector teams move from Java EE and Spring monoliths to microservices on OpenShift, and Quarkus has become my default recommendation whenever the team already lives in the Java ecosystem. Not because it wins some benchmark, but because it solves concrete problems I keep running into in production: slow startups that break autoscaling, containers that need 1 GB of RAM to serve three endpoints, and development loops where every change costs a 40-second restart.

This is a full rewrite of the original article. A few important things changed since then: RESTEasy Reactive was renamed to **Quarkus REST**, Java 21 shipped **virtual threads**, and Quarkus integrated them natively. Throughout this post I will use **Quarkus 3.15+ (LTS stream)** and Java 21 as the reference, which is what I currently deploy at customers with Red Hat build of Quarkus.

## Why Quarkus (and when not to)

The classic arguments still hold:

- **Build-time processing**: Quarkus resolves dependency injection, annotation scanning and configuration during `package`, not at startup. That is why you get sub-second startup on the JVM and tens of milliseconds in native mode.
- **Memory footprint**: a typical service with REST, JPA and Kafka starts on the JVM with an RSS around 150-250 MB. The same service on Spring Boot usually lands between 350 and 500 MB. Across a cluster with 200 microservices, that difference is paid in nodes.
- **Developer joy**: `quarkus dev` with live reload, Dev Services that spin up PostgreSQL or Kafka in containers with zero configuration, and a Dev UI to inspect beans, config and endpoints.
- **Born for Kubernetes**: the `quarkus-kubernetes` and `quarkus-openshift` extensions generate manifests, health checks are built in, and configuration is designed around ConfigMaps and Secrets.

Now the honest part. Spring Boot 3.x closed much of the gap: it supports virtual threads with a single property, compiles to native with GraalVM, and has a far larger ecosystem of libraries and of people who know it. If a customer has 80 developers trained on Spring, migrating them to Quarkus "because it starts faster" is a mistake I have watched fail. Quarkus clearly wins when:

- Infrastructure cost per service matters (many small services, scale-to-zero, serverless with Knative).
- The team is new or willing to learn a slightly different programming model.
- You need MicroProfile (Health, Config, Fault Tolerance, OpenTelemetry) with enterprise support from Red Hat.

## Creating the project

Since Quarkus 3.9 the REST extension is called `quarkus-rest`. The old `quarkus-resteasy-reactive-*` artifacts still work as relocations, but new projects should use the current names:

```bash
# With the Quarkus CLI
quarkus create app com.example:catalog-service \
  --extension='rest-jackson,hibernate-orm-panache,jdbc-postgresql,smallrye-health,micrometer-registry-prometheus'

# With Maven
mvn io.quarkus.platform:quarkus-maven-plugin:3.15.1:create \
  -DprojectGroupId=com.example \
  -DprojectArtifactId=catalog-service \
  -Dextensions='rest-jackson,hibernate-orm-panache,jdbc-postgresql,smallrye-health,micrometer-registry-prometheus'
```

Pin Java 21 in your `pom.xml`:

```xml
<properties>
    <maven.compiler.release>21</maven.compiler.release>
    <quarkus.platform.version>3.15.1</quarkus.platform.version>
</properties>
```

If you need a REST client, the matching artifact is `quarkus-rest-client-jackson` (formerly `quarkus-rest-client-reactive-jackson`).

## REST API with Quarkus REST

Quarkus REST is the Jakarta REST implementation Quarkus builds on top of Vert.x. The difference from classic RESTEasy is not just the name: it processes annotations at build time (no runtime reflection) and decides which thread runs each endpoint based on its signature.

```java
package com.example.catalog;

import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.net.URI;
import java.util.List;

@Path("/api/products")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ProductResource {

    @Inject
    ProductService productService;

    @GET
    public List<ProductDto> list(@QueryParam("page") @DefaultValue("0") int page,
                                 @QueryParam("size") @DefaultValue("20") int size) {
        return productService.findAll(page, size);
    }

    @GET
    @Path("/{id}")
    public ProductDto get(@PathParam("id") Long id) {
        return productService.findById(id)
            .orElseThrow(() -> new NotFoundException("Product %d not found".formatted(id)));
    }

    @POST
    @Transactional
    public Response create(@Valid CreateProductRequest request) {
        ProductDto created = productService.create(request);
        return Response.created(URI.create("/api/products/" + created.id()))
            .entity(created)
            .build();
    }
}
```

Something that surprises people coming from Spring: there is no `@RestController` or `@Autowired` here. These are standard Jakarta REST and CDI annotations, which makes it straightforward to move code between Quarkus, WildFly or any other Jakarta EE runtime.

### Which thread runs your endpoint

This is the single most confusing point and the root cause of most performance incidents I have had to diagnose:

- If the method returns a **reactive** type (`Uni<T>`, `Multi<T>`, `CompletionStage<T>`), Quarkus REST runs it on the Vert.x **event loop**. You must never block there.
- If it returns a **plain** type (`ProductDto`, `List<T>`, `Response`), it runs on a platform **worker thread**. You can block on JDBC, synchronous HTTP clients, and so on.
- With `@RunOnVirtualThread` it runs on a **virtual thread**. You can block, and it is cheap.

You can override this with `@Blocking` and `@NonBlocking`, but in my experience the cleanest approach is to let the method signature declare it explicitly.

## Java 21 and virtual threads in Quarkus

Virtual threads (JEP 444, final in Java 21) are threads scheduled by the JVM rather than the operating system. Creating a million of them is feasible; they are mounted on a small pool of carrier threads, and when one blocks on I/O the JVM unmounts it and hands the carrier to someone else.

For Quarkus this opens up a very attractive middle path: write imperative, blocking, readable code and get scalability close to the reactive model.

### Enabling them

All you need is Java 21 and the `@RunOnVirtualThread` annotation on the method or class:

```java
package com.example.catalog;

import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import org.eclipse.microprofile.rest.client.inject.RestClient;

@Path("/api/products")
public class ProductAvailabilityResource {

    @Inject
    ProductService productService;

    @Inject
    @RestClient
    InventoryClient inventoryClient;

    @GET
    @Path("/{id}/availability")
    @RunOnVirtualThread
    public AvailabilityDto availability(@PathParam("id") Long id) {
        // Two blocking calls (JDBC + HTTP) written sequentially.
        // Each request owns a virtual thread; while it waits on I/O, the carrier is free.
        ProductDto product = productService.findById(id)
            .orElseThrow(NotFoundException::new);
        Inventory stock = inventoryClient.getStock(product.sku());
        return new AvailabilityDto(product.id(), stock.quantity() > 0, stock.quantity());
    }
}
```

No changes to `application.properties` are required. The annotation is also supported on gRPC services, Reactive Messaging (`@Incoming`), the scheduler and Vert.x event bus consumers.

To fan out inside a virtual thread, the natural fit is a virtual-thread-per-task executor:

```java
@GET
@Path("/{id}/summary")
@RunOnVirtualThread
public ProductSummary summary(@PathParam("id") Long id) throws Exception {
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
        Future<ProductDto> product = executor.submit(() -> productService.get(id));
        Future<List<Review>> reviews = executor.submit(() -> reviewClient.forProduct(id));
        Future<Inventory> stock = executor.submit(() -> inventoryClient.getStock(id));
        return new ProductSummary(product.get(), reviews.get(), stock.get());
    }
}
```

### Virtual threads vs Mutiny: picking the right one

Having shipped both models to production, this is my working rule:

| Scenario | Recommendation |
|---|---|
| CRUD over JDBC, orchestrating REST calls, multi-step business logic | Virtual threads. Flat code, readable stack traces, easy to debug. |
| Streaming (SSE, WebSockets), real backpressure, Kafka event pipelines with transformations | Mutiny (`Uni`/`Multi`). The reactive model expresses the flow far better. |
| Services with hundreds of thousands of concurrent connections and critical latency | Pure reactive on the event loop. Virtual thread scheduling overhead is measurable here. |
| Team with no reactive programming experience | Virtual threads, no question. A badly chained `Uni` in production is expensive. |

The real trade-offs you should understand before slapping `@RunOnVirtualThread` on everything:

1. **Pinning**. If a virtual thread blocks inside a `synchronized` block or a native call, it stays pinned to its carrier and the carrier is not released. Many older libraries (JDBC drivers, legacy HTTP clients) use `synchronized` internally. Java 24 fixed the `synchronized` case with JEP 491, but on Java 21 it remains a risk. Quarkus ships the `quarkus-junit5-virtual-threads` extension with `@ShouldNotPin` to catch it in tests, and `-Djdk.tracePinnedThreads=full` to see it at runtime.
2. **Monopolization**. A virtual thread doing CPU-intensive work never yields its carrier. If all your endpoints are CPU-bound, virtual threads bring nothing and the traditional worker pool is the better choice.
3. **Connection pools**. This is the most expensive lesson I have learned. With virtual threads you can have 10,000 requests in flight, but your Agroal pool still has 20 connections. The bottleneck simply moves to the pool and acquisition timeouts start showing up. Size `quarkus.datasource.jdbc.max-size` according to what PostgreSQL can actually sustain, and put a concurrency limit on the endpoint (`@Bulkhead` from SmallRye Fault Tolerance) so you do not drown it.
4. **ThreadLocal and context**. Libraries that cache heavy objects in `ThreadLocal` (certain formatters or clients, for instance) stop making sense with millions of short-lived threads. Quarkus propagates CDI and request context correctly, but your own code abusing `ThreadLocal` can blow up memory.

My takeaway: for roughly 80% of the enterprise services I see (APIs talking to a database and two or three other services), `@RunOnVirtualThread` gives the best balance of performance and maintainability. I keep Mutiny for the components where the data flow itself is the problem to solve.

## Persistence with Panache

Panache removes repository boilerplate without hiding JPA. On Java 21 I prefer the repository pattern with records as DTOs, which pairs well with virtual threads (entities never leave the service layer):

```java
@Entity
@Table(name = "products")
public class Product extends PanacheEntity {

    @Column(nullable = false)
    public String sku;

    @Column(nullable = false)
    public String name;

    public String description;

    @Column(nullable = false, precision = 12, scale = 2)
    public BigDecimal price;

    public static Optional<Product> findBySku(String sku) {
        return find("sku", sku).firstResultOptional();
    }

    public static List<Product> findPriceAbove(BigDecimal threshold, Page page) {
        return find("price > ?1", Sort.by("price").descending(), threshold)
            .page(page)
            .list();
    }
}

public record ProductDto(Long id, String sku, String name, BigDecimal price) {
    static ProductDto from(Product p) {
        return new ProductDto(p.id, p.sku, p.name, p.price);
    }
}
```

Two production tips:

- Panache with Hibernate ORM is blocking and works perfectly with virtual threads. Hibernate Reactive exists, but I only recommend it when the whole service is reactive; mixing both in one project is a source of subtle bugs.
- Use `quarkus.hibernate-orm.database.generation=none` in production and manage the schema with Flyway (`quarkus-flyway`). I have seen too many environments where `update` left orphaned columns around for months.

## Environment configuration

Quarkus unifies all configuration in `application.properties` with profiles. Dev Services means that in `%dev` and `%test` you do not configure the database at all: Quarkus starts a PostgreSQL container automatically.

```properties
# Database: in dev and test, Dev Services (Testcontainers) provides it
quarkus.datasource.db-kind=postgresql
quarkus.hibernate-orm.database.generation=none
quarkus.flyway.migrate-at-start=true

# Production: everything comes from env vars injected by OpenShift Secrets
%prod.quarkus.datasource.jdbc.url=${DATABASE_URL}
%prod.quarkus.datasource.username=${DATABASE_USER}
%prod.quarkus.datasource.password=${DATABASE_PASSWORD}
%prod.quarkus.datasource.jdbc.max-size=30
%prod.quarkus.datasource.jdbc.acquisition-timeout=5S

# REST client
quarkus.rest-client.inventory-api.url=${INVENTORY_API_URL:http://inventory:8080}
quarkus.rest-client.inventory-api.connect-timeout=2000
quarkus.rest-client.inventory-api.read-timeout=5000

# Observability
quarkus.micrometer.export.prometheus.path=/q/metrics
quarkus.otel.exporter.otlp.endpoint=${OTEL_COLLECTOR_URL:http://localhost:4317}
```

Credentials never live in the file. On OpenShift the variables come from a `Secret` mounted into the Deployment, and the `quarkus-kubernetes-config` extension can additionally read ConfigMaps and Secrets straight from the API.

## Service-to-service communication

### REST Client

The MicroProfile REST client is declared as an interface. With Quarkus REST Client, the same client works in blocking mode (ideal with virtual threads) or returning `Uni`:

```java
@RegisterRestClient(configKey = "inventory-api")
@Path("/api/inventory")
public interface InventoryClient {

    @GET
    @Path("/{sku}")
    @Retry(maxRetries = 2, delay = 200)
    @Timeout(3000)
    @CircuitBreaker(requestVolumeThreshold = 10, failureRatio = 0.5, delay = 10_000)
    Inventory getStock(@PathParam("sku") String sku);
}
```

The SmallRye Fault Tolerance annotations (`@Retry`, `@Timeout`, `@CircuitBreaker`, `@Bulkhead`) are the first thing I add to any client that crosses a network boundary. A service without a circuit breaker in front of a slow dependency is the fastest way to turn a degradation into a cascading outage.

### Messaging with Kafka

With SmallRye Reactive Messaging and Red Hat Streams for Apache Kafka (Strimzi) in the cluster:

```java
@ApplicationScoped
public class OrderProcessor {

    @Inject
    ProductService productService;

    @Incoming("orders")
    @Outgoing("order-confirmations")
    @RunOnVirtualThread
    public OrderConfirmation process(Order order) {
        // Blocking logic (JDBC) on a virtual thread; the Kafka consumer is never blocked
        productService.reserve(order.items());
        return new OrderConfirmation(order.id(), OrderStatus.RESERVED);
    }
}
```

```properties
kafka.bootstrap.servers=${KAFKA_BOOTSTRAP_SERVERS}
mp.messaging.incoming.orders.connector=smallrye-kafka
mp.messaging.incoming.orders.topic=orders
mp.messaging.incoming.orders.group.id=catalog-service
mp.messaging.incoming.orders.failure-strategy=dead-letter-queue
mp.messaging.outgoing.order-confirmations.connector=smallrye-kafka
mp.messaging.outgoing.order-confirmations.topic=order-confirmations
```

Always configure `failure-strategy`. The default (`fail`) stops the consumer on the first message that throws, and it is a classic 3 a.m. incident.

## Health checks and metrics

OpenShift uses liveness, readiness and startup probes to decide when to route traffic and when to restart a pod. Quarkus exposes them under `/q/health/*` via `quarkus-smallrye-health`:

```java
@Readiness
@ApplicationScoped
public class DatabaseReadinessCheck implements HealthCheck {

    @Inject
    DataSource dataSource;

    @Override
    public HealthCheckResponse call() {
        try (Connection conn = dataSource.getConnection();
             Statement st = conn.createStatement()) {
            st.execute("SELECT 1");
            return HealthCheckResponse.up("database");
        } catch (SQLException e) {
            return HealthCheckResponse.named("database")
                .down()
                .withData("error", e.getMessage())
                .build();
        }
    }
}
```

Important rule: liveness must **not** depend on the database or on external services. If the database goes down and liveness fails, Kubernetes will restart all your pods in a loop without fixing anything. Leave liveness on the Quarkus default and put dependencies under readiness.

For metrics, `quarkus-micrometer-registry-prometheus` exposes `/q/metrics` with HTTP latency histograms, JVM, connection pool and Kafka metrics without writing a single line. That is what OpenShift's User Workload Monitoring Prometheus scrapes through a `ServiceMonitor`.

## Deploying to OpenShift

The `quarkus-openshift` extension generates the manifests and can deploy directly using an S2I or binary build:

```properties
quarkus.openshift.deploy=true
quarkus.openshift.route.expose=true
quarkus.openshift.replicas=2
quarkus.openshift.resources.requests.memory=256Mi
quarkus.openshift.resources.requests.cpu=250m
quarkus.openshift.resources.limits.memory=512Mi
quarkus.openshift.env.secrets=catalog-db-credentials
quarkus.openshift.annotations."prometheus.io/scrape"=true
```

```bash
./mvnw clean package -Dquarkus.openshift.deploy=true
```

For the container image I prefer Red Hat UBI base images, which are the ones the customer can get support for:

```dockerfile
FROM registry.access.redhat.com/ubi9/openjdk-21-runtime:latest

ENV LANGUAGE='en_US:en'
COPY --chown=185 target/quarkus-app/lib/ /deployments/lib/
COPY --chown=185 target/quarkus-app/*.jar /deployments/
COPY --chown=185 target/quarkus-app/app/ /deployments/app/
COPY --chown=185 target/quarkus-app/quarkus/ /deployments/quarkus/

EXPOSE 8080
USER 185
ENV JAVA_OPTS_APPEND="-Dquarkus.http.host=0.0.0.0 -Djava.util.logging.manager=org.jboss.logmanager.LogManager"
ENV JAVA_APP_JAR="/deployments/quarkus-run.jar"
```

## Native compilation: when it is worth it

```bash
# Native build inside a container (no local GraalVM needed)
./mvnw package -Dnative -Dquarkus.native.container-build=true

# Minimal final image
FROM quay.io/quarkus/quarkus-micro-image:2.0
COPY --chown=1001:root target/*-runner /work/application
EXPOSE 8080
USER 1001
CMD ["./application", "-Dquarkus.http.host=0.0.0.0"]
```

The native binary starts in tens of milliseconds and uses a fraction of the JVM's memory. It is ideal for serverless (Knative), jobs and CLIs. Before rolling it out across the organization, keep in mind:

- The build takes several minutes and needs a lot of RAM (typically 4-8 GB in the pipeline).
- Sustained throughput on the JVM with JIT is usually higher than native for long-running services.
- Any library using unregistered reflection fails at runtime, not at compile time. Integration tests with `@QuarkusIntegrationTest` against the native binary are mandatory.

At most customers we end up with the JVM for core services and native for functions and short-lived jobs.

## Conclusion

Quarkus 3.x on Java 21 gives me the combination I have wanted for years: an imperative, readable programming model thanks to virtual threads, fast startup and a contained memory footprint, Jakarta EE and MicroProfile standards, and first-class integration with OpenShift. It is not the only valid option and Spring Boot remains a perfectly reasonable choice in many organizations, but if infrastructure cost per service and development speed weigh on your decision, it is well worth trying on a real service before you decide.
