---
title: "Application Monitoring on OpenShift with Prometheus: User Workload Monitoring"
description: "How to monitor your own applications on OpenShift using the built-in Prometheus stack: User Workload Monitoring, ServiceMonitor, alerting, the Cluster Observability Operator, and when kube-prometheus-stack is still the right call."
pubDate: 2026-01-14
updatedDate: 2026-09-05
tags: ["openshift", "kubernetes", "prometheus", "grafana", "observability", "monitoring"]
categories: ["kubernetes"]
featured: false
image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=630&fit=crop"
lang: en
---

One of the first things I check when I arrive at a customer running OpenShift is whether there is a `monitoring` namespace. If it exists and contains a Helm-installed `kube-prometheus-stack`, I know an awkward conversation is coming: someone copied a vanilla Kubernetes tutorial (like the first version of this very article, I admit) and now there are two Prometheus instances scraping the same nodes, two Alertmanagers firing duplicate alerts, and a Grafana with `admin/admin123` exposed on a Route.

OpenShift already ships a complete monitoring stack, supported by Red Hat and managed by the Cluster Monitoring Operator. What you need is not to install Prometheus, but to **enable User Workload Monitoring** (UWM) and expose your application's metrics so the cluster's own Prometheus can scrape them. This post walks that path end to end, with the lessons I have collected across real deployments. I am using OpenShift 4.14 and later as the reference.

## What OpenShift gives you out of the box

Everything lives in the `openshift-monitoring` namespace and is installed with the cluster:

- **Prometheus** (two replicas, HA) for platform metrics: API server, etcd, kubelet, nodes, operators.
- **Alertmanager** with platform alerts already defined and validated by Red Hat.
- **Thanos Querier**, the single query endpoint. It deduplicates across replicas and, once UWM is enabled, federates platform and user metrics behind one API.
- **node-exporter**, **kube-state-metrics** and **openshift-state-metrics**, already deployed and scraped.
- **Built-in console dashboards** (Observe > Dashboards) and a metrics explorer (Observe > Metrics).
- **Telemeter client**, which sends aggregated health metrics to Red Hat for support purposes.

Something that catches many people off guard: since OpenShift 4.11, Grafana is **no longer part** of the monitoring stack. There used to be a read-only instance; Red Hat removed it and moved the dashboards into the console. If a customer wants Grafana, that is their choice and there is a community-supported path (covered below), but it is not a missing default component.

You can inspect it with:

```bash
oc -n openshift-monitoring get pods
oc -n openshift-monitoring get prometheus,alertmanager
```

By design, this Prometheus **only scrapes platform namespaces** (`openshift-*`, `kube-*`, `default`). It does not see your applications in `my-app-prod`. And you should not try to make it see them by dropping `ServiceMonitor` resources into `openshift-monitoring`: that namespace is operator-managed and any foreign resource there falls outside of support.

## Enabling User Workload Monitoring

Here is the mindset shift. Instead of a parallel stack, OpenShift provides a second Prometheus, also managed by the Cluster Monitoring Operator, dedicated exclusively to user workloads. It is enabled with a ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cluster-monitoring-config
  namespace: openshift-monitoring
data:
  config.yaml: |
    enableUserWorkload: true
```

```bash
oc apply -f cluster-monitoring-config.yaml

# Within a couple of minutes the new namespace shows up with its components
oc -n openshift-user-workload-monitoring get pods
```

You should see `prometheus-user-workload-0/1`, `thanos-ruler-user-workload-0/1` and `prometheus-operator`. From here on:

- Any `ServiceMonitor`, `PodMonitor` or `PrometheusRule` created in **a user namespace** is picked up automatically.
- The resulting metrics are queried through the same Thanos Querier and show up in the console.
- User alerts are evaluated by Thanos Ruler and routed through the platform Alertmanager (or a dedicated one, if you configure it).

An important warning: if `cluster-monitoring-config` already exists in the cluster (it commonly holds platform retention or storage settings), **edit it** rather than applying a fresh file, or you will overwrite the existing configuration. `oc -n openshift-monitoring edit cm cluster-monitoring-config` is the safer route.

### Configuring the user workload Prometheus

The UWM Prometheus starts with ephemeral storage and 24-hour retention. That is not acceptable in production; you tune it through a second ConfigMap, this time in `openshift-user-workload-monitoring`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: user-workload-monitoring-config
  namespace: openshift-user-workload-monitoring
data:
  config.yaml: |
    prometheus:
      retention: 15d
      retentionSize: 40GiB
      resources:
        requests:
          cpu: 500m
          memory: 2Gi
      volumeClaimTemplate:
        spec:
          storageClassName: ocs-storagecluster-ceph-rbd
          resources:
            requests:
              storage: 50Gi
      # Optional: ship to long-term storage
      remoteWrite:
        - url: "https://thanos-receive.observability.example.com/api/v1/receive"
          writeRelabelConfigs:
            - sourceLabels: [__name__]
              regex: "http_server_requests_seconds.*|jvm_memory_.*"
              action: keep
    thanosRuler:
      retention: 15d
      volumeClaimTemplate:
        spec:
          storageClassName: ocs-storagecluster-ceph-rbd
          resources:
            requests:
              storage: 10Gi
```

