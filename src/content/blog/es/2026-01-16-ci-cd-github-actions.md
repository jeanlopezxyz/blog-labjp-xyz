---
title: "CI/CD moderno con GitHub Actions (y cuándo preferir Tekton)"
description: "Pipelines de CI/CD reales con GitHub Actions: build, test, imagen y despliegue a Kubernetes/OpenShift, más una comparativa honesta con Tekton y OpenShift Pipelines."
pubDate: 2026-01-16
updatedDate: 2026-09-05
tags: ["devops", "github-actions", "ci-cd", "tekton", "openshift-pipelines"]
categories: ["devops", "openshift"]
featured: false
image: "https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=1200&h=630&fit=crop"
lang: es
---

Llevo años montando pipelines para clientes de todo tipo: startups que viven en GitHub y no quieren operar nada, y bancos donde ni una sola línea de CI puede ejecutarse fuera del cluster. GitHub Actions es, con diferencia, la herramienta con la que más rápido se llega a un pipeline funcional. Pero "rápido" no siempre significa "correcto para tu contexto", y en este post quiero contar las dos cosas: cómo construir un pipeline de GitHub Actions que aguante producción, y cuándo he tenido que decir "aquí no, aquí va Tekton".

He actualizado este artículo porque los ejemplos originales usaban Node 20, que llega a fin de vida en abril de 2026. Todos los ejemplos ahora usan Node 22 (LTS activa). Si estás en un proyecto Java, los mismos patrones aplican cambiando `setup-node` por `setup-java`.

## Los conceptos en 30 segundos

- **Workflow**: archivo YAML en `.github/workflows/` que responde a eventos (push, PR, cron, manual)
- **Job**: unidad de ejecución que corre en un runner; los jobs son paralelos salvo que declares `needs`
- **Step**: cada comando o action dentro de un job
- **Action**: pieza reutilizable, propia o del marketplace
- **Runner**: la máquina que ejecuta el job, hospedada por GitHub o self-hosted

Lo que más confunde al principio: cada job arranca en una máquina limpia. Si construyes algo en `build` y lo necesitas en `deploy`, tienes que pasarlo como artefacto o reconstruirlo.

## Un workflow base que no da vergüenza

Este es el punto de partida que uso en casi todos los repos. Fíjate en tres detalles que suelen faltar en los tutoriales: `permissions` mínimos, `concurrency` para cancelar ejecuciones obsoletas, y `cache` de dependencias directamente en `setup-node`.

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

`permissions: contents: read` es la diferencia entre un `GITHUB_TOKEN` que solo puede leer el repo y uno que puede escribir en él si una dependencia comprometida decide hacerlo. Ponlo siempre y amplíalo solo en el job que lo necesite.

## Matriz de versiones

Cuando mantienes una librería, quieres validar contra varias versiones de runtime. Aquí pruebo contra la LTS activa (22) y la siguiente (24). Node 20 ya no aparece porque no tiene sentido invertir minutos de CI en una versión que dejará de recibir parches de seguridad.

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

`fail-fast: false` es importante: si falla Windows con Node 24 quiero ver también qué pasó en el resto de combinaciones, no que se cancelen.

## Secrets, variables y environments

Los `environments` de GitHub son la parte que más gente infrautiliza. Permiten secrets distintos por entorno, reviewers obligatorios antes de desplegar a producción y restricción a ramas concretas.

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

Regla práctica: `secrets` para credenciales, `vars` para configuración no sensible (URLs, nombres de namespace, flags). Y nunca interpoles un secret directamente en `run:` con `${{ }}`; pásalo por `env:` para que no acabe en el log si el shell falla.

## Cache más allá de npm

`setup-node` con `cache: 'npm'` cubre el caso habitual. Para cualquier otra cosa (Maven, Gradle, pnpm store, dependencias de sistema) uso `actions/cache` con una clave basada en el hash del lockfile.

```yaml
- name: Cache Maven repository
  uses: actions/cache@v4
  with:
    path: ~/.m2/repository
    key: ${{ runner.os }}-maven-${{ hashFiles('**/pom.xml') }}
    restore-keys: |
      ${{ runner.os }}-maven-
```

