---
title: "Complete Guide to Helm Charts for Kubernetes"
description: "Learn to create, manage, and deploy applications on Kubernetes using Helm Charts professionally."
pubDate: 2026-01-18
tags: ["kubernetes", "helm", "devops"]
categories: ["kubernetes"]
image: "https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=1200&h=630&fit=crop"
lang: en
---

Helm is the package manager for Kubernetes. Learn how to leverage Helm Charts to simplify deployments.

## What is Helm?

Helm helps you manage Kubernetes applications through Charts - packages of pre-configured Kubernetes resources.

## Creating Your First Chart

```bash
helm create my-app
```

This creates the following structure:

```
my-app/
├── Chart.yaml          # Chart metadata
├── values.yaml         # Default configuration
├── templates/          # Kubernetes manifests
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml
└── charts/             # Dependencies
```

## Values and Templates

### values.yaml

```yaml
replicaCount: 3

image:
  repository: nginx
  tag: "1.21"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80

resources:
  limits:
    cpu: 100m
    memory: 128Mi
```

### deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "my-app.fullname" . }}
spec:
  replicas: {{ .Values.replicaCount }}
  template:
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
```

## Best Practices

1. **Use semantic versioning** for Chart versions
2. **Document values.yaml** with comments
3. **Test charts** with `helm lint` and `helm template`
4. **Use hooks** for migrations and cleanup

## Conclusion

Helm Charts are essential for managing Kubernetes applications at scale. Master them to improve your deployment workflows.
