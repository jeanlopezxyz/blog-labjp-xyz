---
title: "Modern CI/CD with GitHub Actions (and When to Reach for Tekton)"
description: "Production-grade CI/CD with GitHub Actions: build, test, container image and deployment to Kubernetes/OpenShift, plus an honest comparison with Tekton and OpenShift Pipelines."
pubDate: 2026-01-16
updatedDate: 2026-09-05
tags: ["devops", "github-actions", "ci-cd", "tekton", "openshift-pipelines"]
categories: ["devops", "openshift"]
featured: false
image: "https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=1200&h=630&fit=crop"
lang: en
---

I have built pipelines for every kind of customer: startups that live on GitHub and refuse to operate anything, and banks where not a single line of CI is allowed to run outside the cluster. GitHub Actions is, by a wide margin, the fastest way to get a working pipeline. But "fast" is not the same as "right for your context", and this post covers both sides: how to build a GitHub Actions pipeline that survives production, and when I have had to say "not here, this one goes to Tekton".

I rewrote this article because the original examples used Node 20, which reaches end of life in April 2026. Every example now targets Node 22 (the active LTS). If you are on a Java project, the same patterns apply with `setup-java` instead of `setup-node`.

## The concepts in 30 seconds

- **Workflow**: a YAML file under `.github/workflows/` that reacts to events (push, PR, cron, manual dispatch)
- **Job**: a unit of execution on a runner; jobs run in parallel unless you declare `needs`
- **Step**: a single command or action inside a job
- **Action**: a reusable piece, either your own or from the marketplace
- **Runner**: the machine that runs the job, GitHub-hosted or self-hosted

The thing that trips people up early: every job starts on a clean machine. If you build something in `build` and need it in `deploy`, you either pass it as an artifact or rebuild it.

## A baseline workflow you will not be embarrassed by

This is where I start on nearly every repo. Notice three details that most tutorials skip: least-privilege `permissions`, `concurrency` to cancel stale runs, and dependency `cache` handled directly by `setup-node`.

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test -- --coverage

      - name: Build
        run: npm run build

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage
          path: coverage/
          retention-days: 14
```

`permissions: contents: read` is the difference between a `GITHUB_TOKEN` that can only read the repo and one that can write to it if a compromised dependency decides to. Always set it, and widen it only on the job that actually needs more.

## Version matrix

When you maintain a library you want to validate against several runtimes. Here I test the active LTS (22) and the next one (24). Node 20 is gone from the matrix because burning CI minutes on a version about to stop receiving security patches makes no sense.

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
        node: [22, 24]

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'
      - run: npm ci
      - run: npm test
```

`fail-fast: false` matters: if Windows with Node 24 fails, I still want to see what happened on the other combinations rather than have them cancelled.

## Secrets, variables and environments

GitHub environments are the most underused feature in the platform. They give you per-environment secrets, required reviewers before a production deploy, and branch restrictions.

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://app.example.com

    steps:
      - name: Notify deployment API
        env:
          API_KEY: ${{ secrets.API_KEY }}
          DEPLOY_URL: ${{ vars.DEPLOY_URL }}
        run: |
          curl -fsS -X POST "$DEPLOY_URL" \
            -H "Authorization: Bearer $API_KEY"
```

Rule of thumb: `secrets` for credentials, `vars` for non-sensitive configuration (URLs, namespace names, flags). And never interpolate a secret straight into `run:` with `${{ }}`; route it through `env:` so it does not land in the log when the shell fails.

## Caching beyond npm

`setup-node` with `cache: 'npm'` covers the common case. For anything else (Maven, Gradle, the pnpm store, system dependencies) I use `actions/cache` with a key derived from the lockfile hash.

```yaml
- name: Cache Maven repository
  uses: actions/cache@v4
  with:
    path: ~/.m2/repository
    key: ${{ runner.os }}-maven-${{ hashFiles('**/pom.xml') }}
    restore-keys: |
      ${{ runner.os }}-maven-
```

`restore-keys` is what stops a small `pom.xml` change from forcing a full download: it restores the most recent cache matching the prefix.

## Full pipeline: build, image and deploy to a cluster

This is the pipeline that actually matters. Three chained jobs: verify the code, build and push the image to GHCR, and deploy to the cluster using a kubeconfig stored as a secret.

```yaml
# .github/workflows/deploy.yml
name: Build and Deploy

on:
  push:
    branches: [main]

permissions:
  contents: read
  packages: write

