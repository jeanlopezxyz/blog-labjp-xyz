---
title: "Kubernetes Monitoring with Prometheus and Grafana"
description: "Implement complete observability in your Kubernetes cluster using Prometheus for metrics and Grafana for visualization."
pubDate: 2026-01-14
tags: ["kubernetes", "prometheus", "grafana", "observability"]
categories: ["kubernetes"]
featured: false
image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=630&fit=crop"
lang: en
---

Observability is fundamental in distributed architectures. Learn to implement a professional monitoring stack with Prometheus and Grafana.

## Observability Stack

- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards
- **Alertmanager**: Alert management
- **Node Exporter**: Operating system metrics

## Installation with Helm

```bash
# Add repository
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install kube-prometheus-stack
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.adminPassword=admin123
```

## Stack Architecture

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

## ServiceMonitor for Your Application

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

## Metrics in Java Applications

### With Micrometer (Spring Boot)

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

### With Quarkus

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

## Useful PromQL Queries

```promql
# Request rate per second
rate(http_requests_total[5m])

# 99th percentile latency
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# CPU usage by pod
sum(rate(container_cpu_usage_seconds_total{namespace="default"}[5m])) by (pod)

# Memory used by namespace
sum(container_memory_working_set_bytes{namespace="default"}) by (pod)

# Pods in non-Ready state
kube_pod_status_ready{condition="false"}
```

## Alerts with PrometheusRule

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
            summary: "High error rate in {{ $labels.service }}"
            description: "Error rate > 5% for 5 minutes"

        - alert: HighLatency
          expr: |
            histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "High latency in {{ $labels.service }}"
```

## Grafana Dashboard

### Import Predefined Dashboards

```bash
# Popular IDs:
# 315 - Kubernetes cluster
# 6417 - Kubernetes pods
# 11074 - Node Exporter
# 4701 - JVM Micrometer
```

### Custom JSON Panel

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

## Access Grafana

```bash
# Port-forward
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring

# Or create Ingress
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

## Conclusion

A good monitoring system is essential for operating applications in production. Prometheus and Grafana provide a robust, scalable, and widely adopted solution in the Kubernetes ecosystem.
