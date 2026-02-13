---
title: "Agente de IA para SREs: MCP Servers + Gen AI Studio en OpenShift AI"
description: "Cómo construí un asistente de operaciones con 4 MCP Servers (Prometheus, Alertmanager, Kubernetes, Red Hat KB) usando Gen AI Studio en OpenShift AI 3.2."
pubDate: 2026-02-13
image: "/images/blog/mcp-genai-studio/cover.webp"
tags: ["openshift-ai", "mcp", "genai-studio", "llama", "kubernetes", "prometheus", "alertmanager", "agentic-ai", "tech-preview"]
categories: ["ia", "openshift", "kubernetes"]
featured: true
lang: "es"
---

Hace unas semanas me encontré con un problema familiar: estaba troubleshooting un cluster de OpenShift a las 2am, saltando entre Prometheus, Alertmanager, la consola de Kubernetes y la Knowledge Base de Red Hat. Pestañas por todos lados, copiando y pegando queries, buscando soluciones... y pensé: **"¿Por qué no puedo simplemente preguntarle a alguien que haga todo esto por mí?"**

Ese "alguien" resultó ser un agente de IA.

En este artículo te cuento cómo construí un asistente de operaciones que puede consultar métricas, revisar alertas, interactuar con Kubernetes y buscar soluciones en la KB de Red Hat — todo desde una conversación. Y lo mejor: usando las nuevas funcionalidades Tech Preview de **Red Hat OpenShift AI 3.2**.

## ¿Qué es Red Hat OpenShift AI?

Antes de entrar en detalles, déjame explicarte qué es OpenShift AI para quienes no lo conocen.

**Red Hat OpenShift AI** es la plataforma de inteligencia artificial de Red Hat construida sobre OpenShift. En términos simples: es donde puedes desarrollar, entrenar, servir y gestionar modelos de IA de forma empresarial.

¿Por qué importa? Porque tener un modelo de IA no es suficiente — necesitas:
- **Infraestructura** para ejecutarlo (GPUs, almacenamiento, red)
- **Herramientas** para experimentar (notebooks, pipelines)
- **Gobernanza** para controlar accesos
- **Observabilidad** para saber qué hace tu modelo
- **Integración** con tu stack empresarial

OpenShift AI te da todo esto sobre Kubernetes.

## La Gran Evolución: De RHOAI 2.x a 3.x

Si has seguido OpenShift AI, sabrás que la **versión 3.0** (finales de 2025) trajo un cambio de filosofía importante.

### RHOAI 2.x (2023-2025)
- Enfocado en **MLOps tradicional**: notebooks, pipelines, model serving
- Interfaz principal: **Open Data Hub Dashboard**
- Model serving con KServe y ModelMesh
- Data Science Pipelines basado en Kubeflow

### RHOAI 3.x (2025-presente)
- Nueva visión: **Agentic AI** e **IA Generativa empresarial**
- Dos nuevas experiencias:
  - **AI Hub** — Para Platform Engineers (catálogo, registry, deployments)
  - **Gen AI Studio** — Para AI Engineers (playground, experimentación, MCP)
- Soporte nativo para **Llama Stack API**
- Integración con **Model Context Protocol (MCP)**

**La diferencia clave**: RHOAI 2.x te ayudaba a entrenar y servir modelos. RHOAI 3.x te ayuda a construir **agentes de IA** que pueden razonar, planificar y actuar.

## Tech Preview en RHOAI 3.2: Lo Que Usé

Red Hat lanza funcionalidades nuevas como **Technology Preview** antes de que estén completamente soportadas. En mi experimento usé varias de ellas:

| Feature | Estado | Qué Hace |
|---------|--------|----------|
| **Gen AI Studio** | Tech Preview | Playground para experimentar con modelos y MCP |
| **AI Hub** | Developer Preview | Dashboard para gestionar assets de IA |
| **Llama Stack** | Developer Preview | API unificada para RAG, safety, tool calling |
| **MCP Servers** | Developer Preview | Protocolo para conectar LLMs a herramientas |

### Cómo Habilitar Gen AI Studio

