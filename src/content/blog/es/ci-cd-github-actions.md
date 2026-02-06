---
title: "CI/CD moderno con GitHub Actions"
description: "Construye pipelines de CI/CD profesionales usando GitHub Actions para automatizar builds, tests y despliegues."
pubDate: 2026-01-16
tags: ["devops", "github-actions", "ci-cd"]
categories: ["devops"]
featured: false
image: "https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=1200&h=630&fit=crop"
lang: es
---

GitHub Actions se ha convertido en una de las herramientas más populares para CI/CD. Aprende a crear workflows profesionales para tus proyectos.

## Conceptos básicos

- **Workflow**: Proceso automatizado definido en YAML
- **Job**: Conjunto de steps que se ejecutan en un runner
- **Step**: Tarea individual (comando o action)
- **Action**: Unidad reutilizable de código
- **Runner**: Servidor que ejecuta los workflows

## Tu primer workflow

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
```

## Matriz de builds

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [18, 20, 22]

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm ci
      - run: npm test
```

## Secrets y variables de entorno

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Deploy to server
        env:
          API_KEY: ${{ secrets.API_KEY }}
          DEPLOY_URL: ${{ vars.DEPLOY_URL }}
        run: |
          curl -X POST $DEPLOY_URL \
            -H "Authorization: Bearer $API_KEY"
```

## Cache para acelerar builds

```yaml
- name: Cache dependencies
  uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

## Artefactos y reports

```yaml
- name: Upload test results
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: test-results
    path: coverage/
    retention-days: 30

- name: Download artifact
  uses: actions/download-artifact@v4
  with:
    name: test-results
```

## Deploy a Kubernetes

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: build

    steps:
      - uses: actions/checkout@v4

      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push image
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}

      - name: Deploy to Kubernetes
        uses: azure/k8s-deploy@v4
        with:
          manifests: k8s/
          images: ghcr.io/${{ github.repository }}:${{ github.sha }}
```

## Reusable workflows

```yaml
# .github/workflows/reusable-deploy.yml
name: Reusable Deploy

on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string
    secrets:
      deploy-key:
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    steps:
      - run: echo "Deploying to ${{ inputs.environment }}"
```

## Conclusión

GitHub Actions ofrece una plataforma potente y flexible para automatizar tu flujo de desarrollo. Con workflows bien diseñados, puedes asegurar la calidad de tu código y acelerar tus despliegues de forma significativa.
