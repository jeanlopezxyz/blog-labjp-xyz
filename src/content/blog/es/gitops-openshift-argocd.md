---
title: "GitOps en OpenShift con ArgoCD"
description: "GitOps en OpenShift con el operador OpenShift GitOps: instalación, ApplicationSets, multi-tenancy con AppProjects y RBAC, y troubleshooting de sync, drift y self-heal."
pubDate: 2026-01-17
updatedDate: 2026-09-05
tags: ["openshift", "gitops", "argocd"]
categories: ["openshift", "gitops"]
featured: true
image: "https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?w=1200&h=630&fit=crop"
lang: es
---

He implantado GitOps con Argo CD en más clusters de OpenShift de los que puedo contar, y siempre hay un momento en que el cliente pasa de "tenemos tres Applications" a "tenemos ochenta Applications, cuatro clusters y seis equipos que se pisan". Este artículo cubre lo que hace falta para llegar a ese punto sin dolor: el operador OpenShift GitOps, ApplicationSets, multi-tenancy real con AppProjects y RBAC, y las lecciones de troubleshooting que solo se aprenden a las malas.

## Qué es GitOps, en una frase útil

Git es la única fuente de verdad del estado deseado; un controlador dentro del cluster reconcilia continuamente el estado real con lo que hay en Git; los cambios entran por Pull Request, y nadie hace `oc apply` a mano en producción. Todo lo demás son detalles de implementación. Argo CD es el controlador, y en OpenShift viene empaquetado y soportado como **OpenShift GitOps**.

## OpenShift GitOps Operator: qué es y qué añade

OpenShift GitOps es la distribución de Argo CD soportada por Red Hat. No es un fork: es Argo CD upstream, empaquetado con el Argo CD Operator (también upstream, mantenido en gran parte por Red Hat), más Argo Rollouts, más integraciones específicas de OpenShift. Se instala desde OperatorHub y la versión del operador va ligada a una versión concreta de Argo CD; la rama 1.x del operador ha ido acompañando a Argo CD 2.x y, desde 2025, a Argo CD 3.x. Consulta siempre la matriz de compatibilidad en las release notes antes de actualizar, porque el operador tiene sus propias ventanas de soporte por versión de OpenShift.

Lo que te da frente a Argo CD vanilla instalado con Helm o con los manifiestos upstream:

- **Soporte de Red Hat.** Si algo falla, abres un caso. En banca o administración pública esto no es opcional.
- **SSO con OpenShift OAuth de serie.** Dex viene configurado para autenticar contra el cluster; los grupos de OpenShift se pueden mapear directamente a roles de Argo CD.
- **Instancia por defecto lista para usar** en el namespace `openshift-gitops`, con Route TLS, y con permisos cluster-scoped para gestionar infraestructura.
- **Instancias namespaced adicionales**, cada una aislada, para dar a un equipo su propio Argo CD sin cluster-admin.
- **Integración con la consola** (el menú de aplicaciones muestra el estado de Argo CD) y con OpenShift Pipelines.
- **Argo Rollouts** empaquetado, para canary y blue/green.

### Instalación

Desde OperatorHub en la consola, o de forma declarativa (que es como debería ser, ya que estamos hablando de GitOps):

```yaml
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: openshift-gitops-operator
  namespace: openshift-gitops-operator
spec:
  channel: latest          # o gitops-1.x para fijar una rama
  installPlanApproval: Automatic
  name: openshift-gitops-operator
  source: redhat-operators
  sourceNamespace: openshift-marketplace
```

A los pocos minutos aparece el namespace `openshift-gitops` con una instancia de Argo CD ya corriendo. La contraseña inicial del usuario `admin` está en el secret `openshift-gitops-cluster`, aunque en cuanto configures OAuth deberías deshabilitar ese usuario.

```bash
oc get pods -n openshift-gitops
oc get route openshift-gitops-server -n openshift-gitops -o jsonpath='{.spec.host}'
```

