---
title: "Microservicios Cloud Native con Quarkus"
description: "Guía práctica de Quarkus 3.x con Java 21: Quarkus REST, virtual threads, Panache, Kafka, health checks y despliegue en OpenShift, con lecciones reales de producción."
pubDate: 2026-01-15
updatedDate: 2026-09-05
tags: ["quarkus", "java", "microservicios", "java-21", "virtual-threads", "openshift"]
categories: ["cloud-native"]
featured: true
image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&h=630&fit=crop"
lang: es
---

Llevo varios años acompañando a equipos de banca, retail y sector público en su paso de monolitos Java EE y Spring a microservicios sobre OpenShift, y Quarkus se ha convertido en mi recomendación por defecto cuando el equipo ya vive en el ecosistema Java. No porque sea "el más rápido" en un benchmark, sino porque resuelve problemas concretos que veo una y otra vez en producción: arranques lentos que rompen el autoscaling, contenedores que necesitan 1 GB de RAM para servir tres endpoints, y ciclos de desarrollo donde cada cambio cuesta un reinicio de 40 segundos.

Esta es una revisión completa del artículo original. Desde entonces cambiaron cosas importantes: RESTEasy Reactive pasó a llamarse **Quarkus REST**, Java 21 trajo los **virtual threads** y Quarkus los integró de forma nativa. Voy a tomar como referencia **Quarkus 3.15+ (rama LTS)** y Java 21, que es lo que hoy despliego en clientes con Red Hat build of Quarkus.

## Por qué Quarkus (y por qué no siempre)

Los argumentos clásicos siguen siendo válidos:

- **Procesamiento en tiempo de build**: Quarkus resuelve inyección de dependencias, escaneo de anotaciones y configuración durante el `package`, no en el arranque. Eso explica los tiempos de inicio de menos de un segundo en JVM y de decenas de milisegundos en nativo.
- **Huella de memoria**: un servicio típico con REST, JPA y Kafka arranca en JVM con RSS de 150-250 MB. El mismo servicio en Spring Boot suele estar entre 350 y 500 MB. En un cluster con 200 microservicios esa diferencia se paga en nodos.
- **Developer joy**: `quarkus dev` con live reload, Dev Services que levanta PostgreSQL o Kafka en contenedores sin configurar nada, y Dev UI para inspeccionar beans, configuración y endpoints.
- **Nacido para Kubernetes**: extensiones `quarkus-kubernetes` y `quarkus-openshift` que generan manifiestos, health checks integrados y configuración pensada para ConfigMaps y Secrets.

Ahora la parte honesta. Spring Boot 3.x cerró buena parte de la brecha: soporta virtual threads con una propiedad, compila a nativo con GraalVM y tiene un ecosistema de librerías y de perfiles laborales mucho más amplio. Si un cliente tiene 80 desarrolladores formados en Spring, migrarlos a Quarkus "porque arranca más rápido" es un error que he visto fracasar. Quarkus gana claramente cuando:

- El coste de infraestructura por servicio importa (muchos servicios pequeños, escalado a cero, serverless con Knative).
- El equipo es nuevo o está dispuesto a aprender un modelo de programación ligeramente distinto.
- Se necesita MicroProfile (Health, Config, Fault Tolerance, OpenTelemetry) con soporte empresarial de Red Hat.

## Crear el proyecto

Desde Quarkus 3.9 el extension de REST se llama `quarkus-rest`. Los artefactos antiguos `quarkus-resteasy-reactive-*` siguen funcionando como relocations, pero en proyectos nuevos hay que usar los nombres actuales:

```bash
# Con la CLI de Quarkus
quarkus create app com.example:catalog-service \
  --extension='rest-jackson,hibernate-orm-panache,jdbc-postgresql,smallrye-health,micrometer-registry-prometheus'

# Con Maven
mvn io.quarkus.platform:quarkus-maven-plugin:3.15.1:create \
  -DprojectGroupId=com.example \
  -DprojectArtifactId=catalog-service \
  -Dextensions='rest-jackson,hibernate-orm-panache,jdbc-postgresql,smallrye-health,micrometer-registry-prometheus'
```

Y asegúrate de fijar Java 21 en el `pom.xml`:

