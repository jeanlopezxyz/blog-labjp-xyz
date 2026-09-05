---
title: "Monitoreo de aplicaciones en OpenShift con Prometheus: User Workload Monitoring"
description: "Cómo monitorear tus propias aplicaciones en OpenShift usando el stack nativo de Prometheus: User Workload Monitoring, ServiceMonitor, alertas, Cluster Observability Operator y cuándo sí usar kube-prometheus-stack."
pubDate: 2026-01-14
updatedDate: 2026-09-05
tags: ["openshift", "kubernetes", "prometheus", "grafana", "observability", "monitoring"]
categories: ["kubernetes"]
featured: false
image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=630&fit=crop"
lang: es
---

Una de las primeras cosas que reviso cuando llego a un cliente con OpenShift es el namespace `monitoring`. Si existe y tiene un `kube-prometheus-stack` instalado con Helm, ya sé que voy a tener una conversación incómoda: alguien copió un tutorial de Kubernetes vanilla (como la primera versión de este mismo artículo, lo reconozco) y ahora hay dos Prometheus scrapeando los mismos nodos, dos Alertmanagers enviando alertas duplicadas y un Grafana con credenciales `admin/admin123` expuesto en una Route.

OpenShift ya trae un stack de monitoreo completo, soportado por Red Hat y gestionado por el Cluster Monitoring Operator. Lo que hace falta no es instalar Prometheus, sino **activar el monitoreo de cargas de trabajo de usuario** (User Workload Monitoring, UWM) y exponer las métricas de la aplicación de forma que el Prometheus nativo del cluster las recoja. Este artículo cubre ese camino de principio a fin, con las lecciones que he ido acumulando en despliegues reales. Tomo como referencia OpenShift 4.14 en adelante.

## Qué trae OpenShift de serie

Todo vive en el namespace `openshift-monitoring` y se instala con el cluster:

- **Prometheus** (dos réplicas, en HA) para métricas de plataforma: API server, etcd, kubelet, nodos, operadores.
- **Alertmanager** con las alertas de plataforma ya definidas y validadas por Red Hat.
- **Thanos Querier**, que es el punto único de consulta. Deduplica entre las réplicas y, cuando UWM está activo, federa las métricas de plataforma y de usuario en una sola API.
- **node-exporter**, **kube-state-metrics** y **openshift-state-metrics** ya desplegados y scrapeados.
- **Dashboards integrados en la consola web** (Observe > Dashboards) y el explorador de métricas (Observe > Metrics).
- **Telemeter client**, que envía métricas de salud agregadas a Red Hat para el soporte.

Un punto que sorprende a mucha gente: desde OpenShift 4.11 Grafana **ya no forma parte** del stack de monitoreo. Antes había una instancia de solo lectura; Red Hat la retiró y volcó los dashboards en la consola. Si un cliente quiere Grafana, es una decisión suya y hay un camino soportado por la comunidad (lo cubro más abajo), pero no es un componente que falte por defecto.

Puedes verlo con:

```bash
oc -n openshift-monitoring get pods
oc -n openshift-monitoring get prometheus,alertmanager
```

Por diseño, este Prometheus **solo scrapea namespaces de plataforma** (`openshift-*`, `kube-*`, `default`). Tus aplicaciones en `mi-app-prod` no las ve. Y no debes intentar que las vea añadiendo `ServiceMonitor` en `openshift-monitoring`: ese namespace está gestionado por el operador y cualquier recurso ajeno queda fuera de soporte.

## Habilitar User Workload Monitoring

Aquí está el cambio de mentalidad. En lugar de un stack paralelo, OpenShift ofrece un segundo Prometheus, también gestionado por el Cluster Monitoring Operator, dedicado exclusivamente a las cargas de trabajo de usuario. Se activa con un ConfigMap:

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