Two hard-earned lessons:

- Without `volumeClaimTemplate`, a pod restart (during a cluster upgrade, for instance) wipes all history. It is the most common mistake I find.
- `remoteWrite` with `writeRelabelConfigs` is how you ship only business metrics to a Thanos or a managed service, without paying for the noise of every pod's JVM metrics.

### Permissions for development teams

UWM ships with predefined roles so nobody needs `cluster-admin`:

```bash
# Allows creating ServiceMonitor, PodMonitor and PrometheusRule in the namespace
oc -n my-app-prod adm policy add-role-to-user monitoring-edit dev-lead

# Read-only access to rules and alerts
oc -n my-app-prod adm policy add-role-to-user monitoring-rules-view auditor

# Query metrics from any namespace through Thanos Querier
oc adm policy add-cluster-role-to-user cluster-monitoring-view sre-oncall
```

And if there is a namespace you do not want UWM to scrape (say, one with a noisy vendor exporter), a label is enough:

```bash
oc label namespace vendor-tools openshift.io/user-monitoring=false
```

## Exposing your application's metrics

### Java instrumentation

In Quarkus, the `quarkus-micrometer-registry-prometheus` extension exposes `/q/metrics` with HTTP, JVM, connection pool and Kafka metrics with no extra code. For business metrics:

```java
@ApplicationScoped
public class OrderMetrics {

    private final Counter ordersCreated;
    private final DistributionSummary orderAmount;

    public OrderMetrics(MeterRegistry registry) {
        this.ordersCreated = Counter.builder("orders_created_total")
            .description("Orders created")
            .register(registry);
        this.orderAmount = DistributionSummary.builder("orders_amount_eur")
            .description("Order amount in euros")
            .baseUnit("eur")
            .register(registry);
    }

    public void recordOrder(BigDecimal amount) {
        ordersCreated.increment();
        orderAmount.record(amount.doubleValue());
    }
}
```

In Spring Boot, `spring-boot-starter-actuator` plus `micrometer-registry-prometheus` expose `/actuator/prometheus`, and the same Micrometer API covers custom metrics. In practice the only difference is the endpoint path, which you reflect in the `ServiceMonitor`.

### Service and ServiceMonitor

The `ServiceMonitor` goes **in the application's namespace**, not in any monitoring namespace. It does not need the `release: monitoring` label from Helm tutorials; UWM picks up any `ServiceMonitor` in the namespace:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: catalog-service
  namespace: my-app-prod
  labels:
    app.kubernetes.io/name: catalog-service
spec:
  selector:
    app.kubernetes.io/name: catalog-service
  ports:
    - name: http
      port: 8080
      targetPort: 8080
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: catalog-service
  namespace: my-app-prod
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: catalog-service
  endpoints:
    - port: http
      path: /q/metrics
      interval: 30s
      scrapeTimeout: 10s
```

```bash
oc apply -f catalog-monitoring.yaml

# Verify the target shows up and is UP
oc -n openshift-user-workload-monitoring exec statefulset/prometheus-user-workload -c prometheus -- \
  curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.labels.namespace=="my-app-prod") | {job: .labels.job, health: .health, lastError: .lastError}'
```

Three mistakes I have debugged more times than I would like:

1. The `port` in the `ServiceMonitor` is the port **name** in the Service, not the number. If the Service has unnamed ports, it will not work.
2. If the application has a restrictive `NetworkPolicy`, you must allow traffic from `openshift-user-workload-monitoring`. Otherwise the target shows as `DOWN` with a timeout.
3. For workloads without a Service (jobs, or pods that never receive traffic), use `PodMonitor` with `podMetricsEndpoints`. Same shape, selector on pod labels.

### Querying the metrics

In the console, the Developer perspective has Observe > Metrics scoped to the namespace, and the Administrator perspective sees everything. For automation or external tooling, the entry point is the Thanos Querier:

```bash
TOKEN=$(oc whoami -t)
THANOS=$(oc -n openshift-monitoring get route thanos-querier -o jsonpath='{.spec.host}')

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://$THANOS/api/v1/query" \
  --data-urlencode 'query=sum(rate(http_server_requests_seconds_count{namespace="my-app-prod"}[5m])) by (uri, status)' | jq
