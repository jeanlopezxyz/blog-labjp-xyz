---
title: "Guía completa de Helm Charts para Kubernetes"
description: "Helm en producción: estructura de charts, qué cambió con Helm 4, ejemplos empresariales en OpenShift, troubleshooting, rollback y gestión de secrets."
pubDate: 2026-01-18
updatedDate: 2026-09-05
tags: ["kubernetes", "helm", "devops"]
categories: ["kubernetes"]
featured: true
image: "https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=1200&h=630&fit=crop"
lang: es
---

Helm sigue siendo el gestor de paquetes de facto para Kubernetes, y desde noviembre de 2025 tenemos Helm 4, la primera versión mayor en seis años. Llevo bastantes años usándolo en clusters de OpenShift para clientes de banca, retail y sector público, y esta guía es lo que me hubiera gustado leer antes de meter mi primer chart en producción: no solo cómo funciona, sino dónde duele y cómo evitarlo.

## Qué es Helm y cuándo tiene sentido usarlo

Helm empaqueta un conjunto de manifiestos de Kubernetes en una unidad versionada (un **chart**) y los renderiza con valores parametrizables. Los tres conceptos clave:

- **Chart**: el paquete. Plantillas, valores por defecto, metadatos y dependencias.
- **Release**: una instalación concreta de un chart en un namespace. Helm guarda el estado de cada release como un Secret en el cluster, y eso es lo que permite `helm rollback`.
- **Repository / registry**: dónde publicas los charts. Hoy la respuesta correcta es un registry OCI (Quay, Harbor, ACR, ECR), no un índice HTTP.

En mi experiencia, Helm brilla cuando necesitas **distribuir** software a muchos entornos o equipos con distintas configuraciones: un chart de plataforma (ingress, cert-manager, un operador), o una aplicación que despliegas en dev, uat y prod con valores diferentes. Si solo tienes un entorno y unos manifiestos que cambian poco, Kustomize es más simple y no hay que sentir culpa por usarlo. Lo habitual en los clientes con los que trabajo es combinar ambos: Helm para empaquetar, Kustomize o Argo CD para aplicar overlays por entorno.

## Instalación

```bash
# macOS
brew install helm

# Linux (script oficial, instala la última versión estable)
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-4 | bash

# Verificar
helm version
```

Si todavía tienes pipelines fijados a Helm 3, no hay prisa por romper nada, pero sí conviene planificar la migración: el proyecto anunció que Helm 3 solo recibe parches de seguridad durante un periodo limitado tras la salida de Helm 4.

## Qué cambió en Helm 4

Helm 4.0.0 se publicó en noviembre de 2025, coincidiendo con KubeCon North America. Lo importante para quien administra clusters es que **los charts existentes siguen funcionando**: `apiVersion: v2` en `Chart.yaml` se mantiene y el lenguaje de templates es el mismo. Los cambios de fondo son otros:

**Server-Side Apply.** Helm 4 puede aplicar recursos usando Server-Side Apply de Kubernetes en lugar del three-way merge clásico del cliente. Esto reduce los conflictos cuando otro controlador (un operador, un HPA, un mutating webhook) también toca los recursos. Se activa con `--server-side` en `install` y `upgrade`, y en mi opinión debería ser la opción por defecto en cualquier cluster nuevo.

**`--wait` basado en kstatus.** El comportamiento de `--wait` en Helm 3 era bastante ingenuo: miraba pods y poco más. Helm 4 usa la librería kstatus para evaluar el estado real de cada recurso, incluidos CRDs con condiciones. Esto se nota especialmente al instalar operadores o charts con recursos custom.

**Plugins como WebAssembly.** El sistema de plugins se rediseñó. Además de los plugins clásicos (binarios en `$HELM_PLUGINS`), Helm 4 soporta plugins Wasm sandboxeados y define tipos de plugin claros: CLI, getters (para descargar charts de fuentes custom) y post-renderers. Esto es relevante porque `helm-secrets` y otros plugins populares han tenido que adaptarse.