### Personalizar la instancia

La instancia se controla con el CR `ArgoCD`. Esta es una configuración que uso como base en producción:

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

Dos detalles importantes. Los `resources` del controller no son un capricho: con más de cincuenta Applications, el application-controller por defecto se queda sin memoria y verás syncs que nunca terminan. Y `resourceExclusions` evita que Argo CD intente rastrear miles de `PipelineRun` que nunca va a gestionar, lo que ahorra CPU y ruido en la interfaz.

## Estructura del repositorio

Sobre esto hay tantas opiniones como consultores. La que me ha funcionado en clientes con varios equipos separa claramente **plataforma** de **aplicaciones**, y dentro de cada uno, base de overlays:

```
gitops/
├── bootstrap/                  # Lo mínimo para arrancar: proyectos + app-of-apps
│   ├── projects/
│   └── root-app.yaml
├── platform/                   # Operadores, Namespaces, quotas, NetworkPolicies
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

El repositorio de GitOps **no** contiene código fuente. Los pipelines construyen la imagen y abren un PR (o hacen commit directo en dev) actualizando la tag en el overlay correspondiente. El equipo de desarrollo es dueño de `apps/<su-app>/`; el equipo de plataforma es dueño de `platform/` y `bootstrap/`. Esa separación se refuerza con CODEOWNERS en Git y con AppProjects en Argo CD.

## Application: la unidad básica

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
        - .spec.replicas      # lo gestiona el HPA
```

Cosas que hago siempre y que no vienen en el ejemplo mínimo de la documentación:

- **El finalizer**: sin él, borrar la Application deja los recursos huérfanos en el cluster.
- **`CreateNamespace=false`** en producción. Los namespaces los crea la plataforma (con quotas, NetworkPolicies y labels), no la primera aplicación que llega.
- **`ServerSideApply=true`**: evita el famoso error de "annotation too long" con CRDs grandes y reduce conflictos con otros controladores.
- **`ignoreDifferences` para `replicas`** cuando hay HPA. Si no, Argo CD y el HPA se pelean eternamente y la app nunca está `Synced`.

## ApplicationSets: cuando una Application no escala

Con diez Applications, escribirlas a mano está bien. Con ochenta, o con cuatro clusters, es insostenible: cada nueva app o cada nuevo cluster son N ficheros YAML casi idénticos. Un **ApplicationSet** es un controlador que genera Applications a partir de una plantilla y uno o varios *generators*. Es, con diferencia, la funcionalidad que más cambia la operación diaria.

### Generator `list`: entornos explícitos

El más simple y el más predecible. Ideal cuando tienes pocos entornos y quieres controlarlos uno a uno:

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

El `templatePatch` permite variar la política de sync por elemento: auto-sync en dev y uat, manual en prod. Lo uso en casi todos los clientes.

### Generator `cluster`: multi-cluster real

Argo CD registra los clusters gestionados como Secrets con la label `argocd.argoproj.io/secret-type: cluster`. El generator `cluster` itera sobre ellos y puedes filtrar por labels que tú mismo pones al registrar el cluster:

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

Cuando registras un cluster nuevo con `env=prod`, la baseline de plataforma se despliega sola. Con Red Hat Advanced Cluster Management, además, los clusters importados se pueden registrar automáticamente en Argo CD (integración `GitOpsCluster`), lo que cierra el círculo.

### Generator `git`: descubrimiento por directorios

Genera una Application por cada directorio que coincida con un patrón. Es lo que uso para que los equipos añadan una app nueva creando una carpeta y abriendo un PR, sin tocar nada de Argo CD:

```yaml
generators:
  - git:
      repoURL: https://git.example.com/platform/gitops.git
      revision: main
      directories:
        - path: apps/*/overlays/dev
```