```

Queries I use daily with Micrometer-instrumented Java applications:

```promql
# Request rate per endpoint
sum(rate(http_server_requests_seconds_count{namespace="my-app-prod"}[5m])) by (uri)

# 99th percentile latency
histogram_quantile(0.99,
  sum(rate(http_server_requests_seconds_bucket{namespace="my-app-prod"}[5m])) by (le, uri))

# 5xx error ratio
sum(rate(http_server_requests_seconds_count{namespace="my-app-prod", status=~"5.."}[5m]))
/
sum(rate(http_server_requests_seconds_count{namespace="my-app-prod"}[5m]))

# Heap memory vs container limit
sum(jvm_memory_used_bytes{namespace="my-app-prod", area="heap"}) by (pod)
/
sum(container_spec_memory_limit_bytes{namespace="my-app-prod", container!=""}) by (pod)

# Agroal connection pool saturated
agroal_awaiting_count{namespace="my-app-prod"} > 0
```

## Alerting with PrometheusRule

Rules also live in the application namespace. Thanos Ruler evaluates them and forwards them to the platform Alertmanager:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: catalog-service-alerts
  namespace: my-app-prod
spec:
  groups:
    - name: catalog-service.rules
      rules:
        - alert: CatalogHighErrorRate
          expr: |
            sum(rate(http_server_requests_seconds_count{namespace="my-app-prod", status=~"5.."}[5m]))
            /
            sum(rate(http_server_requests_seconds_count{namespace="my-app-prod"}[5m])) > 0.05
          for: 5m
          labels:
            severity: critical
            team: catalog
          annotations:
            summary: "5xx error rate above 5% on catalog-service"
            runbook_url: "https://wiki.example.com/runbooks/catalog-service#errors"

        - alert: CatalogHighLatencyP99
          expr: |
            histogram_quantile(0.99,
              sum(rate(http_server_requests_seconds_bucket{namespace="my-app-prod"}[5m])) by (le)) > 1
          for: 10m
          labels:
            severity: warning
            team: catalog
          annotations:
            summary: "P99 latency above 1 second on catalog-service"

        - alert: CatalogConnectionPoolExhausted
          expr: agroal_awaiting_count{namespace="my-app-prod"} > 0
          for: 2m
          labels:
            severity: warning
            team: catalog
          annotations:
            summary: "Threads are waiting for a database connection on {{ $labels.pod }}"
```

```bash
# Check the state of user alerts
oc -n openshift-user-workload-monitoring exec statefulset/thanos-ruler-user-workload -c thanos-ruler -- \
  curl -s http://localhost:10902/api/v1/alerts | jq '.data.alerts[] | {alert: .labels.alertname, state: .state}'
```

### Routing alerts to teams

By default, user alerts go to the platform Alertmanager, whose configuration only a cluster-admin can touch. To let each team manage its own routes (Slack, PagerDuty, email) without going through the administrator, enable `AlertmanagerConfig` support:

```yaml
# In cluster-monitoring-config (openshift-monitoring)
data:
  config.yaml: |
    enableUserWorkload: true
    alertmanagerMain:
      enableUserAlertmanagerConfig: true
```

With that in place, the team creates its own `AlertmanagerConfig` in its namespace:

```yaml
apiVersion: monitoring.coreos.com/v1beta1
kind: AlertmanagerConfig
metadata:
  name: catalog-team
  namespace: my-app-prod
spec:
  route:
    receiver: catalog-slack
    groupBy: ["alertname"]
    matchers:
      - name: team
        value: catalog
  receivers:
    - name: catalog-slack
      slackConfigs:
        - apiURL:
            name: slack-webhook
            key: url
          channel: "#catalog-alerts"
          sendResolved: true
```

The webhook lives in a `Secret` (`slack-webhook`) in the same namespace. The `alert-routing-edit` role is what allows a developer to create this resource.

If the customer needs a fully separate Alertmanager for user workloads (for example, because the platform one is owned by a different team), enable it with `alertmanager: enabled: true` in `user-workload-monitoring-config`.

## Dashboards: console, Grafana and the Cluster Observability Operator

### Console dashboards

The OpenShift console lets you add your own dashboards without installing anything. Create a ConfigMap with the dashboard JSON (Grafana-compatible format) in `openshift-config-managed` with the label `console.openshift.io/dashboard=true`, and it shows up under Observe > Dashboards. It is the supported option and sufficient for most platform panels; it falls short when you need complex variables, annotations, or sharing with people who lack console access.

### Grafana as a complement