**OCI como ciudadano de primera clase.** El soporte OCI ya era estable en Helm 3.8, pero en Helm 4 es el camino principal: `helm push`, `helm pull` y las dependencias en `Chart.yaml` apuntan a `oci://` sin flags experimentales, y la integración con `cosign` para firmar charts es mucho más limpia.

**SDK de Go incompatible.** El módulo pasa a `helm.sh/helm/v4` y se reorganizaron paquetes internos. Si tienes tooling propio escrito contra el SDK (yo tengo un par de scripts para auditar releases), te toca refactorizar.

**Limpieza de deprecaciones.** Desaparecen comportamientos marcados como deprecated durante todo el ciclo de Helm 3, y el logging pasa a `slog`. Nada dramático, pero revisa tus pipelines si parseaban la salida de `helm` con `grep`.

Lo que **no** cambió, y agradezco: no hay componente en el servidor (Tiller sigue muerto), no hay que migrar releases como pasó de Helm 2 a 3, y los mismos binarios conviven sin problema.

## Estructura de un chart

```
payments-api/
├── Chart.yaml           # Metadatos, versión y dependencias
├── Chart.lock           # Versiones resueltas de dependencias
├── values.yaml          # Valores por defecto
├── values.schema.json   # Validación de valores (úsalo)
├── charts/              # Dependencias descargadas
├── templates/
│   ├── _helpers.tpl     # Funciones reutilizables
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── route.yaml       # En OpenShift, Route en lugar de Ingress
│   ├── servicemonitor.yaml
│   ├── pdb.yaml
│   ├── networkpolicy.yaml
│   └── NOTES.txt
└── .helmignore
```

## Un chart realista para OpenShift

Olvidémonos de nginx con tres réplicas. Este es el esqueleto de un chart que uso como base para microservicios Java (Quarkus o Spring Boot) desplegados en OpenShift, recortado a lo esencial.

### Chart.yaml

```yaml
apiVersion: v2
name: payments-api
description: Servicio de pagos (Quarkus) para la plataforma core
type: application
version: 1.4.2        # versión del chart (SemVer)
appVersion: "2.11.0"  # versión de la aplicación
kubeVersion: ">=1.28.0-0"
dependencies:
  - name: common-lib
    version: "0.3.x"
    repository: oci://quay.io/mi-org/charts
```

Una regla que aplico a rajatabla: `version` y `appVersion` se mueven de forma independiente. Cambiar una imagen no siempre implica cambiar el chart, y cambiar un template no implica una nueva versión de la app.

### values.yaml

```yaml
replicaCount: 2

image:
  repository: quay.io/mi-org/payments-api
  tag: ""                # vacío -> usa appVersion
  pullPolicy: IfNotPresent

resources:
  requests:
    cpu: 250m
    memory: 512Mi
  limits:
    memory: 512Mi        # sin limit de CPU, a propósito

route:
  enabled: true
  host: ""               # vacío -> OpenShift genera el hostname
  tls:
    termination: edge
    insecureEdgeTerminationPolicy: Redirect

config:
  quarkus:
    datasource:
      jdbcUrl: jdbc:postgresql://payments-db:5432/payments
  featureFlags:
    newCheckout: false

secretRef: payments-api-secrets   # Secret gestionado fuera del chart

metrics:
  serviceMonitor:
    enabled: true

podDisruptionBudget:
  enabled: true
  minAvailable: 1
```

Fíjate en dos decisiones: no pongo límite de CPU (throttling innecesario en JVM), y los secrets **no viven en el chart**. Más abajo explico cómo gestionarlos.

### templates/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "payments-api.fullname" . }}
  labels:
    {{- include "payments-api.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "payments-api.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "payments-api.selectorLabels" . | nindent 8 }}
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: 8080
          envFrom:
            - secretRef:
                name: {{ .Values.secretRef }}
          volumeMounts:
            - name: config
              mountPath: /deployments/config
              readOnly: true
          readinessProbe:
            httpGet:
              path: /q/health/ready
              port: http
          livenessProbe:
            httpGet:
              path: /q/health/live
              port: http
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
      volumes:
        - name: config
          configMap:
            name: {{ include "payments-api.fullname" . }}
