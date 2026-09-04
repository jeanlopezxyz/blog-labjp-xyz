---
title: "GitOps on OpenShift with ArgoCD"
description: "GitOps on OpenShift with the OpenShift GitOps operator: installation, ApplicationSets, multi-tenancy with AppProjects and RBAC, and troubleshooting sync, drift and self-heal."
pubDate: 2026-09-05
updatedDate: 2026-09-05
tags: ["openshift", "gitops", "argocd"]
categories: ["openshift", "gitops"]
featured: true
image: "https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?w=1200&h=630&fit=crop"
lang: en
---

I've rolled out GitOps with Argo CD on more OpenShift clusters than I can count, and there's always a moment when a customer goes from "we have three Applications" to "we have eighty Applications, four clusters and six teams stepping on each other". This article covers what it takes to get there without pain: the OpenShift GitOps operator, ApplicationSets, real multi-tenancy with AppProjects and RBAC, and the troubleshooting lessons you only learn the hard way.

## GitOps in one useful sentence

Git is the single source of truth for desired state; a controller inside the cluster continuously reconciles actual state with what's in Git; changes come in through pull requests, and nobody runs `oc apply` by hand in production. Everything else is implementation detail. Argo CD is the controller, and on OpenShift it ships packaged and supported as **OpenShift GitOps**.

## The OpenShift GitOps Operator: what it is and what it adds

OpenShift GitOps is Red Hat's supported distribution of Argo CD. It's not a fork: it's upstream Argo CD, packaged with the Argo CD Operator (also upstream, largely maintained by Red Hat), plus Argo Rollouts and OpenShift-specific integrations. You install it from OperatorHub, and each operator version is tied to a specific Argo CD version; the 1.x operator line tracked Argo CD 2.x and, since 2025, Argo CD 3.x. Always check the compatibility matrix in the release notes before upgrading, because the operator has its own support windows per OpenShift version.

What you get over vanilla Argo CD installed via Helm or the upstream manifests:

- **Red Hat support.** When something breaks, you open a case. In banking or the public sector this isn't optional.
- **SSO against OpenShift OAuth out of the box.** Dex comes pre-configured to authenticate against the cluster, and OpenShift groups map straight onto Argo CD roles.
- **A ready-to-use default instance** in the `openshift-gitops` namespace, with a TLS Route and cluster-scoped permissions for managing infrastructure.
- **Additional namespaced instances**, each isolated, so a team can have its own Argo CD without cluster-admin.
- **Console integration** (the application menu shows Argo CD status) and integration with OpenShift Pipelines.
- **Argo Rollouts** bundled, for canary and blue/green.

### Installation