When the customer has a corporate Grafana or the operations team insists on it, the right path is **not** to install a Prometheus for Grafana, but to connect Grafana to the existing Thanos Querier. With the community Grafana Operator (available in OperatorHub):

```bash
# Service account with read access to metrics
oc -n grafana create sa grafana-reader
oc adm policy add-cluster-role-to-user cluster-monitoring-view -z grafana-reader -n grafana
oc -n grafana create token grafana-reader --duration=8760h
```

```yaml
apiVersion: grafana.integreatly.org/v1beta1
kind: GrafanaDatasource
metadata:
  name: openshift-thanos
  namespace: grafana
spec:
  instanceSelector:
    matchLabels:
      dashboards: grafana
  datasource:
    name: OpenShift Prometheus
    type: prometheus
    access: proxy
    url: https://thanos-querier.openshift-monitoring.svc:9091
    jsonData:
      httpHeaderName1: Authorization
      tlsSkipVerify: false
    secureJsonData:
      httpHeaderValue1: "Bearer ${GRAFANA_READER_TOKEN}"
```

Be upfront with the customer that the Grafana Operator is a community project: Red Hat does not support it. What is supported is the Thanos Querier API it connects to.

### Cluster Observability Operator

The Cluster Observability Operator (COO) is the direction Red Hat is pushing for observability beyond basic platform monitoring. It is an optional, supported operator installed from OperatorHub, and it brings two pieces that solve real needs UWM does not cover:

- **`MonitoringStack`**: deploys isolated Prometheus and Alertmanager instances per namespace or per team, with their own lifecycle, retention and resources. It is the correct answer when a tenant needs its own Prometheus (strict multi-tenancy, an ISV packaging its product, or a team wanting 90-day retention without affecting everyone else) while staying within support.
- **`UIPlugin`**: extends the console with dashboards (Perses-based), a troubleshooting panel that correlates metrics, logs, traces and alerts through Korrel8r, and distributed tracing and logging views when the Tempo Operator and Logging Operator are installed.

```yaml
apiVersion: monitoring.rhobs/v1alpha1
kind: MonitoringStack
metadata:
  name: catalog-team-stack
  namespace: catalog-observability
spec:
  logLevel: info
  retention: 30d
  resourceSelector:
    matchLabels:
      monitoring.rhobs/stack: catalog-team
  prometheusConfig:
    replicas: 2
    persistentVolumeClaim:
      storageClassName: ocs-storagecluster-ceph-rbd
      resources:
        requests:
          storage: 100Gi
---
apiVersion: observability.openshift.io/v1alpha1
kind: UIPlugin
metadata:
  name: troubleshooting-panel
spec:
  type: TroubleshootingPanel
```

The `ServiceMonitor` resources a `MonitoringStack` picks up are those carrying the `monitoring.rhobs/stack: catalog-team` label (and they use the `monitoring.rhobs` API group, not `monitoring.coreos.com`). That is what lets them coexist with UWM without duplicate scrapes.

My practical recommendation today: start with UWM, which is free and already there. Move to COO when a concrete isolation or signal-correlation requirement appears. Do not install COO "just in case"; it adds operational complexity that needs justifying.

## So when does kube-prometheus-stack make sense?

Everything above applies to OpenShift. If you are running vanilla Kubernetes (kubeadm, EKS, GKE, AKS, k3s), there is no Cluster Monitoring Operator and no UWM, and there `kube-prometheus-stack` remains an excellent choice:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --set grafana.adminPassword="$(openssl rand -base64 24)" \
  --set prometheus.prometheusSpec.retention=15d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=50Gi
```

It brings the same Prometheus Operator, the same CRDs (`ServiceMonitor`, `PrometheusRule`) and a Grafana preloaded with Kubernetes dashboards. The `ServiceMonitor` and `PrometheusRule` manifests in this post work unchanged, with one difference: by default the chart only discovers resources carrying the `release: <release-name>` label, unless you set `serviceMonitorSelectorNilUsesHelmValues=false`.

The rule is simple: on OpenShift, use what ships with the cluster; on vanilla Kubernetes, install kube-prometheus-stack. Installing the latter on top of the former only gives you two systems to maintain and a harder support ticket to open.

## Conclusion

Monitoring on OpenShift does not start by installing tools; it starts by enabling and configuring the ones already there. With `enableUserWorkload: true`, a `ServiceMonitor` in your namespace and a `PrometheusRule` carrying your service's alerts, you get an HA metrics pipeline, supported by Red Hat, with no default credentials exposed. Grafana is an optional add-on that connects to the Thanos Querier, and the Cluster Observability Operator is the next step when you need per-team isolation or signal correlation. Save kube-prometheus-stack for the clusters where none of this exists.