```

La anotación `checksum/config` es un truco viejo pero imprescindible: cuando cambia el ConfigMap, cambia el hash, y el Deployment hace rollout. Sin esto, cambias configuración y los pods siguen leyendo la vieja hasta que alguien los reinicia a mano. Lo he visto pasar en producción más veces de las que me gustaría.

### templates/route.yaml

```yaml
{{- if .Values.route.enabled }}
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: {{ include "payments-api.fullname" . }}
  labels:
    {{- include "payments-api.labels" . | nindent 4 }}
spec:
  {{- with .Values.route.host }}
  host: {{ . }}
  {{- end }}
  to:
    kind: Service
    name: {{ include "payments-api.fullname" . }}
  port:
    targetPort: http
  tls:
    {{- toYaml .Values.route.tls | nindent 4 }}
{{- end }}
```

Si el chart tiene que funcionar también en Kubernetes vanilla, lo habitual es un `ingress.yaml` condicionado a `.Capabilities.APIVersions.Has "route.openshift.io/v1"`.

### values.schema.json

```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["image", "secretRef"],
  "properties": {
    "replicaCount": { "type": "integer", "minimum": 1 },
    "image": {
      "type": "object",
      "required": ["repository"],
      "properties": {
        "repository": { "type": "string", "pattern": "^[a-z0-9./-]+$" },
        "tag": { "type": "string" }
      }
    },
    "secretRef": { "type": "string", "minLength": 1 }
  }
}
```

El schema falla en `helm install` antes de tocar el cluster. Cada vez que un equipo me dice "el chart no valida", la respuesta casi siempre es un typo en un values de entorno que el schema habría cazado.

## Comandos que uso a diario

```bash
# Renderizar sin instalar (lo primero que hago, siempre)
helm template payments ./payments-api -f values-uat.yaml

# Instalar / actualizar de forma idempotente
helm upgrade --install payments ./payments-api \
  -n payments --create-namespace \
  -f values-uat.yaml \
  --server-side --wait --timeout 5m --atomic

# Ver qué hay instalado y con qué valores
helm list -n payments
helm get values payments -n payments
helm get manifest payments -n payments

# Publicar en OCI
helm package ./payments-api
helm push payments-api-1.4.2.tgz oci://quay.io/mi-org/charts

# Instalar desde OCI fijando versión
helm upgrade --install payments oci://quay.io/mi-org/charts/payments-api \
  --version 1.4.2 -n payments -f values-prod.yaml
```

`--atomic` merece una mención: si el upgrade falla o no pasa el `--wait`, Helm hace rollback automático a la revisión anterior. En un pipeline es la diferencia entre una release fallida limpia y un cluster a medias.

## Troubleshooting

### Ver exactamente qué va a aplicar Helm

```bash
helm upgrade --install payments ./payments-api -f values-prod.yaml \
  --dry-run=server --debug
```

`--debug` imprime los valores calculados y los manifiestos renderizados. `--dry-run=server` (en lugar de `client`) valida además contra la API del cluster, con lo que cazas CRDs que faltan o campos inválidos. Cuando un template te da un error del tipo `nil pointer evaluating interface {}.foo`, casi siempre es un valor que asumes presente y no lo está; `--debug` te muestra los values efectivos y lo ves en segundos.

### Rollback

```bash
helm history payments -n payments
helm rollback payments 7 -n payments --wait
```

Dos cosas que aprendí a la fuerza. Primera: `helm rollback` restaura los manifiestos de esa revisión, pero **no** revierte nada que el chart no gestione (una migración de base de datos ejecutada por un hook, por ejemplo). Segunda: el historial se guarda en Secrets del namespace; si alguien limpia secrets "huérfanos" con un script agresivo, te quedas sin historial. Fija `--history-max` a un valor razonable (10 por defecto) y déjalo en paz.

### Release atascada en `pending-upgrade`

Pasa cuando un pipeline muere a mitad de un upgrade. Helm se niega a hacer nada hasta que resuelves el estado:

```bash
helm history payments -n payments   # identifica la revisión pending
helm rollback payments <última-revisión-deployed> -n payments
```

Si el rollback tampoco sale, la salida de emergencia es borrar el Secret de la revisión pending (`sh.helm.release.v1.payments.v8`) y volver a intentar. Documenta el procedimiento en tu runbook antes de necesitarlo a las tres de la mañana.

### Recursos que Helm no reconoce como suyos

Error típico: `rendered manifests contain a resource that already exists`. Ocurre cuando alguien creó el recurso a mano o con otro chart. Solución: adoptarlo con las anotaciones de propiedad.

```bash
kubectl annotate configmap payments-config \
  meta.helm.sh/release-name=payments \
  meta.helm.sh/release-namespace=payments