Los generators se pueden combinar con `matrix` (producto cartesiano, por ejemplo apps x clusters) y `merge`. Mi consejo: empieza con `list` o `git`, y pasa a `matrix` solo cuando el dolor sea real, porque depurar un ApplicationSet con matrix que genera cuarenta apps mal parametrizadas es una mañana perdida.

Un aviso sobre **políticas del ApplicationSet**: por defecto, si un elemento desaparece del generator, la Application generada se borra, y con el finalizer, sus recursos también. Si eso te asusta (debería, en prod), configura `syncPolicy.preserveResourcesOnDeletion: true` o `applicationsSync: create-only`.

## Multi-tenancy: AppProjects y RBAC

Este es el punto donde la mayoría de implantaciones se quedan a medias. Todo en `project: default` funciona hasta que un equipo despliega en el namespace de otro por error, o hasta que auditoría pregunta quién puede hacer sync a producción.

### AppProject: los límites de un equipo

Un `AppProject` define **qué repos** puede usar un equipo, **a qué clusters y namespaces** puede desplegar, y **qué tipos de recursos** puede crear:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: team-payments
  namespace: openshift-gitops
spec:
  description: Equipo de pagos
  sourceRepos:
    - https://git.example.com/platform/gitops.git
    - https://git.example.com/payments/*
  destinations:
    - server: https://kubernetes.default.svc
      namespace: payments-*
    - server: https://api.prod.example.com:6443
      namespace: payments-prod
  clusterResourceWhitelist: []          # nada cluster-scoped
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
      schedule: "0 22 * * 5"       # viernes 22:00
      duration: 58h                # hasta lunes 08:00
      applications:
        - "*-prod"
      manualSync: false
```

Con esto el equipo de pagos no puede tocar `ResourceQuota` ni `NetworkPolicy` (los gestiona plataforma), no puede crear nada cluster-scoped (ni ClusterRoles, ni CRDs), y solo puede desplegar en namespaces `payments-*`. Las `syncWindows` bloquean despliegues a prod en fin de semana: no es paranoia, es lo que pide el cambio controlado en cualquier empresa regulada.

### RBAC global: policy.csv

El RBAC de la instancia se define en el CR `ArgoCD` (`spec.rbac.policy`) y sigue el formato Casbin. Los grupos vienen de OpenShift OAuth vía Dex, así que puedes usar directamente los grupos de tu LDAP o IdP:

```yaml
rbac:
  defaultPolicy: role:readonly
  scopes: "[groups]"
  policy: |
    # Plataforma: todo
    g, platform-team, role:admin

    # Auditoría: solo lectura de todo, incluidos logs
    p, role:auditor, applications, get, */*, allow
    p, role:auditor, logs, get, */*, allow
    g, security-audit, role:auditor

    # Equipos: sus roles se definen en su AppProject
    g, payments-developers, proj:team-payments:developer
    g, payments-leads, proj:team-payments:release-manager
    g, portal-developers, proj:team-portal:developer
