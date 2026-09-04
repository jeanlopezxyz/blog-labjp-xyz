---
title: "Complete Guide to Helm Charts for Kubernetes"
description: "Helm in production: chart structure, what changed in Helm 4, enterprise-grade examples on OpenShift, troubleshooting, rollbacks and secrets management."
pubDate: 2026-09-05
updatedDate: 2026-09-05
tags: ["kubernetes", "helm", "devops"]
categories: ["kubernetes"]
featured: true
image: "https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=1200&h=630&fit=crop"
lang: en
---

Helm is still the de facto package manager for Kubernetes, and since November 2025 we have Helm 4, the first major release in six years. I've been running it on OpenShift clusters for banking, retail and public-sector customers for a good while now, and this guide is the one I wish I'd read before shipping my first chart to production: not just how Helm works, but where it bites and how to avoid it.

## What Helm is, and when it's the right tool

Helm bundles a set of Kubernetes manifests into a versioned unit (a **chart**) and renders them with configurable values. Three concepts matter:

- **Chart**: the package. Templates, default values, metadata and dependencies.
- **Release**: one installation of a chart into a namespace. Helm stores the state of each release as a Secret in the cluster, which is what makes `helm rollback` possible.
- **Repository / registry**: where you publish charts. The right answer today is an OCI registry (Quay, Harbor, ACR, ECR), not an HTTP index.

In my experience Helm shines when you need to **distribute** software to many environments or teams with different configurations: a platform chart (ingress, cert-manager, an operator), or an application you deploy to dev, uat and prod with different values. If you have one environment and a set of manifests that rarely change, Kustomize is simpler and there's no shame in using it. What I see most often at customers is a mix: Helm to package, Kustomize or Argo CD to apply per-environment overlays.

## Installation

```bash
# macOS
brew install helm

# Linux (official script, installs the latest stable release)
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-4 | bash

# Verify
helm version
```

If your pipelines are still pinned to Helm 3, nothing is on fire, but do plan the migration: the project announced that Helm 3 only receives security patches for a limited window after the Helm 4 release.

## What changed in Helm 4

Helm 4.0.0 shipped in November 2025, timed with KubeCon North America. The headline for anyone operating clusters is that **existing charts keep working**: `apiVersion: v2` in `Chart.yaml` is still supported and the template language is unchanged. The real changes are under the hood:

**Server-Side Apply.** Helm 4 can apply resources using Kubernetes Server-Side Apply instead of the classic client-side three-way merge. That cuts down on conflicts when another controller (an operator, an HPA, a mutating webhook) also touches the resources. Enable it with `--server-side` on `install` and `upgrade`; in my opinion it should be the default on any new cluster.

**`--wait` backed by kstatus.** Helm 3's `--wait` was fairly naive: it looked at pods and not much else. Helm 4 uses the kstatus library to evaluate the actual readiness of every resource, including CRDs with status conditions. You notice the difference immediately when installing operators or charts that ship custom resources.

**WebAssembly plugins.** The plugin system was redesigned. Alongside classic plugins (binaries under `$HELM_PLUGINS`), Helm 4 supports sandboxed Wasm plugins and defines explicit plugin types: CLI, getters (for fetching charts from custom sources) and post-renderers. This matters because `helm-secrets` and other popular plugins had to adapt.

**OCI as a first-class citizen.** OCI support was already stable in Helm 3.8, but in Helm 4 it's the main path: `helm push`, `helm pull` and dependencies in `Chart.yaml` point at `oci://` with no experimental flags, and signing charts with `cosign` is a much cleaner story.

**Breaking Go SDK.** The module moved to `helm.sh/helm/v4` and internal packages were reorganised. If you maintain tooling against the SDK (I have a couple of scripts that audit releases), expect to refactor.

**Deprecation cleanup.** Behaviours flagged as deprecated throughout the Helm 3 cycle are gone, and logging moved to `slog`. Nothing dramatic, but check any pipeline that parsed `helm` output with `grep`.

What did **not** change, and I'm grateful for it: there is still no server-side component (Tiller stays dead), there's no release migration like the Helm 2 to 3 jump, and both binaries coexist on the same machine without drama.

## Anatomy of a chart