En mi caso, con RHOAI 3.2.0, Gen AI Studio ya venía habilitado. Pero si necesitas habilitarlo manualmente, debes modificar el **DataScienceCluster**:

```yaml
apiVersion: datasciencecluster.opendatahub.io/v1
kind: DataScienceCluster
metadata:
  name: default-dsc
spec:
  components:
    dashboard:
      managementState: Managed
      devFlags:
        manifests:
          - uri: https://github.com/opendatahub-io/odh-dashboard/tarball/main
            contextDir: manifests
            sourcePath: overlays/odh
```

Para verificar que Gen AI Studio está habilitado, revisa el DSCInitialization:

```bash
oc get dsci default-dsci -o yaml | grep -A5 genAiStudio
```

Deberías ver:
```yaml
genAiStudio:
  managementState: Managed
```

## Mi Stack: 4 MCP Servers + Llama 3.2 + Gen AI Studio

### El Entorno

| Componente | Detalles |
|------------|----------|
| **OpenShift** | 4.20.12 |
| **RHOAI** | 3.2.0 |
| **Nodo** | SNO g6.4xlarge (16 vCPU, 64GB RAM, NVIDIA L4) |
| **Modelo** | Llama 3.2 3B Instruct (vLLM, tool calling habilitado) |

### Los 4 MCP Servers

1. **Prometheus MCP Server** (11 tools) — Consultar métricas, diagnosticar nodos, investigar pods
2. **Alertmanager MCP Server** (12 tools) — Ver alertas, crear silences, investigar incidentes
3. **Kubernetes MCP Server** (23 tools) — Listar pods, ver logs, ejecutar comandos, gestionar recursos
4. **Red Hat KB MCP Server** (5 tools) — Buscar soluciones, troubleshoot errores, consultar documentación

**Total: 51 herramientas** disponibles para el agente.

## Paso 1: Desplegar el Modelo con Tool Calling

Lo primero fue desplegar Llama 3.2 3B con KServe, **habilitando tool calling**. Esto es crítico — sin tool calling, el modelo no puede usar las herramientas MCP.

```yaml
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: llama-32-3b-instruct
  namespace: my-first-model
  labels:
    opendatahub.io/genai-asset: "true"  # Requerido para Gen AI Studio
spec:
  predictor:
    model:
      modelFormat:
        name: vLLM
      runtime: vllm-runtime-cuda
      storageUri: oci://quay.io/modh/llama-3.2-3b-instruct:latest
      args:
        - --enable-auto-tool-choice        # Habilita tool calling
        - --tool-call-parser=llama3_json   # Parser para Llama 3
        - --max-model-len=8192
    resources:
      limits:
        nvidia.com/gpu: 1
      requests:
        memory: 16Gi
        cpu: 4
```

Una vez desplegado, verificamos que aparece en Gen AI Studio:

![Gen AI Studio - Models Tab](/images/blog/mcp-genai-studio/gen-ai-models-tab.png)
*El modelo Llama 3.2 3B aparece con estado "Active" en Gen AI Studio.*

## Paso 2: Desplegar los MCP Servers

Usé Helm charts para desplegar los 4 servidores. Aquí está la configuración para cada uno:

### Prometheus MCP Server

```bash
helm install mcp-prometheus ./mcp-prometheus/charts/mcp-prometheus \
  -n mcp-servers \
  --set openshift=true \
  --set prometheus.namespace=openshift-monitoring \
  --set prometheus.service=prometheus-operated \
  --set prometheus.servicePort=9090 \
  --set prometheus.serviceScheme=https
```

### Alertmanager MCP Server

```bash
helm install mcp-alertmanager ./mcp-alertmanager/charts/mcp-alertmanager \
  -n mcp-servers \
  --set openshift=true \
  --set alertmanager.namespace=openshift-monitoring \
  --set alertmanager.service=alertmanager-operated \
  --set alertmanager.servicePort=9093 \
  --set alertmanager.serviceScheme=https
```

### Kubernetes MCP Server

```bash
helm install kubernetes-mcp-server ./kubernetes-mcp-server/charts/kubernetes-mcp-server \
  -n mcp-servers \
  --set openshift=true \
  --set rbac.extraClusterRoleBindings[0].name=cluster-admin \
  --set rbac.extraClusterRoleBindings[0].roleRef.name=cluster-admin \
  --set rbac.extraClusterRoleBindings[0].roleRef.external=true
```