`restore-keys` es lo que hace que un cambio pequeño en el `pom.xml` no te obligue a descargar todo desde cero: recupera la cache más reciente que coincida con el prefijo.

## Pipeline completo: build, imagen y despliegue a un cluster

Este es el pipeline que de verdad importa. Tres jobs encadenados: verificar el código, construir y publicar la imagen en GHCR, y desplegar en el cluster usando un kubeconfig guardado como secret.

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

Algunas decisiones que hay detrás de este YAML y que me han costado incidentes aprender:

- **Despliego por digest, no por tag.** `${{ needs.image.outputs.digest }}` garantiza que lo que se despliega es exactamente lo que se construyó. Un tag `latest` puede cambiar bajo tus pies.
- **`rollout status` con timeout.** Sin esto el job termina en verde aunque el Deployment se quede en `CrashLoopBackOff`. Con el timeout, el pipeline falla y alguien se entera.
- **El kubeconfig es de una ServiceAccount con RBAC mínimo**, no el `kubeadmin`. Un Role que solo pueda hacer `get/patch` sobre Deployments del namespace y `get` sobre pods para el rollout status. Si el secret se filtra, el radio de daño es un namespace.
- **`cache-from/to: type=gha`** para que las capas de la imagen se cacheen entre ejecuciones. En imágenes Java con multi-stage build esto reduce el tiempo de forma muy notable.

Si el destino es OpenShift, sustituyo `kubectl` por `oc` con las actions oficiales de Red Hat (`redhat-actions/oc-installer` y `redhat-actions/oc-login`), que además permiten autenticarse con un token de ServiceAccount en lugar de un kubeconfig completo:

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

Un matiz importante: para que un runner hospedado por GitHub llegue al API server, el cluster tiene que ser accesible desde Internet. En muchos clientes eso es directamente inaceptable, y ahí es donde empieza la siguiente sección.

## Reusable workflows para no copiar YAML entre repos

Cuando tienes más de cinco repos con el mismo pipeline, el copy-paste se convierte en deuda. Un reusable workflow centraliza la lógica y cada repo solo declara los parámetros.