```xml
<properties>
    <maven.compiler.release>21</maven.compiler.release>
    <quarkus.platform.version>3.15.1</quarkus.platform.version>
</properties>
```

Si necesitas cliente REST, el artefacto correspondiente es `quarkus-rest-client-jackson` (antes `quarkus-rest-client-reactive-jackson`).

## REST API con Quarkus REST

Quarkus REST es la implementación de Jakarta REST que Quarkus construye sobre Vert.x. La diferencia respecto al RESTEasy clásico no es solo el nombre: procesa las anotaciones en tiempo de build (sin reflection en runtime) y decide en qué hilo ejecutar cada endpoint según su firma.

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

Un detalle que suele sorprender a quien viene de Spring: aquí no hay `@RestController` ni `@Autowired`. Son anotaciones estándar de Jakarta REST y CDI, lo que facilita mover código entre Quarkus, WildFly o cualquier otro runtime Jakarta EE.

### En qué hilo se ejecuta tu endpoint

Este es el punto que más confusión genera y el origen de la mayoría de incidentes de rendimiento que he tenido que diagnosticar:

- Si el método devuelve un tipo **reactivo** (`Uni<T>`, `Multi<T>`, `CompletionStage<T>`), Quarkus REST lo ejecuta en el **event loop** de Vert.x. Ahí nunca puedes bloquear.
- Si devuelve un tipo **plano** (`ProductDto`, `List<T>`, `Response`), lo ejecuta en un **worker thread** de plataforma. Puedes bloquear con JDBC, clientes HTTP síncronos, etc.
- Con `@RunOnVirtualThread` lo ejecuta en un **virtual thread**. Puedes bloquear, y es barato.

Puedes forzar el comportamiento con `@Blocking` y `@NonBlocking`, pero en mi experiencia lo mejor es dejar que la firma del método lo declare de forma explícita.

## Java 21 y virtual threads en Quarkus

Los virtual threads (JEP 444, finales en Java 21) son hilos gestionados por la JVM, no por el sistema operativo. Crear un millón de ellos es viable; se montan sobre un pequeño pool de hilos portadores (carrier threads) y cuando uno bloquea en I/O, la JVM lo desmonta y deja el carrier libre para otro.

Para Quarkus esto abre un camino intermedio muy atractivo: escribir código imperativo, bloqueante y fácil de leer, con una escalabilidad cercana a la del modelo reactivo.

### Cómo habilitarlos