```
payments-api/
├── Chart.yaml           # Metadata, version and dependencies
├── Chart.lock           # Resolved dependency versions
├── values.yaml          # Default values
├── values.schema.json   # Value validation (use it)
├── charts/              # Downloaded dependencies
├── templates/
│   ├── _helpers.tpl     # Reusable template functions
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── route.yaml       # On OpenShift, a Route instead of an Ingress
│   ├── servicemonitor.yaml
│   ├── pdb.yaml
│   ├── networkpolicy.yaml
│   └── NOTES.txt
└── .helmignore
```

## A realistic chart for OpenShift

Let's skip nginx with three replicas. This is the skeleton of the chart I use as a starting point for Java microservices (Quarkus or Spring Boot) on OpenShift, trimmed to the essentials.

### Chart.yaml

```yaml
apiVersion: v2
name: payments-api
description: Payments service (Quarkus) for the core platform
type: application
version: 1.4.2        # chart version (SemVer)
appVersion: "2.11.0"  # application version
kubeVersion: ">=1.28.0-0"
dependencies:
  - name: common-lib
    version: "0.3.x"
    repository: oci://quay.io/my-org/charts
```

One rule I enforce without exceptions: `version` and `appVersion` move independently. Bumping an image doesn't always mean bumping the chart, and changing a template doesn't mean a new version of the app.

### values.yaml

```yaml
replicaCount: 2

image:
  repository: quay.io/my-org/payments-api
  tag: ""                # empty -> falls back to appVersion
  pullPolicy: IfNotPresent

resources:
  requests:
    cpu: 250m
    memory: 512Mi
  limits:
    memory: 512Mi        # no CPU limit, on purpose

route:
  enabled: true
  host: ""               # empty -> OpenShift generates the hostname
  tls:
    termination: edge
    insecureEdgeTerminationPolicy: Redirect

config:
  quarkus:
    datasource:
      jdbcUrl: jdbc:postgresql://payments-db:5432/payments
  featureFlags:
    newCheckout: false

secretRef: payments-api-secrets   # Secret managed outside the chart

metrics:
  serviceMonitor:
    enabled: true

podDisruptionBudget:
  enabled: true
  minAvailable: 1
```

Two deliberate choices here: no CPU limit (needless throttling on a JVM), and secrets **do not live in the chart**. More on that below.

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

The `checksum/config` annotation is an old trick, but a non-negotiable one: when the ConfigMap changes, the hash changes, and the Deployment rolls out. Without it you change configuration and the pods keep reading the old one until someone restarts them by hand. I've seen that in production more often than I'd like.

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

If the chart also has to run on vanilla Kubernetes, the usual approach is an `ingress.yaml` gated on `.Capabilities.APIVersions.Has "route.openshift.io/v1"`.

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

The schema fails `helm install` before anything touches the cluster. Every time a team tells me "the chart doesn't validate", the cause is almost always a typo in an environment values file that the schema would have caught.

## Commands I use every day

```bash
# Render without installing (always my first step)
helm template payments ./payments-api -f values-uat.yaml

# Install or upgrade idempotently
helm upgrade --install payments ./payments-api \
  -n payments --create-namespace \
  -f values-uat.yaml \
  --server-side --wait --timeout 5m --atomic

# See what's installed and with which values
helm list -n payments
helm get values payments -n payments
helm get manifest payments -n payments

# Publish to OCI
helm package ./payments-api
helm push payments-api-1.4.2.tgz oci://quay.io/my-org/charts

# Install from OCI, pinned
helm upgrade --install payments oci://quay.io/my-org/charts/payments-api \
  --version 1.4.2 -n payments -f values-prod.yaml
```

`--atomic` deserves a callout: if the upgrade fails or doesn't pass `--wait`, Helm rolls back to the previous revision automatically. In a pipeline that's the difference between a clean failed release and a half-applied cluster.

## Troubleshooting

### See exactly what Helm is about to apply

```bash
helm upgrade --install payments ./payments-api -f values-prod.yaml \
  --dry-run=server --debug
```

`--debug` prints the computed values and the rendered manifests. `--dry-run=server` (rather than `client`) also validates against the cluster API, so you catch missing CRDs or invalid fields. When a template throws something like `nil pointer evaluating interface {}.foo`, it's almost always a value you assumed was set and isn't; `--debug` shows the effective values and you spot it in seconds.