```yaml
# .github/workflows/reusable-deploy.yml (en el repo de plataforma)
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

Y desde cualquier repo de aplicación:

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

Fija la referencia a un tag (`@v1`) y no a `main`. Cambiar un reusable workflow en `main` y romper el despliegue de veinte servicios a la vez es una experiencia que solo se vive una vez.

## GitHub Actions vs Tekton / OpenShift Pipelines

Esta es la conversación que tengo con casi todos los clientes que están en OpenShift. Mi posición, después de haber operado ambos en producción, es que no son competidores directos: resuelven el mismo problema desde lugares distintos.

| Aspecto | GitHub Actions | Tekton / OpenShift Pipelines |
|---|---|---|
| Dónde se ejecuta | Runners de GitHub o self-hosted | Pods dentro de tu cluster |
| Modelo | YAML de workflow, muy conciso | CRDs de Kubernetes (Task, Pipeline, PipelineRun) |
| Curva de aprendizaje | Baja; el marketplace resuelve mucho | Media-alta; más verboso, más explícito |
| Acceso al cluster | Necesita exponer el API server o runner self-hosted | Nativo; el pipeline ya está dentro |
| Air-gapped / compliance | Complicado sin self-hosted runners | Es su caso de uso natural |
| Integración con GitHub | Perfecta (checks, PR status, environments) | Vía Pipelines as Code o webhooks; funciona pero requiere configuración |
| Soporte empresarial | GitHub Enterprise | Incluido en la suscripción de OpenShift |
| Escalado | Transparente, pagas por minuto | Escala con el cluster; recursos que tú operas |

### Cuándo elijo GitHub Actions

- El código vive en GitHub y el equipo ya está cómodo allí.
- El cluster es accesible (cloud público, o se acepta un self-hosted runner en la red interna).
- Quieres velocidad de adopción: en una tarde tienes CI con checks en PR.
- El pipeline es mayoritariamente CI (lint, test, build) y el despliegue es sencillo.

### Cuándo elijo Tekton / OpenShift Pipelines

- **Gobernanza**: el cliente exige que ninguna credencial del cluster salga de él. Con Tekton, el pipeline usa una ServiceAccount del propio namespace; no hay kubeconfig que exportar.
- **Air-gapped**: sin salida a Internet no hay runners de GitHub. Tekton corre con las imágenes que ya tienes en tu registry interno.
- **Auditoría**: cada `PipelineRun` es un objeto de Kubernetes con su historial, sus logs y su estado, consultable con `oc` y visible en la consola de OpenShift. En entornos regulados esto pesa mucho.
- **Todo el ciclo dentro de la plataforma**: si ya usas Argo CD (OpenShift GitOps), tener build y deploy como CRDs encaja con el modelo mental de "todo es un manifiesto".
- **Builds pesados** que se benefician de correr cerca del registry y de los recursos del cluster (por ejemplo, con Buildah y cache de capas en un PVC).

Lo que no te van a contar en la documentación: Tekton es más verboso y tiene más piezas móviles (Tasks, Workspaces, PVCs, Triggers, EventListeners). El primer pipeline te lleva un día en lugar de una tarde. A cambio, no dependes de nada fuera de la plataforma y el modelo de seguridad es el mismo que el resto de tus cargas.

### Un ejemplo mínimo de Pipeline en OpenShift Pipelines

Para que se vea la diferencia de estilo, este es el equivalente aproximado del pipeline anterior. Uso el resolver `cluster`, que es la forma actual de referenciar las Tasks que OpenShift Pipelines instala en el namespace `openshift-pipelines`.

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

Es más YAML, sí. Pero fíjate en que el paso `deploy` no tiene ningún secret: la ServiceAccount `pipeline` del namespace ya tiene permisos, y el digest viaja como resultado de la Task anterior sin salir nunca del cluster.

### Combinarlos: el patrón que más recomiendo

En bastantes clientes he acabado con un híbrido que funciona muy bien:

1. **GitHub Actions para CI**: lint, tests unitarios, análisis estático, checks en el PR. Todo lo que no necesita tocar el cluster.
2. **Tekton o Argo CD para CD**: GitHub Actions publica la imagen y actualiza el tag en un repo de manifiestos; Argo CD detecta el cambio y sincroniza. O bien un webhook dispara un `PipelineRun` vía Tekton Triggers.

Así el equipo de desarrollo conserva la experiencia de GitHub que le gusta, y el equipo de plataforma mantiene el control de lo que entra en el cluster sin exponer credenciales hacia fuera. La frontera queda clara: el CI produce artefactos, el CD los consume desde dentro.

## Lecciones que me han costado caras

- **Fija versiones de actions.** `actions/checkout@v4` está bien; `@main` no. Para entornos regulados, fija incluso el SHA del commit.
- **Un job de deploy que no valida el rollout es un job decorativo.** `rollout status` con timeout, siempre.
- **No hagas del pipeline un script de bash de 200 líneas.** Si crece, sepáralo en scripts versionados en el repo y llámalos desde el workflow. Se prueban en local y se revisan en PR.
- **Revisa los `permissions` cada vez que añades una action.** El default de `GITHUB_TOKEN` puede ser demasiado amplio dependiendo de la configuración de la organización.
- **Si necesitas self-hosted runners para llegar al cluster, ya estás operando infraestructura de CI.** Es el momento de preguntarse si Tekton, que se opera como cualquier otro operador de OpenShift, no te sale más barato.

## Conclusión

GitHub Actions es la opción por defecto correcta para la mayoría de proyectos que viven en GitHub, y con `permissions` mínimos, despliegue por digest y validación de rollout, tienes un pipeline que aguanta producción. Pero cuando el requisito es que nada salga del cluster, ya sea por compliance, por air-gap o porque la plataforma es OpenShift y quieres un solo modelo de seguridad, Tekton y OpenShift Pipelines dejan de ser "la alternativa complicada" y pasan a ser la única respuesta honesta. Elegir bien no es cuestión de gustos: es cuestión de dónde tienen que vivir tus credenciales.