Basta con Java 21 en el proyecto y la anotación `@RunOnVirtualThread` sobre el método o la clase:

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
        // Dos llamadas bloqueantes (JDBC + HTTP) escritas de forma secuencial.
        // Cada request ocupa un virtual thread; mientras espera I/O, el carrier queda libre.
        ProductDto product = productService.findById(id)
            .orElseThrow(NotFoundException::new);
        Inventory stock = inventoryClient.getStock(product.sku());
        return new AvailabilityDto(product.id(), stock.quantity() > 0, stock.quantity());
    }
}
```

No hay que tocar `application.properties` para que funcione. La anotación también está soportada en gRPC, Reactive Messaging (`@Incoming`), el scheduler y consumidores de Vert.x event bus.

Para paralelizar dentro de un virtual thread, la combinación natural es un `ExecutorService` de virtual threads:

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

### Virtual threads vs Mutiny: cuándo usar cada uno

Después de haber llevado ambos modelos a producción, esta es mi regla práctica:

| Escenario | Recomendación |
|---|---|
| CRUD sobre JDBC, orquestación de llamadas REST, lógica de negocio con muchos pasos | Virtual threads. Código plano, stack traces legibles, fácil de depurar. |
| Streaming (SSE, WebSockets), backpressure real, pipelines de eventos Kafka con transformaciones | Mutiny (`Uni`/`Multi`). El modelo reactivo expresa el flujo mucho mejor. |
| Servicios con cientos de miles de conexiones concurrentes y latencia crítica | Reactivo puro sobre event loop. Los virtual threads tienen un coste de scheduling que aquí sí se nota. |
| Equipo sin experiencia en programación reactiva | Virtual threads, sin dudar. El coste de un `Uni` mal encadenado en producción es alto. |

Los trade-offs reales que hay que conocer antes de anotar todo con `@RunOnVirtualThread`:

1. **Pinning**. Si un virtual thread bloquea dentro de un bloque `synchronized` o de una llamada nativa, queda "clavado" a su carrier y este no se libera. Muchas librerías antiguas (drivers JDBC, clientes HTTP viejos) usan `synchronized` internamente. Java 24 resolvió el caso de `synchronized` con JEP 491, pero en Java 21 sigue siendo un riesgo. Quarkus ofrece la extensión `quarkus-junit5-virtual-threads` con `@ShouldNotPin` para detectarlo en tests, y `-Djdk.tracePinnedThreads=full` para verlo en runtime.
2. **Monopolización**. Un virtual thread que hace cálculo intensivo de CPU no cede el carrier. Si todos tus endpoints son CPU-bound, los virtual threads no aportan nada y es preferible el worker pool tradicional.
3. **Pools de conexiones**. Aquí está la lección más cara que he aprendido. Con virtual threads puedes tener 10.000 requests en vuelo, pero tu pool de Agroal sigue teniendo 20 conexiones. El resultado es que el cuello de botella se mueve al pool y aparecen timeouts de adquisición. Ajusta `quarkus.datasource.jdbc.max-size` de acuerdo con lo que PostgreSQL pueda soportar realmente, y pon un límite de concurrencia en el endpoint (`@Bulkhead` de SmallRye Fault Tolerance) para no saturarlo.
4. **ThreadLocal y contexto**. Librerías que cachean objetos pesados en `ThreadLocal` (por ejemplo, ciertos formateadores o clientes) pierden sentido con millones de hilos efímeros. Quarkus propaga el contexto CDI y de request correctamente, pero el código propio que abuse de `ThreadLocal` puede disparar el consumo de memoria.

Mi conclusión: para el 80% de los servicios empresariales que veo (APIs que hablan con una base de datos y dos o tres servicios más), `@RunOnVirtualThread` es la mejor relación entre rendimiento y mantenibilidad. Reservo Mutiny para los componentes donde el flujo de datos es el problema a resolver.

## Persistencia con Panache

Panache elimina el boilerplate de repositorios sin ocultar JPA. Con Java 21 prefiero el patrón repository con records como DTO, que se combina mejor con virtual threads (las entidades no salen de la capa de servicio):

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

Dos consejos de producción:

- Panache con Hibernate ORM es bloqueante y funciona perfectamente con virtual threads. Hibernate Reactive existe, pero solo lo recomiendo si todo el servicio es reactivo; mezclar ambos en el mismo proyecto es fuente de errores sutiles.
- Usa `quarkus.hibernate-orm.database.generation=none` en producción y gestiona el esquema con Flyway (`quarkus-flyway`). He visto demasiados entornos donde `update` dejó columnas huérfanas durante meses.

## Configuración por entorno

Quarkus unifica toda la configuración en `application.properties` con perfiles. Dev Services hace que en `%dev` y `%test` no necesites configurar la base de datos: Quarkus levanta un contenedor de PostgreSQL automáticamente.

```properties
# Base de datos: en dev y test la provee Dev Services (Testcontainers)
quarkus.datasource.db-kind=postgresql
quarkus.hibernate-orm.database.generation=none
quarkus.flyway.migrate-at-start=true

# Producción: todo desde variables de entorno inyectadas por Secrets de OpenShift
%prod.quarkus.datasource.jdbc.url=${DATABASE_URL}
%prod.quarkus.datasource.username=${DATABASE_USER}
%prod.quarkus.datasource.password=${DATABASE_PASSWORD}
%prod.quarkus.datasource.jdbc.max-size=30
%prod.quarkus.datasource.jdbc.acquisition-timeout=5S

