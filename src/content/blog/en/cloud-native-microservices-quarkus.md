---
title: "Cloud Native Microservices with Quarkus"
description: "Develop ultra-fast and efficient Java microservices with Quarkus, the supersonic subatomic framework."
pubDate: 2026-01-15
tags: ["quarkus", "java", "microservices"]
categories: ["cloud-native"]
featured: true
image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&h=630&fit=crop"
lang: en
---

Quarkus has revolutionized Java development for the cloud. Learn to create efficient microservices that start in milliseconds.

## Why Quarkus?

- **Ultra-fast startup**: < 1 second on JVM, < 50ms native
- **Low memory consumption**: 10x less than traditional frameworks
- **Developer Joy**: Live reload, Dev Services, unified configuration
- **Kubernetes native**: Designed for containers

## Create a Quarkus Project

```bash
# Using CLI
quarkus create app com.example:my-service \
  --extension='resteasy-reactive-jackson,hibernate-orm-panache,jdbc-postgresql'

# Or using Maven
mvn io.quarkus.platform:quarkus-maven-plugin:create \
  -DprojectGroupId=com.example \
  -DprojectArtifactId=my-service
```

## REST API with RESTEasy Reactive

```java
@Path("/api/products")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ProductResource {

    @Inject
    ProductService productService;

    @GET
    public List<Product> list() {
        return productService.findAll();
    }

    @GET
    @Path("/{id}")
    public Product get(@PathParam("id") Long id) {
        return productService.findById(id)
            .orElseThrow(() -> new NotFoundException("Product not found"));
    }

    @POST
    @Transactional
    public Response create(Product product) {
        productService.persist(product);
        return Response.status(Status.CREATED)
            .entity(product)
            .build();
    }
}
```

## Persistence with Panache

```java
@Entity
public class Product extends PanacheEntity {

    public String name;
    public String description;
    public BigDecimal price;

    // Static query methods
    public static List<Product> findByName(String name) {
        return find("name like ?1", "%" + name + "%").list();
    }

    public static List<Product> findExpensive() {
        return find("price > ?1", new BigDecimal("100")).list();
    }
}
```

## Environment Configuration

```properties
# application.properties

# Development
%dev.quarkus.datasource.db-kind=h2
%dev.quarkus.datasource.jdbc.url=jdbc:h2:mem:devdb

# Production
%prod.quarkus.datasource.db-kind=postgresql
%prod.quarkus.datasource.jdbc.url=${DATABASE_URL}
%prod.quarkus.datasource.username=${DB_USER}
%prod.quarkus.datasource.password=${DB_PASSWORD}
```

## Service Communication

### REST Client

```java
@RegisterRestClient(configKey = "inventory-api")
@Path("/api/inventory")
public interface InventoryClient {

    @GET
    @Path("/{productId}")
    Inventory getStock(@PathParam("productId") Long productId);
}

// Usage
@Inject
@RestClient
InventoryClient inventoryClient;
```

### Messaging with Kafka

```java
@ApplicationScoped
public class OrderProcessor {

    @Incoming("orders")
    @Outgoing("confirmations")
    public Confirmation process(Order order) {
        // Process order
        return new Confirmation(order.getId(), "PROCESSED");
    }
}
```

## Health Checks and Metrics

```java
@Liveness
@ApplicationScoped
public class LivenessCheck implements HealthCheck {

    @Override
    public HealthCheckResponse call() {
        return HealthCheckResponse.up("alive");
    }
}

@Readiness
@ApplicationScoped
public class ReadinessCheck implements HealthCheck {

    @Inject
    DataSource dataSource;

    @Override
    public HealthCheckResponse call() {
        try (Connection conn = dataSource.getConnection()) {
            return HealthCheckResponse.up("database");
        } catch (SQLException e) {
            return HealthCheckResponse.down("database");
        }
    }
}
```

## Native Compilation with GraalVM

```bash
# Compile native image
./mvnw package -Pnative

# Run
./target/my-service-1.0.0-runner

# Startup time: ~20ms
# Memory: ~30MB
```

## Optimized Dockerfile

```dockerfile
FROM quay.io/quarkus/quarkus-micro-image:2.0

WORKDIR /work/
COPY target/*-runner /work/application

EXPOSE 8080
CMD ["./application", "-Dquarkus.http.host=0.0.0.0"]
```

## Conclusion

Quarkus represents the future of Java development in the cloud. Its efficiency, speed, and excellent developer experience make it the ideal choice for modern microservices.