### Rollback

```bash
helm history payments -n payments
helm rollback payments 7 -n payments --wait
```

Two lessons I learned the hard way. First: `helm rollback` restores the manifests of that revision, but it does **not** undo anything the chart doesn't manage (a database migration run by a hook, for example). Second: the history lives in Secrets in the namespace; if someone sweeps "orphaned" secrets with an over-eager script, your history is gone. Set `--history-max` to something sensible (10 is the default) and leave it alone.

### Release stuck in `pending-upgrade`

This happens when a pipeline dies halfway through an upgrade. Helm refuses to do anything until you resolve the state:

```bash
helm history payments -n payments   # find the pending revision
helm rollback payments <last-deployed-revision> -n payments
```

If the rollback fails too, the escape hatch is deleting the Secret for the pending revision (`sh.helm.release.v1.payments.v8`) and retrying. Write this procedure into your runbook before you need it at three in the morning.

### Resources Helm doesn't recognise as its own

The classic error: `rendered manifests contain a resource that already exists`. It shows up when someone created the resource by hand or from another chart. The fix is to adopt it with the ownership annotations.

```bash
kubectl annotate configmap payments-config \
  meta.helm.sh/release-name=payments \
  meta.helm.sh/release-namespace=payments
kubectl label configmap payments-config app.kubernetes.io/managed-by=Helm
```

### Testing the chart

```bash
helm lint ./payments-api -f values-prod.yaml
helm unittest ./payments-api      # helm-unittest plugin
helm test payments -n payments    # runs pods annotated as test hooks
```

`helm-unittest` earns its keep on charts shared across teams: every time someone "fixes" a helper, the tests tell you what broke.

## Secrets management

I'm firm on this: **secrets do not go in `values.yaml` or in the chart**. Three approaches, from least to most mature:

**1. `helm-secrets` + SOPS.** You encrypt a `secrets.yaml` with SOPS (using age, GPG or a cloud KMS) and the plugin decrypts it on the fly.

```bash
sops --encrypt --age <public-key> secrets.yaml > secrets.enc.yaml
helm secrets upgrade --install payments ./payments-api \
  -f values-prod.yaml -f secrets://secrets.enc.yaml
```

Works well for small teams. The encrypted file can be committed safely. The catch: the decryption key has to live on the pipeline runner.

**2. External Secrets Operator.** The chart creates an `ExternalSecret` pointing at Vault, AWS Secrets Manager or similar, and the operator materialises the Secret in the cluster. The chart never sees the value, only the reference. This is what I recommend on enterprise OpenShift.

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

**3. Sealed Secrets.** Asymmetric encryption with a key only the in-cluster controller can open. Simple and dependency-free, but rotating the controller key is more awkward than it looks.

In all three cases the chart only knows the **name** of the Secret (`secretRef`), and that's the right abstraction.

## Best practices that actually matter

1. **Publish to OCI and pin versions.** `latest` does not exist in production.
2. **`values.schema.json` from day one.** It's cheap and it prevents incidents.
3. **ConfigMap checksums in pod annotations.** Otherwise your config changes don't roll out.
4. **`helm upgrade --install --atomic --wait`** in pipelines. Never a bare `helm install`.
5. **One `values-<env>.yaml` per environment**, versioned in Git, and no `--set` in production except for the image tag.
6. **Keep CRDs out of `templates/`.** They belong in `crds/` (Helm won't upgrade them, and that's intentional) or, better, in a separate chart deployed first.
7. **Hooks with restraint.** A `pre-upgrade` hook for database migrations is fine; ten chained hooks are an orchestration system in disguise.
8. **Standard labels** (`app.kubernetes.io/*`) on everything. Dashboards, NetworkPolicies and Red Hat support will thank you.

## Conclusion

Helm isn't glamorous and it has its quirks, but Helm 4 fixed several of the ones that hurt most in operations: server-side apply, a `--wait` that tells the truth, and OCI as the main path. Mastery isn't about knowing every Sprig function; it's about deciding what belongs in the chart, what belongs in the environment values, and what belongs in neither. If you take one idea from this article, make it that one.
