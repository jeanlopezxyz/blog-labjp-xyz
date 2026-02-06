---
title: "Modern CI/CD with GitHub Actions"
description: "Build professional CI/CD pipelines using GitHub Actions to automate builds, tests, and deployments."
pubDate: 2026-01-16
tags: ["devops", "github-actions", "ci-cd"]
categories: ["devops"]
featured: false
image: "https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=1200&h=630&fit=crop"
lang: en
---

GitHub Actions has become one of the most popular tools for CI/CD. Learn to create professional workflows for your projects.

## Basic Concepts

- **Workflow**: Automated process defined in YAML
- **Job**: Set of steps that run on a runner
- **Step**: Individual task (command or action)
- **Action**: Reusable unit of code
- **Runner**: Server that executes workflows

## Your First Workflow

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

## Build Matrix

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

## Secrets and Environment Variables

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

## Cache to Speed Up Builds

```yaml
- name: Cache dependencies
  uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

## Artifacts and Reports

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

## Deploy to Kubernetes

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

## Reusable Workflows

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

## Conclusion

GitHub Actions offers a powerful and flexible platform to automate your development workflow. With well-designed workflows, you can ensure code quality and significantly accelerate your deployments.
