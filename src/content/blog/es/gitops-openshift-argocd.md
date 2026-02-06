---
title: "GitOps en OpenShift con ArgoCD"
description: "Implementa flujos de trabajo GitOps en OpenShift usando ArgoCD para despliegues declarativos y automatizados."
pubDate: 2026-01-17
tags: ["openshift", "gitops", "argocd"]
categories: ["openshift"]
featured: true
image: "https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?w=1200&h=630&fit=crop"
lang: es
---

GitOps ha revolucionado la forma en que desplegamos aplicaciones. En este artículo, aprenderás a implementar GitOps en OpenShift usando ArgoCD.

## ¿Qué es GitOps?

GitOps es una práctica donde:

- **Git es la fuente de verdad** para la infraestructura y aplicaciones
- **Los cambios se hacen via Pull Requests**
- **La reconciliación es automática y continua**
- **El estado deseado siempre está versionado**

## Instalando ArgoCD en OpenShift

### Usando el Operador

```bash
# Crear namespace
oc new-project argocd

# Instalar operador desde OperatorHub
# O usar CLI:
oc apply -f - <<EOF
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: argocd-operator
  namespace: openshift-operators
spec:
  channel: alpha
  name: argocd-operator
  source: community-operators
  sourceNamespace: openshift-marketplace
EOF
```

### Crear instancia de ArgoCD

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ArgoCD
metadata:
  name: argocd
  namespace: argocd
spec:
  server:
    route:
      enabled: true
  dex:
    openShiftOAuth: true
  rbac:
    defaultPolicy: 'role:readonly'
    policy: |
      g, system:cluster-admins, role:admin
```

## Estructura del repositorio GitOps

```
gitops-repo/
├── apps/
│   ├── dev/
│   │   ├── kustomization.yaml
│   │   └── patches/
│   ├── staging/
│   └── prod/
├── base/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── kustomization.yaml
└── argocd/
    └── applications.yaml
```

## Creando una Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp-dev
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/gitops-repo
    targetRevision: main
    path: apps/dev
  destination:
    server: https://kubernetes.default.svc
    namespace: myapp-dev
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

## Estrategias de sincronización

### Auto-sync con Self-Heal

```yaml
syncPolicy:
  automated:
    prune: true      # Elimina recursos huérfanos
    selfHeal: true   # Revierte cambios manuales
```

### Sync Waves para orden de despliegue

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "1"
```

## Integración con OpenShift Pipelines

```yaml
# Tekton Task para actualizar imagen
apiVersion: tekton.dev/v1beta1
kind: Task
metadata:
  name: update-gitops
spec:
  params:
    - name: image-tag
  steps:
    - name: update-manifest
      image: alpine/git
      script: |
        git clone $GITOPS_REPO
        cd gitops-repo
        sed -i "s|image:.*|image: myapp:$(params.image-tag)|" base/deployment.yaml
        git commit -am "Update image to $(params.image-tag)"
        git push
```

## Monitoreo y Rollbacks

```bash
# Ver estado de aplicaciones
argocd app list

# Historial de sincronizaciones
argocd app history myapp-dev

# Rollback a versión anterior
argocd app rollback myapp-dev 2

# Sincronización manual
argocd app sync myapp-dev
```

## Conclusión

GitOps con ArgoCD en OpenShift proporciona un flujo de trabajo robusto, auditable y automatizado para gestionar tus despliegues. La combinación de Git como fuente de verdad y la reconciliación continua garantiza que tu cluster siempre refleje el estado deseado.
