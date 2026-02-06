---
title: "Monitoreo en Kubernetes con Prometheus y Grafana"
description: "Implementa observabilidad completa en tu cluster Kubernetes usando Prometheus para métricas y Grafana para visualización."
pubDate: 2026-01-14
tags: ["kubernetes", "prometheus", "grafana", "observability"]
categories: ["kubernetes"]
featured: false
image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=630&fit=crop"
lang: es
---

La observabilidad es fundamental en arquitecturas distribuidas. Aprende a implementar un stack de monitoreo profesional con Prometheus y Grafana.

## Stack de observabilidad

- **Prometheus**: Recolección y almacenamiento de métricas
- **Grafana**: Visualización y dashboards
- **Alertmanager**: Gestión de alertas
- **Node Exporter**: Métricas del sistema operativo

## Instalación con Helm

```bash
# Añadir repositorio
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Instalar kube-prometheus-stack
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.adminPassword=admin123
```

## Arquitectura del stack

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Grafana   │────▶│ Prometheus  │────▶│  Targets    │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                   │
                           ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐
                    │Alertmanager │     │ Exporters   │
                    └─────────────┘     └─────────────┘
```

## ServiceMonitor para tu aplicación

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: myapp-monitor
  namespace: monitoring
  labels:
    release: monitoring
spec:
  selector:
    matchLabels:
      app: myapp
  namespaceSelector:
    matchNames:
      - default
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

## Métricas en aplicaciones Java

### Con Micrometer (Spring Boot)

```java
@RestController
public class MetricsController {

    private final Counter requestCounter;
    private final Timer requestTimer;

    public MetricsController(MeterRegistry registry) {
        this.requestCounter = Counter.builder("http_requests_total")
            .description("Total HTTP requests")
            .tag("endpoint", "/api")
            .register(registry);

        this.requestTimer = Timer.builder("http_request_duration")
            .description("HTTP request duration")
            .register(registry);
    }

    @GetMapping("/api/data")
    public ResponseEntity<Data> getData() {
        return requestTimer.record(() -> {
            requestCounter.increment();
            return ResponseEntity.ok(service.getData());
        });
    }
}
```

### Con Quarkus

```java
@Path("/api")
public class ApiResource {

    @Inject
    MeterRegistry registry;

    @Counted(value = "api_requests", description = "API request count")
    @Timed(value = "api_duration", description = "API request duration")
    @GET
    @Path("/data")
    public Response getData() {
        return Response.ok(service.getData()).build();
    }
}
```

## Queries PromQL útiles

```promql
# Tasa de requests por segundo
rate(http_requests_total[5m])

# Percentil 99 de latencia
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# Uso de CPU por pod
sum(rate(container_cpu_usage_seconds_total{namespace="default"}[5m])) by (pod)

# Memoria usada por namespace
sum(container_memory_working_set_bytes{namespace="default"}) by (pod)

# Pods en estado no Ready
kube_pod_status_ready{condition="false"}
```

## Alertas con PrometheusRule

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: myapp-alerts
  namespace: monitoring
  labels:
    release: monitoring
spec:
  groups:
    - name: myapp
      rules:
        - alert: HighErrorRate
          expr: |
            sum(rate(http_requests_total{status=~"5.."}[5m]))
            /
            sum(rate(http_requests_total[5m])) > 0.05
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Alta tasa de errores en {{ $labels.service }}"
            description: "Error rate > 5% durante 5 minutos"

        - alert: HighLatency
          expr: |
            histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Latencia alta en {{ $labels.service }}"
```

## Dashboard de Grafana

### Importar dashboards predefinidos

```bash
# IDs populares:
# 315 - Kubernetes cluster
# 6417 - Kubernetes pods
# 11074 - Node Exporter
# 4701 - JVM Micrometer
```

### Panel JSON personalizado

```json
{
  "title": "Request Rate",
  "type": "timeseries",
  "datasource": "Prometheus",
  "targets": [
    {
      "expr": "sum(rate(http_requests_total[5m])) by (service)",
      "legendFormat": "{{ service }}"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "unit": "reqps"
    }
  }
}
```

## Acceder a Grafana

```bash
# Port-forward
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring

# O crear Ingress
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: grafana
  namespace: monitoring
spec:
  rules:
    - host: grafana.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: monitoring-grafana
                port:
                  number: 80
EOF
```

## Conclusión

Un buen sistema de monitoreo es esencial para operar aplicaciones en producción. Prometheus y Grafana proporcionan una solución robusta, escalable y ampliamente adoptada en el ecosistema Kubernetes.