From OperatorHub in the console, or declaratively (which is how it should be, given that we're talking about GitOps):

```yaml
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: openshift-gitops-operator
  namespace: openshift-gitops-operator
spec:
  channel: latest          # or gitops-1.x to pin a branch
  installPlanApproval: Automatic
  name: openshift-gitops-operator
  source: redhat-operators
  sourceNamespace: openshift-marketplace
```

Within a few minutes the `openshift-gitops` namespace appears with an Argo CD instance already running. The initial `admin` password lives in the `openshift-gitops-cluster` secret, although once OAuth is configured you should disable that user.

```bash
oc get pods -n openshift-gitops
oc get route openshift-gitops-server -n openshift-gitops -o jsonpath='{.spec.host}'
```

### Customising the instance

The instance is controlled by the `ArgoCD` CR. This is the configuration I use as a production baseline:

```yaml
apiVersion: argoproj.io/v1beta1
kind: ArgoCD
metadata:
  name: openshift-gitops
  namespace: openshift-gitops
spec:
  server:
    route:
      enabled: true
      tls:
        termination: reencrypt
    resources:
      requests: { cpu: 250m, memory: 256Mi }
      limits: { memory: 512Mi }
  sso:
    provider: dex
    dex:
      openShiftOAuth: true
  rbac:
    defaultPolicy: role:readonly
    policy: |
      g, cluster-admins, role:admin
      g, platform-team, role:admin
    scopes: "[groups]"
  controller:
    resources:
      requests: { cpu: 500m, memory: 1Gi }
      limits: { memory: 2Gi }
  repo:
    resources:
      requests: { cpu: 250m, memory: 512Mi }
      limits: { memory: 1Gi }
  resourceExclusions: |
    - apiGroups:
        - tekton.dev
      kinds:
        - TaskRun
        - PipelineRun
      clusters:
        - "*"
```

Two details matter here. The controller `resources` aren't cosmetic: past fifty or so Applications, the default application-controller runs out of memory and you'll see syncs that never complete. And `resourceExclusions` stops Argo CD from tracking thousands of `PipelineRun` objects it will never manage, which saves CPU and cuts noise in the UI.

## Repository structure

There are as many opinions on this as there are consultants. What has worked for me at customers with multiple teams is a clear split between **platform** and **applications**, and base/overlays inside each:

```
gitops/
├── bootstrap/                  # The bare minimum to boot: projects + app-of-apps
│   ├── projects/
│   └── root-app.yaml
├── platform/                   # Operators, Namespaces, quotas, NetworkPolicies
│   ├── base/
│   └── overlays/
│       ├── dev/
│       └── prod/
├── apps/
│   ├── payments-api/
│   │   ├── base/
│   │   └── overlays/{dev,uat,prod}/
│   └── customer-portal/
│       └── ...
└── applicationsets/
    ├── platform.yaml
    └── apps.yaml
```

The GitOps repository contains **no** source code. CI pipelines build the image and open a PR (or commit directly for dev) that bumps the tag in the matching overlay. The development team owns `apps/<their-app>/`; the platform team owns `platform/` and `bootstrap/`. That split is enforced with CODEOWNERS in Git and with AppProjects in Argo CD.

## Application: the basic unit

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: payments-api-uat
  namespace: openshift-gitops
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: team-payments
  source:
    repoURL: https://git.example.com/platform/gitops.git
    targetRevision: main
    path: apps/payments-api/overlays/uat
  destination:
    server: https://kubernetes.default.svc
    namespace: payments-uat
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=false
      - ServerSideApply=true
      - RespectIgnoreDifferences=true
    retry:
      limit: 5
      backoff:
        duration: 10s
        factor: 2
        maxDuration: 3m
  ignoreDifferences:
    - group: apps
      kind: Deployment
      jqPathExpressions:
        - .spec.replicas      # owned by the HPA
```

Things I always add that the minimal example in the docs leaves out:

- **The finalizer**: without it, deleting the Application leaves the resources orphaned in the cluster.
- **`CreateNamespace=false`** in production. Namespaces are created by the platform (with quotas, NetworkPolicies and labels), not by whichever application shows up first.
- **`ServerSideApply=true`**: avoids the infamous "annotation too long" error with large CRDs and reduces conflicts with other controllers.
- **`ignoreDifferences` on `replicas`** when there's an HPA. Otherwise Argo CD and the HPA fight forever and the app is never `Synced`.

## ApplicationSets: when one Application doesn't scale

With ten Applications, writing them by hand is fine. With eighty, or with four clusters, it's untenable: every new app or new cluster means N nearly identical YAML files. An **ApplicationSet** is a controller that generates Applications from a template plus one or more *generators*. It's by far the feature that changes day-to-day operations the most.

### The `list` generator: explicit environments

The simplest and most predictable. Ideal when you have a handful of environments and want to control each one individually:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: payments-api
  namespace: openshift-gitops
spec:
  goTemplate: true
  generators:
    - list:
        elements:
          - env: dev
            cluster: https://kubernetes.default.svc
            autoSync: "true"
          - env: uat
            cluster: https://kubernetes.default.svc
            autoSync: "true"
          - env: prod
            cluster: https://api.prod.example.com:6443
            autoSync: "false"
  template:
    metadata:
      name: "payments-api-{{ .env }}"
    spec:
      project: team-payments
      source:
        repoURL: https://git.example.com/platform/gitops.git
        targetRevision: main
        path: "apps/payments-api/overlays/{{ .env }}"
      destination:
        server: "{{ .cluster }}"
        namespace: "payments-{{ .env }}"
      syncPolicy:
        syncOptions:
          - ServerSideApply=true
  templatePatch: |
    {{- if eq .autoSync "true" }}
    spec:
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
    {{- end }}
```

`templatePatch` lets you vary the sync policy per element: auto-sync in dev and uat, manual in prod. I use this at nearly every customer.

### The `cluster` generator: real multi-cluster

Argo CD registers managed clusters as Secrets labelled `argocd.argoproj.io/secret-type: cluster`. The `cluster` generator iterates over them, and you can filter by labels you set when registering the cluster:

```bash
argocd cluster add prod-eu --name prod-eu \
  --label env=prod --label region=eu
```

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: platform-baseline
  namespace: openshift-gitops
spec:
  goTemplate: true
  generators:
    - clusters:
        selector:
          matchLabels:
            env: prod
  template:
    metadata:
      name: "platform-{{ .name }}"
    spec:
      project: platform
      source:
        repoURL: https://git.example.com/platform/gitops.git
        targetRevision: main
        path: platform/overlays/prod
        kustomize:
          commonLabels:
            cluster: "{{ .name }}"
      destination:
        server: "{{ .server }}"
        namespace: openshift-gitops
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
```

Register a new cluster with `env=prod` and the platform baseline deploys itself. With Red Hat Advanced Cluster Management, imported clusters can also be registered in Argo CD automatically (the `GitOpsCluster` integration), which closes the loop.

### The `git` generator: directory discovery

Generates one Application per directory matching a pattern. This is what I use so teams can add a new app by creating a folder and opening a PR, without touching anything in Argo CD:

```yaml
generators:
  - git:
      repoURL: https://git.example.com/platform/gitops.git
      revision: main
      directories:
        - path: apps/*/overlays/dev
```

Generators can be combined with `matrix` (cartesian product, e.g. apps x clusters) and `merge`. My advice: start with `list` or `git`, and reach for `matrix` only when the pain is real, because debugging a matrix ApplicationSet that spawned forty mis-parameterised apps is a morning gone.

A warning about **ApplicationSet policies**: by default, when an element disappears from the generator, the generated Application is deleted, and with the finalizer, so are its resources. If that scares you (it should, in prod), set `syncPolicy.preserveResourcesOnDeletion: true` or `applicationsSync: create-only`.

## Multi-tenancy: AppProjects and RBAC

This is where most rollouts stall halfway. Everything in `project: default` works until one team deploys into another team's namespace by mistake, or until audit asks who is allowed to sync to production.

### AppProject: a team's boundaries

An `AppProject` defines **which repos** a team can use, **which clusters and namespaces** it can deploy to, and **which resource kinds** it can create:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: team-payments
  namespace: openshift-gitops
spec:
  description: Payments team
  sourceRepos:
    - https://git.example.com/platform/gitops.git
    - https://git.example.com/payments/*
  destinations:
    - server: https://kubernetes.default.svc
      namespace: payments-*
    - server: https://api.prod.example.com:6443
      namespace: payments-prod
  clusterResourceWhitelist: []          # nothing cluster-scoped
  namespaceResourceBlacklist:
    - group: ""
      kind: ResourceQuota
    - group: ""
      kind: LimitRange
    - group: networking.k8s.io
      kind: NetworkPolicy
  roles:
    - name: developer
      policies:
        - p, proj:team-payments:developer, applications, get, team-payments/*, allow
        - p, proj:team-payments:developer, applications, sync, team-payments/*, allow
      groups:
        - payments-developers
    - name: release-manager
      policies:
        - p, proj:team-payments:release-manager, applications, *, team-payments/*, allow
      groups:
        - payments-leads
  syncWindows:
    - kind: deny
      schedule: "0 22 * * 5"       # Friday 22:00
      duration: 58h                # until Monday 08:00
      applications:
        - "*-prod"
      manualSync: false
```

With this, the payments team can't touch `ResourceQuota` or `NetworkPolicy` (platform owns those), can't create anything cluster-scoped (no ClusterRoles, no CRDs), and can only deploy into `payments-*` namespaces. The `syncWindows` block production deployments over the weekend: not paranoia, just what change control requires in any regulated company.

### Global RBAC: policy.csv

Instance-wide RBAC is defined in the `ArgoCD` CR (`spec.rbac.policy`) and follows the Casbin format. Groups come from OpenShift OAuth via Dex, so you can use your LDAP or IdP groups directly:

```yaml
rbac:
  defaultPolicy: role:readonly
  scopes: "[groups]"
  policy: |
    # Platform: everything
    g, platform-team, role:admin

    # Audit: read-only on everything, including logs
    p, role:auditor, applications, get, */*, allow
    p, role:auditor, logs, get, */*, allow
    g, security-audit, role:auditor

    # Teams: their roles are defined in their AppProject
    g, payments-developers, proj:team-payments:developer
    g, payments-leads, proj:team-payments:release-manager
    g, portal-developers, proj:team-portal:developer
```

Recommendations I stick to:

- `defaultPolicy: role:readonly` at minimum. With `role:''` nobody sees anything and support becomes a nightmare; with `role:admin` you have no multi-tenancy.
- Define team roles **inside the AppProject**, not in the global policy. That way the platform team reviews the AppProject in the PR and knows exactly what each group can do.
- Run `argocd admin settings rbac validate` and `argocd admin settings rbac can` in CI so you don't discover policy mistakes after applying them.

### When to give a team its own instance

If a team needs to be admin of its own Argo CD (custom plugins, notification config, an independent lifecycle), the operator lets you create a **namespaced** instance in their namespace. It can only manage namespaces labelled `argocd.argoproj.io/managed-by: <instance-namespace>`, and it can't touch anything cluster-scoped. That's strong isolation at low operational cost, and it's what I recommend once an organisation has more than three or four teams with very different deployment cultures.

## Troubleshooting from the trenches

### The app is `OutOfSync` and you don't know why

```bash
argocd app diff payments-api-prod
argocd app get payments-api-prod --show-operation
```

Eighty percent of the time it's one of these: a field mutated by a webhook or controller (which needs `ignoreDifferences`), a type mismatch (`"8080"` vs `8080`), or a resource someone edited by hand. For the last one, `argocd app history` and `oc get events` in the namespace usually give you the answer.

### Self-heal and drift

`selfHeal: true` makes Argo CD revert any manual change as soon as it detects it. That's correct and it's what you want in production, but it has two side effects you need to explain to the team:

1. `oc scale` or `oc set env` "don't work". That's a feature, not a bug: the change goes through Git.
2. An operator that mutates its own resources ends up in a loop with Argo CD. The fix is `ignoreDifferences` on the fields the operator owns, plus `RespectIgnoreDifferences=true` in the syncOptions so the sync doesn't overwrite them either.

### Prune, carefully

`prune: true` deletes from the cluster whatever is no longer in Git. Essential for GitOps to be real, but with two safeguards:

- Annotate `argocd.argoproj.io/sync-options: Prune=false` on resources that must never disappear automatically (PVCs, Secrets holding keys you can't regenerate).
- Set `syncOptions: - PrunePropagationPolicy=foreground` if you have dependent resources that must be deleted in order.

I once watched a botched `git mv` wipe an entire namespace in dev because the `git` generator stopped finding the directory. Dev, thankfully. Since then, `preserveResourcesOnDeletion: true` on any ApplicationSet pointing at prod.

### A sync that never finishes

Almost always a `PostSync` hook or a Job that doesn't complete, or a resource whose health Argo CD can't assess (custom CRs without recognised `status.conditions`). For the latter, define a Lua health check for that CRD under `spec.resourceHealthChecks` in the `ArgoCD` CR. For the former, `argocd app terminate-op` and go look at the Job.

### Deployment order

Sync waves and phases solve 99% of dependency cases:

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "-1"    # Namespaces, CRDs, Secrets first
```

Rule of thumb: `-2` for CRDs and namespaces, `-1` for Secrets and ConfigMaps, `0` for workloads, `1` for Routes, Ingresses and ServiceMonitors. If the ordering is between different Applications, use the app-of-apps pattern with waves on the child Applications.

## Integration with OpenShift Pipelines

The CI pipeline doesn't deploy. It builds, scans, signs the image and updates the GitOps repository. This is the typical final step in Tekton:

```yaml
apiVersion: tekton.dev/v1
kind: Task
metadata:
  name: update-gitops-image
spec:
  params:
    - name: app
    - name: env
    - name: image
  workspaces:
    - name: gitops
  steps:
    - name: bump-image
      image: registry.redhat.io/ubi9/ubi-minimal
      workingDir: $(workspaces.gitops.path)
      script: |
        cd apps/$(params.app)/overlays/$(params.env)
        kustomize edit set image payments-api=$(params.image)
        git config user.email "ci@example.com"
        git config user.name "ci"
        git commit -am "chore($(params.app)): promote $(params.image) to $(params.env)"
        git push origin HEAD:main
```

For promotion to production, instead of pushing directly, the step opens a merge request and stops. That's where the human, the sync window and, if you want it, Argo Rollouts with automated analysis come in. We much prefer a `git revert` to an `argocd app rollback`: the latter works, but it leaves the cluster different from Git, which is exactly what GitOps is trying to prevent.

## Conclusion

GitOps on OpenShift isn't installing Argo CD and creating Applications. It's deciding how the repository is structured, who owns each part, what each team is allowed to do (AppProjects and RBAC), how to scale to dozens of apps and several clusters (ApplicationSets), and what happens when the cluster and Git disagree (sync, self-heal, prune, ignoreDifferences). The OpenShift GitOps operator gives you the supported foundation; the rest is design, and that design is what separates a nice demo from a platform that survives years in production.