# En un par de minutos aparece el nuevo namespace con sus componentes
oc -n openshift-user-workload-monitoring get pods
```

Deberías ver `prometheus-user-workload-0/1`, `thanos-ruler-user-workload-0/1` y `prometheus-operator`. A partir de aquí:

- Cualquier `ServiceMonitor`, `PodMonitor` o `PrometheusRule` creado en **un namespace de usuario** es detectado automáticamente.
- Las métricas resultantes se consultan por el mismo Thanos Querier y aparecen en la consola.
- Las alertas de usuario las evalúa Thanos Ruler y las enruta el Alertmanager de plataforma (o uno dedicado, si lo configuras).

Un aviso importante: si el ConfigMap `cluster-monitoring-config` ya existe en el cluster (es habitual que tenga configuración de retención o de almacenamiento de plataforma), **edítalo** en lugar de hacer `apply` con un archivo nuevo, o sobrescribirás la configuración existente. `oc -n openshift-monitoring edit cm cluster-monitoring-config` es más seguro.

### Configurar el Prometheus de usuario

El Prometheus de UWM arranca con almacenamiento efímero y retención de 24 horas. En producción eso no sirve; se ajusta con un segundo ConfigMap, esta vez en `openshift-user-workload-monitoring`:

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
      # Opcional: enviar a almacenamiento de largo plazo
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

Dos lecciones aprendidas:

- Sin `volumeClaimTemplate`, un reinicio del pod (por ejemplo, durante un upgrade del cluster) borra todo el histórico. Es el error más frecuente que encuentro.
- El `remoteWrite` con `writeRelabelConfigs` es la manera de mandar solo las métricas de negocio a un Thanos o a un servicio gestionado, sin pagar por el ruido de las métricas de JVM de cada pod.

### Permisos para los equipos de desarrollo

UWM viene con roles predefinidos que evitan dar `cluster-admin` a nadie:

```bash
# Permite crear ServiceMonitor, PodMonitor y PrometheusRule en el namespace
oc -n mi-app-prod adm policy add-role-to-user monitoring-edit dev-lead

# Solo ver reglas y alertas
oc -n mi-app-prod adm policy add-role-to-user monitoring-rules-view auditor

# Consultar métricas de cualquier namespace vía Thanos Querier
oc adm policy add-cluster-role-to-user cluster-monitoring-view sre-oncall
```

Y si hay un namespace que no quieres que UWM scrapee (por ejemplo, uno con un exporter ruidoso de un proveedor), basta con etiquetarlo:

```bash
oc label namespace vendor-tools openshift.io/user-monitoring=false
```

## Exponer las métricas de tu aplicación

### Instrumentación en Java

En Quarkus, la extensión `quarkus-micrometer-registry-prometheus` expone `/q/metrics` con métricas de HTTP, JVM, pool de conexiones y Kafka sin código adicional. Para métricas de negocio:

```java
@ApplicationScoped
public class OrderMetrics {

    private final Counter ordersCreated;
    private final DistributionSummary orderAmount;

    public OrderMetrics(MeterRegistry registry) {
        this.ordersCreated = Counter.builder("orders_created_total")
            .description("Pedidos creados")
            .register(registry);
        this.orderAmount = DistributionSummary.builder("orders_amount_eur")
            .description("Importe de los pedidos en euros")
            .baseUnit("eur")
            .register(registry);
    }

    public void recordOrder(BigDecimal amount) {
        ordersCreated.increment();
        orderAmount.record(amount.doubleValue());
    }
}
```

En Spring Boot, `spring-boot-starter-actuator` más `micrometer-registry-prometheus` exponen `/actuator/prometheus` y la misma API de Micrometer sirve para las métricas propias. La diferencia práctica se reduce al path del endpoint, que hay que reflejar en el `ServiceMonitor`.

### Service y ServiceMonitor

El `ServiceMonitor` va **en el namespace de la aplicación**, no en ningún namespace de monitoreo. No necesita el label `release: monitoring` de los tutoriales de Helm; UWM detecta cualquier `ServiceMonitor` del namespace:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: catalog-service
  namespace: mi-app-prod
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
  namespace: mi-app-prod
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

# Verificar que el target aparece y está UP
oc -n openshift-user-workload-monitoring exec statefulset/prometheus-user-workload -c prometheus -- \
  curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.labels.namespace=="mi-app-prod") | {job: .labels.job, health: .health, lastError: .lastError}'
```

Tres errores que he depurado más veces de las que me gustaría:

1. El `port` del `ServiceMonitor` es el **nombre** del puerto en el Service, no el número. Si el Service no tiene puertos con nombre, no funciona.
2. Si la aplicación tiene una `NetworkPolicy` restrictiva, hay que permitir el tráfico desde `openshift-user-workload-monitoring`. Sin eso, el target aparece como `DOWN` con un timeout.
3. Para workloads sin Service (jobs, o pods que no reciben tráfico), usa `PodMonitor` con `podMetricsEndpoints`. Mismo formato, selector sobre labels del pod.

### Consultar las métricas

En la consola, la perspectiva Developer tiene Observe > Metrics filtrada por namespace, y la de Administrator ve todo. Para automatización o para conectar herramientas externas, el punto de entrada es el Thanos Querier:

```bash
TOKEN=$(oc whoami -t)
THANOS=$(oc -n openshift-monitoring get route thanos-querier -o jsonpath='{.spec.host}')

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://$THANOS/api/v1/query" \
  --data-urlencode 'query=sum(rate(http_server_requests_seconds_count{namespace="mi-app-prod"}[5m])) by (uri, status)' | jq
```

Queries que uso a diario con aplicaciones Java instrumentadas con Micrometer:

```promql
# Tasa de peticiones por endpoint
sum(rate(http_server_requests_seconds_count{namespace="mi-app-prod"}[5m])) by (uri)

# Percentil 99 de latencia
histogram_quantile(0.99,
  sum(rate(http_server_requests_seconds_bucket{namespace="mi-app-prod"}[5m])) by (le, uri))

# Ratio de errores 5xx
sum(rate(http_server_requests_seconds_count{namespace="mi-app-prod", status=~"5.."}[5m]))
/
sum(rate(http_server_requests_seconds_count{namespace="mi-app-prod"}[5m]))

# Memoria heap vs límite del contenedor
sum(jvm_memory_used_bytes{namespace="mi-app-prod", area="heap"}) by (pod)
/
sum(container_spec_memory_limit_bytes{namespace="mi-app-prod", container!=""}) by (pod)

# Pool de conexiones de Agroal saturado
agroal_awaiting_count{namespace="mi-app-prod"} > 0
```

## Alertas con PrometheusRule

Las reglas también van en el namespace de la aplicación. Thanos Ruler las evalúa y las envía al Alertmanager de plataforma:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: catalog-service-alerts
  namespace: mi-app-prod
spec:
  groups:
    - name: catalog-service.rules
      rules:
        - alert: CatalogHighErrorRate
          expr: |
            sum(rate(http_server_requests_seconds_count{namespace="mi-app-prod", status=~"5.."}[5m]))
            /
            sum(rate(http_server_requests_seconds_count{namespace="mi-app-prod"}[5m])) > 0.05
          for: 5m
          labels:
            severity: critical
            team: catalog
          annotations:
            summary: "Tasa de errores 5xx superior al 5% en catalog-service"
            runbook_url: "https://wiki.example.com/runbooks/catalog-service#errors"

        - alert: CatalogHighLatencyP99
          expr: |
            histogram_quantile(0.99,
              sum(rate(http_server_requests_seconds_bucket{namespace="mi-app-prod"}[5m])) by (le)) > 1
          for: 10m
          labels:
            severity: warning
            team: catalog
          annotations:
            summary: "P99 de latencia por encima de 1 segundo en catalog-service"

        - alert: CatalogConnectionPoolExhausted
          expr: agroal_awaiting_count{namespace="mi-app-prod"} > 0
          for: 2m
          labels:
            severity: warning
            team: catalog
          annotations:
            summary: "Hay hilos esperando conexión a base de datos en {{ $labels.pod }}"
```

```bash
# Ver el estado de las alertas de usuario
oc -n openshift-user-workload-monitoring exec statefulset/thanos-ruler-user-workload -c thanos-ruler -- \
  curl -s http://localhost:10902/api/v1/alerts | jq '.data.alerts[] | {alert: .labels.alertname, state: .state}'
```

### Enrutar las alertas a los equipos

Por defecto, las alertas de usuario van al Alertmanager de plataforma, cuya configuración solo puede tocar un cluster-admin. Para que cada equipo gestione sus propias rutas (Slack, PagerDuty, correo) sin pasar por el administrador, hay que habilitar el soporte de `AlertmanagerConfig`:

```yaml
# En cluster-monitoring-config (openshift-monitoring)
data:
  config.yaml: |
    enableUserWorkload: true
    alertmanagerMain:
      enableUserAlertmanagerConfig: true
```

Con eso, el equipo crea su propio `AlertmanagerConfig` en su namespace:

```yaml
apiVersion: monitoring.coreos.com/v1beta1
kind: AlertmanagerConfig
metadata:
  name: catalog-team
  namespace: mi-app-prod
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

El webhook vive en un `Secret` (`slack-webhook`) del mismo namespace. El rol `alert-routing-edit` es el que permite a un desarrollador crear este recurso.

Si el cliente necesita un Alertmanager completamente separado para las cargas de usuario (por ejemplo, porque el de plataforma está gestionado por otro equipo), se habilita con `alertmanager: enabled: true` en `user-workload-monitoring-config`.