```

Recomendaciones que aplico:

- `defaultPolicy: role:readonly` como mínimo. Con `role:''` nadie ve nada y el soporte se vuelve un infierno; con `role:admin` no tienes multi-tenancy.
- Define los roles de equipo **dentro del AppProject**, no en la policy global. Así el equipo de plataforma revisa el AppProject en el PR y sabe exactamente qué puede hacer cada grupo.
- Usa `argocd admin settings rbac validate` y `argocd admin settings rbac can` en CI para no descubrir errores en la policy después de aplicarla.

### Cuándo dar a un equipo su propia instancia

Si un equipo necesita ser admin de su Argo CD (plugins propios, configuración de notificaciones, ciclo de vida independiente), el operador permite crear una instancia **namespaced** en su namespace. Solo podrá gestionar los namespaces que tengan la label `argocd.argoproj.io/managed-by: <namespace-de-la-instancia>`, y no podrá tocar nada cluster-scoped. Es un aislamiento fuerte con coste operativo bajo, y es lo que recomiendo cuando la organización tiene más de tres o cuatro equipos con culturas de despliegue muy distintas.

## Troubleshooting desde la trinchera

### La app está `OutOfSync` y no sabes por qué

```bash
argocd app diff payments-api-prod
argocd app get payments-api-prod --show-operation
```

El 80 % de las veces es una de estas: un campo que un webhook o un controlador muta (y necesita `ignoreDifferences`), una diferencia de tipos (`"8080"` vs `8080`), o un recurso que alguien tocó a mano. Para lo último, `argocd app history` y `oc get events` en el namespace suelen dar la respuesta.

### Self-heal y drift

`selfHeal: true` hace que Argo CD revierta cualquier cambio manual en cuanto lo detecta. Es correcto y es lo que quieres en producción, pero tiene dos efectos secundarios que hay que explicar al equipo:

1. `oc scale` o `oc set env` "no funcionan". Eso es una feature, no un bug: el cambio va por Git.
2. Un operador que muta sus propios recursos entra en bucle con Argo CD. La solución es `ignoreDifferences` sobre los campos que gestiona el operador, o `RespectIgnoreDifferences=true` en las syncOptions para que el sync tampoco los sobreescriba.

### Prune con cabeza

`prune: true` borra del cluster lo que ya no está en Git. Imprescindible para que GitOps sea real, pero con dos protecciones:

- Anota `argocd.argoproj.io/sync-options: Prune=false` en recursos que no deben desaparecer nunca de forma automática (PVCs, Secrets con claves que no puedes regenerar).
- Configura `syncOptions: - PrunePropagationPolicy=foreground` si tienes recursos con dependencias que deben borrarse en orden.

He visto un `git mv` mal hecho borrar un namespace entero en dev porque el generador `git` dejó de encontrar el directorio. Dev, por suerte. Desde entonces, `preserveResourcesOnDeletion: true` en cualquier ApplicationSet que apunte a prod.

### Sync que nunca termina

Casi siempre es un hook `PostSync` o un Job que no acaba, o un recurso con health check que Argo CD no entiende (CRs custom sin `status.conditions` reconocidas). Para lo segundo, define un health check Lua para ese CRD en `spec.resourceHealthChecks` del CR `ArgoCD`. Para lo primero, `argocd app terminate-op` y revisa el Job.

### Orden de despliegue

Sync waves y phases resuelven el 99 % de los casos de dependencia:

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "-1"    # Namespaces, CRDs, Secrets primero
```

Regla práctica: `-2` para CRDs y namespaces, `-1` para Secrets y ConfigMaps, `0` para workloads, `1` para Routes, Ingress y ServiceMonitors. Y si el orden es entre Applications distintas, usa el patrón app-of-apps con waves en las Applications hijas.

## Integración con OpenShift Pipelines

El pipeline de CI no despliega. Construye, escanea, firma la imagen y actualiza el repositorio de GitOps. Este es el paso final típico en Tekton:

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

Para promoción a producción, en lugar de push directo, el paso abre un Merge Request y se detiene. Ahí entra el humano, el `sync window` y, si quieres, Argo Rollouts con análisis automático. Preferimos mil veces un `git revert` que un `argocd app rollback`: el segundo funciona, pero deja el cluster distinto de Git, que es justo lo que GitOps intenta evitar.

## Conclusión

GitOps en OpenShift no es instalar Argo CD y crear Applications. Es decidir cómo se estructura el repositorio, quién es dueño de cada parte, qué puede hacer cada equipo (AppProjects y RBAC), cómo escalar a decenas de apps y varios clusters (ApplicationSets), y qué pasa cuando el cluster y Git no coinciden (sync, self-heal, prune, ignoreDifferences). El operador OpenShift GitOps te da la base soportada; el resto es diseño, y ese diseño es lo que separa una demo bonita de una plataforma que aguanta años en producción.