kubectl label configmap payments-config app.kubernetes.io/managed-by=Helm
```

### Testing del chart

```bash
helm lint ./payments-api -f values-prod.yaml
helm unittest ./payments-api      # plugin helm-unittest
helm test payments -n payments    # ejecuta los pods anotados como test hooks
```

`helm-unittest` merece la pena en charts compartidos entre equipos: cada vez que alguien "arregla" un helper, los tests te dicen qué se rompió.

## Gestión de secrets

Mi postura es firme: **los secrets no van en `values.yaml` ni en el chart**. Tres enfoques, de menos a más maduro:

**1. `helm-secrets` + SOPS.** Cifras un `secrets.yaml` con SOPS (usando age, GPG o una KMS en la nube) y el plugin lo descifra al vuelo.

```bash
sops --encrypt --age <clave-pública> secrets.yaml > secrets.enc.yaml
helm secrets upgrade --install payments ./payments-api \
  -f values-prod.yaml -f secrets://secrets.enc.yaml
```

Funciona bien para equipos pequeños. El archivo cifrado se commitea sin miedo. La pega: la clave de descifrado tiene que vivir en el runner del pipeline.

**2. External Secrets Operator.** El chart crea un `ExternalSecret` que apunta a Vault, AWS Secrets Manager o similar, y el operador materializa el Secret en el cluster. El chart no ve el valor jamás, solo la referencia. Es lo que recomiendo en OpenShift empresarial.

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: {{ .Values.secretRef }}
spec:
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: {{ .Values.secretRef }}
  dataFrom:
    - extract:
        key: apps/payments-api/{{ .Values.environment }}
```

**3. Sealed Secrets.** Cifrado asimétrico con una clave que solo el controlador del cluster puede abrir. Simple y sin dependencias externas, pero la rotación de la clave del controlador es más incómoda de lo que parece.

En cualquiera de los tres casos, el chart solo sabe el **nombre** del Secret (`secretRef`), y esa es la abstracción correcta.

## Buenas prácticas que de verdad importan

1. **Publica en OCI y fija versiones.** `latest` no existe en producción.
2. **`values.schema.json` desde el día uno.** Es barato y ahorra incidentes.
3. **Checksum de ConfigMaps en las anotaciones del pod.** Si no, tus cambios de configuración no se aplican.
4. **`helm upgrade --install --atomic --wait`** en pipelines. Nunca `helm install` a secas.
5. **Un `values-<entorno>.yaml` por entorno**, versionado en Git, y nada de `--set` en producción salvo para la tag de imagen.
6. **No metas CRDs en `templates/`.** Van en `crds/` (Helm no las actualiza, y eso es a propósito) o, mejor, en un chart separado que se despliega antes.
7. **Hooks con cabeza.** Un `pre-upgrade` hook para migraciones de base de datos está bien; diez hooks encadenados son un sistema de orquestación mal disfrazado.
8. **Etiquetas estándar** (`app.kubernetes.io/*`) en todo. Los dashboards, las NetworkPolicies y el soporte de Red Hat te lo agradecerán.

## Conclusión

Helm no es glamuroso y tiene sus rarezas, pero con Helm 4 el proyecto ha corregido varias de las que más molestaban en operación: server-side apply, un `--wait` que dice la verdad y OCI como camino principal. La clave no está en conocer todas las funciones de Sprig, sino en decidir bien qué va en el chart, qué va en los values de entorno y qué no debe estar en ninguno de los dos. Si te llevas una sola idea de este artículo, que sea esa.