### Red Hat KB MCP Server

```bash
# Primero crear el secret con tu token de Red Hat
oc create secret generic mcp-redhat-kb-secret \
  -n mcp-servers \
  --from-literal=REDHAT_TOKEN=tu-token-aqui

helm install mcp-redhat-kb ./mcp-redhat-kb/charts/mcp-redhat-kb \
  -n mcp-servers \
  --set openshift=true \
  --set redhat.existingSecret=mcp-redhat-kb-secret
```

## Paso 3: Registrar MCP Servers en Gen AI Studio

Aquí viene la parte interesante. Gen AI Studio descubre los MCP servers a través de un **ConfigMap** en el namespace `redhat-ods-applications`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: gen-ai-aa-mcp-servers
  namespace: redhat-ods-applications
data:
  Prometheus-MCP-Server: |
    {
      "url": "https://mcp-prometheus-mcp-servers.apps.ocp.example.com/sse",
      "description": "MCP server para consultar métricas de Prometheus"
    }
  Alertmanager-MCP-Server: |
    {
      "url": "https://mcp-alertmanager-mcp-servers.apps.ocp.example.com/sse",
      "description": "MCP server para gestionar alertas de Alertmanager"
    }
  Kubernetes-MCP-Server: |
    {
      "url": "https://kubernetes-mcp-server-mcp-servers.apps.ocp.example.com/sse",
      "description": "MCP server para gestionar recursos de Kubernetes/OpenShift"
    }
  RedHat-KB-MCP-Server: |
    {
      "url": "https://mcp-redhat-kb-mcp-servers.apps.ocp.example.com/mcp",
      "description": "MCP server para buscar en la Knowledge Base de Red Hat"
    }