## Dashboards: consola, Grafana y Cluster Observability Operator

### Dashboards en la consola

La consola de OpenShift permite añadir dashboards propios sin instalar nada. Se crea un ConfigMap con el JSON del dashboard (formato compatible con Grafana) en `openshift-config-managed` con el label `console.openshift.io/dashboard=true`, y aparece en Observe > Dashboards. Es la opción soportada y suficiente para la mayoría de paneles de plataforma; se queda corta cuando se necesitan variables complejas, anotaciones o compartir con gente sin acceso a la consola.

### Grafana como complemento

Cuando el cliente tiene un Grafana corporativo o el equipo de operaciones lo exige, la vía correcta **no** es instalar un Prometheus para Grafana, sino conectar Grafana al Thanos Querier existente. Con el Grafana Operator de la comunidad (disponible en OperatorHub):

```bash
# Service account con permiso de lectura sobre las métricas
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

Hay que dejar claro al cliente que el Grafana Operator es un proyecto comunitario: Red Hat no lo soporta. Lo que sí está soportado es la API del Thanos Querier a la que se conecta.

### Cluster Observability Operator

El Cluster Observability Operator (COO) es la evolución que Red Hat está empujando para observabilidad más allá del monitoreo básico de plataforma. Es un operador opcional, soportado, que se instala desde OperatorHub y aporta dos piezas que resuelven necesidades reales que UWM no cubre:

- **`MonitoringStack`**: despliega instancias de Prometheus y Alertmanager aisladas por namespace o por equipo, con su propio ciclo de vida, retención y recursos. Es la respuesta correcta cuando un tenant necesita un Prometheus propio (multi-tenancy estricta, un ISV que empaqueta su producto, o un equipo que quiere retención de 90 días sin afectar al resto) sin salirse de lo soportado.
- **`UIPlugin`**: extiende la consola con dashboards (basados en Perses), un panel de troubleshooting que correlaciona métricas, logs, traces y alertas a través de Korrel8r, y vistas para distributed tracing y logging cuando están instalados el Tempo Operator y el Logging Operator.

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

Los `ServiceMonitor` que el `MonitoringStack` recoge son los que llevan el label `monitoring.rhobs/stack: catalog-team` (y usan el API group `monitoring.rhobs`, no `monitoring.coreos.com`). Es lo que permite que convivan con UWM sin duplicar scrapes.

Mi recomendación práctica hoy: empieza con UWM, que es gratis y ya está ahí. Pasa a COO cuando aparezca un requisito concreto de aislamiento o de correlación entre señales. No instales COO "por si acaso"; añade complejidad operativa que hay que justificar.

## Y kube-prometheus-stack, ¿cuándo?

Todo lo anterior aplica a OpenShift. Si trabajas con un cluster Kubernetes vanilla (kubeadm, EKS, GKE, AKS, k3s), no hay Cluster Monitoring Operator ni UWM, y ahí `kube-prometheus-stack` sigue siendo una excelente elección:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --set grafana.adminPassword="$(openssl rand -base64 24)" \
  --set prometheus.prometheusSpec.retention=15d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=50Gi
```

Trae el mismo Prometheus Operator, los mismos CRDs (`ServiceMonitor`, `PrometheusRule`) y un Grafana con dashboards de Kubernetes ya cargados. Los manifiestos de `ServiceMonitor` y `PrometheusRule` de este artículo funcionan igual, con una diferencia: por defecto el chart solo detecta recursos con el label `release: <nombre-del-release>`, salvo que pongas `serviceMonitorSelectorNilUsesHelmValues=false`.

La regla es sencilla: en OpenShift, usa lo que viene con el cluster; en Kubernetes vanilla, instala kube-prometheus-stack. Instalar el segundo sobre el primero solo te da dos sistemas que mantener y un ticket de soporte más difícil de abrir.

## Conclusión

El monitoreo en OpenShift no empieza por instalar herramientas, sino por activar y configurar las que ya están. Con `enableUserWorkload: true`, un `ServiceMonitor` en tu namespace y un `PrometheusRule` con las alertas del servicio, tienes un pipeline de métricas en HA, soportado por Red Hat y sin credenciales por defecto expuestas. Grafana es un complemento opcional que se conecta al Thanos Querier, y el Cluster Observability Operator es el siguiente paso cuando necesitas aislamiento por equipo o correlación de señales. Reserva kube-prometheus-stack para los clusters donde realmente no hay nada de esto.
