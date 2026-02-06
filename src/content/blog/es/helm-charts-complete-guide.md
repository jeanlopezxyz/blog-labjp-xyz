---
title: "Guia completa de Helm Charts para Kubernetes"
description: "Aprende a crear, gestionar y desplegar aplicaciones en Kubernetes usando Helm Charts de forma profesional."
pubDate: 2026-01-18
tags: ["kubernetes", "helm", "devops"]
categories: ["kubernetes"]
featured: true
image: "https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=1200&h=630&fit=crop"
lang: es
---

Helm es el gestor de paquetes de facto para Kubernetes. En esta guía aprenderás todo lo necesario para dominar Helm Charts.

## ¿Qué es Helm?

Helm simplifica el despliegue de aplicaciones en Kubernetes mediante:

- **Charts**: Paquetes pre-configurados de recursos Kubernetes
- **Releases**: Instancias de charts desplegadas en el cluster
- **Repositories**: Colecciones de charts compartibles

## Instalación de Helm

```bash
# macOS
brew install helm

# Linux
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Verificar instalación
helm version
```

## Estructura de un Chart

```
mychart/
├── Chart.yaml          # Metadata del chart
├── values.yaml         # Valores por defecto
├── charts/             # Dependencias
├── templates/          # Plantillas de recursos
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── _helpers.tpl
│   └── NOTES.txt
└── .helmignore
```

## Creando tu primer Chart

```bash
helm create myapp
```

### Chart.yaml

```yaml
apiVersion: v2
name: myapp
description: Mi primera aplicación Helm
version: 0.1.0
appVersion: "1.0.0"
```

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

ingress:
  enabled: true
  hostname: myapp.local
```

### templates/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "myapp.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "myapp.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          ports:
            - containerPort: 80
```

## Comandos esenciales

```bash
# Instalar un chart
helm install myrelease ./mychart

# Actualizar una release
helm upgrade myrelease ./mychart

# Ver releases instaladas
helm list

# Desinstalar
helm uninstall myrelease

# Ver valores actuales
helm get values myrelease

# Renderizar templates sin instalar
helm template myrelease ./mychart
```

## Mejores prácticas

1. **Usa valores por defecto sensatos** en `values.yaml`
2. **Documenta cada valor** con comentarios
3. **Valida los valores** con JSON Schema
4. **Usa helpers** para evitar repetición
5. **Incluye NOTES.txt** con instrucciones post-instalación

## Conclusión

Helm es una herramienta indispensable para gestionar aplicaciones en Kubernetes. Dominar los charts te permitirá estandarizar y automatizar tus despliegues de forma profesional.