env:
  IMAGE: ghcr.io/${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm test

  image:
    runs-on: ubuntu-latest
    needs: test
    outputs:
      digest: ${{ steps.push.outputs.digest }}
    steps:
      - uses: actions/checkout@v4

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        id: push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ${{ env.IMAGE }}:${{ github.sha }}
            ${{ env.IMAGE }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    runs-on: ubuntu-latest
    needs: image
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Install kubectl
        uses: azure/setup-kubectl@v4

      - name: Configure kubeconfig
        env:
          KUBECONFIG_B64: ${{ secrets.KUBECONFIG_B64 }}
        run: |
          mkdir -p ~/.kube
          echo "$KUBECONFIG_B64" | base64 -d > ~/.kube/config
          chmod 600 ~/.kube/config

      - name: Deploy
        env:
          NAMESPACE: ${{ vars.K8S_NAMESPACE }}
        run: |
          kubectl -n "$NAMESPACE" set image deployment/my-app \
            my-app=${{ env.IMAGE }}@${{ needs.image.outputs.digest }}
          kubectl -n "$NAMESPACE" rollout status deployment/my-app --timeout=180s
```

A few decisions baked into that YAML that I learned the hard way:

- **Deploy by digest, not by tag.** `${{ needs.image.outputs.digest }}` guarantees that what gets deployed is exactly what was built. A `latest` tag can move under your feet.
- **`rollout status` with a timeout.** Without it, the job goes green even when the Deployment sits in `CrashLoopBackOff`. With it, the pipeline fails and somebody finds out.
- **The kubeconfig belongs to a ServiceAccount with minimal RBAC**, not `kubeadmin`. A Role that can only `get/patch` Deployments in the namespace and `get` pods for the rollout check. If the secret leaks, the blast radius is one namespace.
- **`cache-from/to: type=gha`** so image layers are cached across runs. On Java images with multi-stage builds this cuts build time dramatically.

If the target is OpenShift, I swap `kubectl` for `oc` using Red Hat's official actions (`redhat-actions/oc-installer` and `redhat-actions/oc-login`), which also let you authenticate with a ServiceAccount token instead of a full kubeconfig:

```yaml
      - uses: redhat-actions/oc-installer@v1
      - uses: redhat-actions/oc-login@v1
        with:
          openshift_server_url: ${{ vars.OPENSHIFT_SERVER }}
          openshift_token: ${{ secrets.OPENSHIFT_TOKEN }}
          namespace: ${{ vars.K8S_NAMESPACE }}
      - run: |
          oc set image deployment/my-app my-app=${{ env.IMAGE }}@${{ needs.image.outputs.digest }}
          oc rollout status deployment/my-app --timeout=180s
```

One important caveat: for a GitHub-hosted runner to reach the API server, the cluster has to be reachable from the internet. For many of my customers that is simply a non-starter, and that is where the next section begins.

## Reusable workflows so you stop copying YAML around

Once you have more than five repos sharing the same pipeline, copy-paste becomes debt. A reusable workflow centralises the logic and each repo only declares parameters.

```yaml
# .github/workflows/reusable-deploy.yml (in the platform repo)
name: Reusable Deploy

on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string
      image:
        required: true
        type: string
    secrets:
      kubeconfig:
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    steps:
      - uses: azure/setup-kubectl@v4
      - env:
          KUBECONFIG_B64: ${{ secrets.kubeconfig }}
        run: |
          mkdir -p ~/.kube
          echo "$KUBECONFIG_B64" | base64 -d > ~/.kube/config
          kubectl set image deployment/my-app my-app=${{ inputs.image }}
          kubectl rollout status deployment/my-app --timeout=180s
```

And from any application repo:

```yaml
jobs:
  deploy-prod:
    uses: my-org/platform/.github/workflows/reusable-deploy.yml@v1
    with:
      environment: production
      image: ghcr.io/my-org/my-app@sha256:abc123
    secrets:
      kubeconfig: ${{ secrets.KUBECONFIG_B64 }}
```

Pin the reference to a tag (`@v1`), not to `main`. Changing a reusable workflow on `main` and breaking the deploy of twenty services at once is an experience you only need to have once.

## GitHub Actions vs Tekton / OpenShift Pipelines

This is the conversation I have with nearly every customer running OpenShift. My position, after operating both in production, is that they are not direct competitors: they solve the same problem from different places.

| Aspect | GitHub Actions | Tekton / OpenShift Pipelines |
|---|---|---|
| Where it runs | GitHub-hosted or self-hosted runners | Pods inside your cluster |
| Model | Workflow YAML, very concise | Kubernetes CRDs (Task, Pipeline, PipelineRun) |
| Learning curve | Low; the marketplace covers a lot | Medium to high; more verbose, more explicit |
| Cluster access | Requires exposing the API server or a self-hosted runner | Native; the pipeline is already inside |
| Air-gapped / compliance | Hard without self-hosted runners | Its natural use case |
| GitHub integration | Perfect (checks, PR status, environments) | Via Pipelines as Code or webhooks; works but needs setup |
| Enterprise support | GitHub Enterprise | Included in the OpenShift subscription |
| Scaling | Transparent, pay per minute | Scales with the cluster; resources you operate |

### When I choose GitHub Actions

- The code lives on GitHub and the team is already comfortable there.
- The cluster is reachable (public cloud, or a self-hosted runner on the internal network is acceptable).
- You want adoption speed: PR checks and CI in an afternoon.
- The pipeline is mostly CI (lint, test, build) and the deployment is straightforward.

### When I choose Tekton / OpenShift Pipelines

- **Governance**: the customer requires that no cluster credential ever leaves the cluster. With Tekton the pipeline runs under a ServiceAccount in its own namespace; there is no kubeconfig to export.
- **Air-gapped**: no internet egress means no GitHub runners. Tekton runs on images you already have in your internal registry.
- **Auditability**: every `PipelineRun` is a Kubernetes object with its own history, logs and status, queryable with `oc` and visible in the OpenShift console. In regulated environments this carries real weight.
- **Whole lifecycle on the platform**: if you already run Argo CD (OpenShift GitOps), having build and deploy as CRDs fits the "everything is a manifest" mental model.
- **Heavy builds** that benefit from running next to the registry and on cluster resources (for example, Buildah with layer cache on a PVC).

What the docs will not tell you: Tekton is more verbose and has more moving parts (Tasks, Workspaces, PVCs, Triggers, EventListeners). Your first pipeline takes a day instead of an afternoon. In exchange, you depend on nothing outside the platform and the security model is the same one your workloads already use.

### A minimal Pipeline on OpenShift Pipelines

To make the difference in style concrete, here is the rough equivalent of the pipeline above. I use the `cluster` resolver, which is the current way to reference the Tasks that OpenShift Pipelines ships in the `openshift-pipelines` namespace.

```yaml
apiVersion: tekton.dev/v1
kind: Pipeline
metadata:
  name: build-and-deploy
spec:
  params:
    - name: git-url
    - name: git-revision
      default: main
    - name: image
  workspaces:
    - name: source
  tasks:
    - name: clone
      taskRef:
        resolver: cluster
        params:
          - name: kind
            value: task
          - name: name
            value: git-clone
          - name: namespace
            value: openshift-pipelines
      workspaces:
        - name: output
          workspace: source
      params:
        - name: URL
          value: $(params.git-url)
        - name: REVISION
          value: $(params.git-revision)

    - name: test
      runAfter: [clone]
      workspaces:
        - name: source
          workspace: source
      taskSpec:
        workspaces:
          - name: source
        steps:
          - name: npm-test
            image: registry.access.redhat.com/ubi9/nodejs-22
            workingDir: $(workspaces.source.path)
            script: |
              npm ci
              npm test

    - name: build-image
      runAfter: [test]
      taskRef:
        resolver: cluster
        params:
          - name: kind
            value: task
          - name: name
            value: buildah
          - name: namespace
            value: openshift-pipelines
      workspaces:
        - name: source
          workspace: source
      params:
        - name: IMAGE
          value: $(params.image)

    - name: deploy
      runAfter: [build-image]
      taskRef:
        resolver: cluster
        params:
          - name: kind
            value: task
          - name: name
            value: openshift-client
          - name: namespace
            value: openshift-pipelines
      params:
        - name: SCRIPT
          value: |
            oc set image deployment/my-app my-app=$(params.image)@$(tasks.build-image.results.IMAGE_DIGEST)
            oc rollout status deployment/my-app --timeout=180s
```

More YAML, yes. But notice that the `deploy` step carries no secret at all: the namespace's `pipeline` ServiceAccount already has the permissions, and the digest flows as a result from the previous Task without ever leaving the cluster.

### Combining them: the pattern I recommend most

At quite a few customers I have ended up with a hybrid that works very well:

1. **GitHub Actions for CI**: lint, unit tests, static analysis, PR checks. Everything that does not need to touch the cluster.
2. **Tekton or Argo CD for CD**: GitHub Actions publishes the image and bumps the tag in a manifests repo; Argo CD picks up the change and syncs. Or a webhook fires a `PipelineRun` through Tekton Triggers.

The development team keeps the GitHub experience they like, and the platform team keeps control of what enters the cluster without exposing credentials outward. The boundary is clean: CI produces artifacts, CD consumes them from the inside.

## Lessons that cost me

- **Pin action versions.** `actions/checkout@v4` is fine; `@main` is not. In regulated environments, pin the commit SHA.
- **A deploy job that does not validate the rollout is decorative.** `rollout status` with a timeout, every time.
- **Do not let the pipeline become a 200-line bash script.** When it grows, move the logic into versioned scripts in the repo and call them from the workflow. They can be tested locally and reviewed in PRs.
- **Re-check `permissions` every time you add an action.** The `GITHUB_TOKEN` default can be too broad depending on your organisation settings.
- **If you need self-hosted runners to reach the cluster, you are already operating CI infrastructure.** That is the moment to ask whether Tekton, which you operate like any other OpenShift operator, is not actually the cheaper option.

## Conclusion

GitHub Actions is the correct default for most projects that live on GitHub, and with least-privilege `permissions`, digest-based deploys and rollout validation you get a pipeline that holds up in production. But when the requirement is that nothing leaves the cluster, whether for compliance, for air-gap reasons, or because the platform is OpenShift and you want a single security model, Tekton and OpenShift Pipelines stop being "the complicated alternative" and become the only honest answer. Choosing well is not a matter of taste: it is a matter of where your credentials are allowed to live.
