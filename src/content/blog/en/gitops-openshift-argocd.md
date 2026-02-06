---
title: "GitOps on OpenShift with ArgoCD"
description: "Implement GitOps workflows on OpenShift using ArgoCD for declarative and automated deployments."
pubDate: 2026-01-17
tags: ["openshift", "gitops", "argocd"]
categories: ["openshift"]
image: "https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?w=1200&h=630&fit=crop"
lang: en
---

GitOps is a modern approach to continuous delivery that uses Git as the single source of truth for declarative infrastructure and applications.

## What is GitOps?

GitOps principles:

- **Declarative**: Everything is described in Git
- **Versioned**: Full history of changes
- **Automated**: Changes applied automatically
- **Auditable**: Who changed what and when

## Installing ArgoCD on OpenShift

```bash
# Create namespace
oc new-project argocd

# Install ArgoCD operator from OperatorHub
oc apply -f - <<EOF
apiVersion: argoproj.io/v1alpha1
kind: ArgoCD
metadata:
  name: argocd
  namespace: argocd
spec:
  server:
    route:
      enabled: true
EOF
```

## Creating an Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/org/my-app.git
    targetRevision: main
    path: k8s/overlays/production
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

## Directory Structure

```
my-app/
├── base/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── kustomization.yaml
└── overlays/
    ├── development/
    │   └── kustomization.yaml
    └── production/
        └── kustomization.yaml
```

## Benefits

1. **Consistency**: Same deployment process everywhere
2. **Recovery**: Easy rollback via Git revert
3. **Security**: No direct cluster access needed
4. **Compliance**: Full audit trail

## Conclusion

GitOps with ArgoCD on OpenShift provides a robust, auditable, and automated deployment pipeline. Embrace the GitOps model to improve your delivery velocity and reliability.