```

**Nota importante sobre los endpoints**: Los servidores en Go usan `/sse`, mientras que el servidor de Red Hat KB (Java) usa `/mcp`. Esto es por diferencias en el transporte MCP (SSE vs Streamable HTTP).

### El Problema del "Token Required"

Cuando registré los servidores por primera vez, el Kubernetes MCP Server mostraba "Token Required":

![MCP Servers - Antes del fix](/images/blog/mcp-genai-studio/gen-ai-mcp-servers-initial.png)
*El Kubernetes MCP Server mostraba "Token Required" — un problema de transporte MCP.*

El problema era que estaba usando `/sse` pero Gen AI Studio esperaba `/mcp` para Streamable HTTP. La solución fue verificar qué transporte usa cada servidor:

```bash
# Para verificar el transporte correcto
curl -X POST https://tu-mcp-server.apps.example.com/sse
curl -X POST https://tu-mcp-server.apps.example.com/mcp
```

Después del fix, todos los servidores aparecen como "Active":

![Gen AI Studio - MCP Servers](/images/blog/mcp-genai-studio/gen-ai-mcp-servers.png)
*Los 4 MCP servers registrados y activos en Gen AI Studio.*

## Paso 4: Probando el Playground

Con todo configurado, llegó el momento de la verdad. Abrí el Playground de Gen AI Studio y conecté los 4 MCP servers:

![Playground - Inicial](/images/blog/mcp-genai-studio/gen-ai-playground.png)
*El Playground con los 4 MCP servers disponibles para conectar.*

![Playground - Conectado](/images/blog/mcp-genai-studio/gen-ai-playground-connected.png)
*51 herramientas activas — Gen AI Studio advierte sobre el impacto en rendimiento.*

**La advertencia es real**: Con 51 herramientas, el modelo de 3B parámetros tiene que procesar mucha información en cada request. Para producción, recomendaría un modelo de 8B+ parámetros.

## ¿Qué Puedes Hacer con Esto?

Esta es la parte emocionante. Con este setup, puedes pedirle al agente cosas como:

### Diagnóstico de Cluster
> "¿Cuál es el estado de salud del cluster? ¿Hay alertas críticas?"

El agente:
1. Consulta `getClusterHealthOverview` en Prometheus
2. Obtiene `getCriticalAlerts` de Alertmanager
3. Te da un resumen con recomendaciones

### Investigación de Problemas
> "El pod X está en CrashLoopBackOff. ¿Qué está pasando?"

El agente:
1. Usa `pods_get` para ver el estado del pod
2. Consulta `pods_log` para ver los logs
3. Busca en `investigatePod` de Prometheus las métricas
4. Busca soluciones en `troubleshootError` de Red Hat KB

### Operaciones Guiadas
> "Necesito silenciar la alerta KubePodCrashLooping por 2 horas mientras investigo"

El agente:
1. Usa `createSilence` en Alertmanager
2. Confirma que el silence se creó correctamente

### El Sueño del SRE
Imagina un sistema que:
- **Detecta** una alerta en tu cluster
- **Diagnostica** el problema consultando métricas
- **Busca** soluciones en la KB de Red Hat
- **Ejecuta** acciones correctivas (con aprobación)
- **Reporta** lo que hizo

Esto es **Agentic AI** aplicado a operaciones. Y OpenShift AI 3.x está construyendo la infraestructura para hacerlo de forma empresarial.

## Lecciones Aprendidas

### 1. El Tamaño del Modelo Importa para Tool Calling
Un modelo de 3B parámetros con 51 herramientas es desafiante. A veces el modelo se confunde sobre qué herramienta usar. Para producción, usa 8B+ parámetros.

### 2. MCP Transport No Es Uniforme
`/sse` vs `/mcp` — siempre verifica el transporte correcto. Los servidores en Go típicamente usan SSE (GET), mientras que otros usan Streamable HTTP (POST).

### 3. SNO Tiene Recursos Limitados
En un Single Node OpenShift, el CPU es el cuello de botella. El modelo compite con los MCP servers por recursos. Planifica los resource requests cuidadosamente.

### 4. Gen AI Studio Está Madurando Rápido
Es Tech Preview, pero ya es muy funcional. La integración con MCP servers funciona bien y la UI es intuitiva.

### 5. Los Logs Son Tu Amigo
Cuando algo no funciona, los logs de los MCP servers son invaluables:
```bash
oc logs -f deployment/mcp-prometheus -n mcp-servers
```

## Hacia Dónde Va OpenShift AI

Red Hat tiene un roadmap ambicioso para MCP y Agentic AI:

1. **MCP Catalog en AI Assets** — Los servidores MCP aparecerán en el catálogo junto a los modelos
2. **MCP Registry** — Gestión de versiones, escaneo de seguridad, certificación
3. **MCP Gateway** — Policies, rate limits, logging centralizado
4. **MCPaaS (MCP-as-a-Service)** — Hosting centralizado de servidores MCP
5. **Servidores MCP Nativos** — Para OpenShift, Ansible, RHEL, Lightspeed

La visión es clara: **infraestructura empresarial para AI Agents**.

## Próximamente: kagent, kmcp y Más

Este artículo se enfocó en Gen AI Studio y MCP servers "tradicionales". Pero hay más en el ecosistema:

- **kagent** — Framework de Kubernetes para ejecutar agentes de IA como workloads nativos
- **kmcp** — Implementación de MCP sobre Kubernetes con CRDs y operadores
- **Llama Stack en OpenShift** — Deploy nativo de la API de Meta para agentes

En un **próximo artículo** estaré explorando estas herramientas y cómo se integran con lo que construimos aquí. La idea es tener un agente que no solo pueda consultar información, sino que también pueda tomar acciones automatizadas de forma segura.

**Stay tuned!**

## Referencias

- [Red Hat OpenShift AI - Product Page](https://www.redhat.com/en/products/ai/openshift-ai)
- [Introducing AI Hub and Gen AI Studio](https://www.redhat.com/en/blog/introducing-ai-hub-and-genai-studio-new-command-center-enterprise-generative-ai-red-hat-openshift-ai)
- [Building Effective AI Agents with MCP](https://developers.redhat.com/articles/2026/01/08/building-effective-ai-agents-mcp)
- [MCP Servers for Red Hat OpenShift AI](https://www.redhat.com/en/products/ai/openshift-ai/mcp-servers)