# Cliente REST
quarkus.rest-client.inventory-api.url=${INVENTORY_API_URL:http://inventory:8080}
quarkus.rest-client.inventory-api.connect-timeout=2000
quarkus.rest-client.inventory-api.read-timeout=5000

# Observabilidad
quarkus.micrometer.export.prometheus.path=/q/metrics
quarkus.otel.exporter.otlp.endpoint=${OTEL_COLLECTOR_URL:http://localhost:4317}
```

Nunca se escriben credenciales en el archivo. En OpenShift, las variables vienen de un `Secret` montado en el Deployment, y la extensión `quarkus-kubernetes-config` permite además leer ConfigMaps y Secrets directamente por la API.

## Comunicación entre servicios

### REST Client

El cliente REST de MicroProfile se declara como interfaz. Con Quarkus REST Client, el mismo cliente funciona en modo bloqueante (ideal con virtual threads) o devolviendo `Uni`:

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

Las anotaciones de SmallRye Fault Tolerance (`@Retry`, `@Timeout`, `@CircuitBreaker`, `@Bulkhead`) son lo primero que añado en cualquier cliente que cruce un límite de red. Un servicio sin circuit breaker frente a un dependiente lento es la forma más rápida de convertir una degradación en una caída en cascada.

### Mensajería con Kafka

Con SmallRye Reactive Messaging y Red Hat Streams for Apache Kafka (Strimzi) en el cluster:

```java
@ApplicationScoped
public class OrderProcessor {

    @Inject
    ProductService productService;

    @Incoming("orders")
    @Outgoing("order-confirmations")
    @RunOnVirtualThread
    public OrderConfirmation process(Order order) {
        // Lógica bloqueante (JDBC) sobre un virtual thread; el consumidor Kafka no se bloquea
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

Configura siempre `failure-strategy`. El valor por defecto (`fail`) detiene el consumidor ante el primer mensaje que lance excepción, y es un clásico de incidentes a las tres de la mañana.

## Health checks y métricas

OpenShift utiliza las sondas de liveness, readiness y startup para decidir cuándo enviar tráfico y cuándo reiniciar un pod. Quarkus las expone en `/q/health/*` con `quarkus-smallrye-health`:

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

Regla importante: el liveness **no** debe depender de la base de datos ni de servicios externos. Si la base cae y el liveness falla, Kubernetes reiniciará todos tus pods en bucle sin resolver nada. Deja el liveness en el check por defecto de Quarkus y pon las dependencias en readiness.

Para métricas, `quarkus-micrometer-registry-prometheus` expone `/q/metrics` con histogramas de latencia HTTP, métricas de JVM, del pool de conexiones y de Kafka sin escribir una línea. Es lo que consume el Prometheus de User Workload Monitoring en OpenShift a través de un `ServiceMonitor`.

## Despliegue en OpenShift

La extensión `quarkus-openshift` genera los manifiestos y puede desplegar directamente con un build S2I o binario:

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

Para el contenedor prefiero imágenes UBI de Red Hat, que son las que el cliente puede soportar:

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

## Compilación nativa: cuándo merece la pena

```bash
# Compilación nativa dentro de un contenedor (no necesitas GraalVM local)
./mvnw package -Dnative -Dquarkus.native.container-build=true

# Imagen final mínima
FROM quay.io/quarkus/quarkus-micro-image:2.0
COPY --chown=1001:root target/*-runner /work/application
EXPOSE 8080
USER 1001
CMD ["./application", "-Dquarkus.http.host=0.0.0.0"]
```

El binario nativo arranca en decenas de milisegundos y consume una fracción de la memoria de la JVM. Es ideal para serverless (Knative), jobs y CLIs. Pero antes de adoptarlo en toda la organización, ten en cuenta:

- El build tarda varios minutos y necesita bastante RAM (normalmente 4-8 GB en el pipeline).
- El throughput sostenido en JVM con JIT suele ser mayor que en nativo para servicios de larga vida.
- Cualquier librería que use reflection sin registrarla falla en runtime, no en compilación. Los tests de integración con `@QuarkusIntegrationTest` contra el binario nativo son obligatorios.

En la mayoría de clientes acabamos con JVM para los servicios core y nativo para funciones y jobs efímeros.

## Conclusión

Quarkus 3.x con Java 21 me da hoy la combinación que buscaba desde hace años: un modelo de programación imperativo y legible gracias a los virtual threads, arranque rápido y consumo de memoria contenido, estándares Jakarta EE y MicroProfile, e integración de primera clase con OpenShift. No es la única opción válida y Spring Boot sigue siendo una elección perfectamente razonable en muchas organizaciones, pero si el coste de infraestructura por servicio y la velocidad de desarrollo pesan en tu decisión, merece mucho la pena probarlo en un servicio real antes de decidir.
