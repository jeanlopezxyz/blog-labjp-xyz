---
title: "Microservicios Cloud Native con Quarkus"
description: "Desarrolla microservicios Java ultra-rápidos y eficientes con Quarkus, el framework supersónico subatómico."
pubDate: 2026-01-15
tags: ["quarkus", "java", "microservicios"]
categories: ["cloud-native"]
featured: true
image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&h=630&fit=crop"
lang: es
---

Quarkus ha revolucionado el desarrollo Java para la nube. Aprende a crear microservicios eficientes que arrancan en milisegundos.

## ¿Por qué Quarkus?

- **Arranque ultrarrápido**: < 1 segundo en JVM, < 50ms nativo
- **Bajo consumo de memoria**: 10x menos que frameworks tradicionales
- **Developer Joy**: Live reload, Dev Services, configuración unificada
- **Nativo en Kubernetes**: Diseñado para contenedores

## Crear un proyecto Quarkus

```bash
# Usando CLI
quarkus create app com.example:my-service \
  --extension='resteasy-reactive-jackson,hibernate-orm-panache,jdbc-postgresql'

# O usando Maven
mvn io.quarkus.platform:quarkus-maven-plugin:create \
  -DprojectGroupId=com.example \
  -DprojectArtifactId=my-service
```

## REST API con RESTEasy Reactive

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

## Persistencia con Panache

```java
@Entity
public class Product extends PanacheEntity {

    public String name;
    public String description;
    public BigDecimal price;

    // Métodos de consulta estáticos
    public static List<Product> findByName(String name) {
        return find("name like ?1", "%" + name + "%").list();
    }

    public static List<Product> findExpensive() {
        return find("price > ?1", new BigDecimal("100")).list();
    }
}
```

## Configuración por entorno

```properties
# application.properties

# Desarrollo
%dev.quarkus.datasource.db-kind=h2
%dev.quarkus.datasource.jdbc.url=jdbc:h2:mem:devdb

# Producción
%prod.quarkus.datasource.db-kind=postgresql
%prod.quarkus.datasource.jdbc.url=${DATABASE_URL}
%prod.quarkus.datasource.username=${DB_USER}
%prod.quarkus.datasource.password=${DB_PASSWORD}
```

## Comunicación entre servicios

### REST Client

```java
@RegisterRestClient(configKey = "inventory-api")
@Path("/api/inventory")
public interface InventoryClient {

    @GET
    @Path("/{productId}")
    Inventory getStock(@PathParam("productId") Long productId);
}

// Uso
@Inject
@RestClient
InventoryClient inventoryClient;
```

### Messaging con Kafka

```java
@ApplicationScoped
public class OrderProcessor {

    @Incoming("orders")
    @Outgoing("confirmations")
    public Confirmation process(Order order) {
        // Procesar orden
        return new Confirmation(order.getId(), "PROCESSED");
    }
}
```

## Health Checks y Métricas

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

## Compilación nativa con GraalVM

```bash
# Compilar imagen nativa
./mvnw package -Pnative

# Ejecutar
./target/my-service-1.0.0-runner

# Tiempo de arranque: ~20ms
# Memoria: ~30MB
```

## Dockerfile optimizado

```dockerfile
FROM quay.io/quarkus/quarkus-micro-image:2.0

WORKDIR /work/
COPY target/*-runner /work/application

EXPOSE 8080
CMD ["./application", "-Dquarkus.http.host=0.0.0.0"]
```

## Conclusión

Quarkus representa el futuro del desarrollo Java en la nube. Su eficiencia, velocidad y excelente experiencia de desarrollo lo convierten en la opción ideal para microservicios modernos.
