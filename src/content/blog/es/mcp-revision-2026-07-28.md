---
title: "MCP por dentro: qué cambió en la revisión 2026-07-28 y qué apareció al auditar ocho servidores propios"
description: "El protocolo se quedó sin saludo, sin sesiones y sin conexión permanente. Qué significa para quien mantiene un servidor MCP, el fallo silencioso del ttlMs a cero y los hallazgos de contrastar la especificación con código real."
pubDate: 2026-09-04
tags: ["mcp", "agentic-ai", "quarkus", "oauth", "protocolos", "arquitectura"]
categories: ["ia"]
featured: false
lang: "es"
---

## Un servidor que decía "no guardes nada" y nadie se enteró

Mantengo un servidor MCP en producción, `mcp-redhat-kb`. Busca en la base de conocimiento de Red Hat, expone cuatro herramientas de solo lectura, tiene 273 tests y lo usa gente ajena al equipo. Usa la librería correcta en su versión correcta. Todos los tests en verde.

Y llevaba tiempo diciéndole a cada cliente que se conectaba: "no guardes nada de lo que te doy". Ni un milisegundo.

No fallaba nada. Ningún error, ningún test en rojo, ningún aviso en los logs. Lo encontré porque me puse a leer la revisión 2026-07-28 del Model Context Protocol con el código delante, y uno de los campos nuevos que la revisión exige en el listado de herramientas, `ttlMs`, venía a `0` por defecto en la extensión que uso. Cero no significa "sin límite": significa "no cachees".

Ese hallazgo me llevó a revisar los otros siete servidores que tenía escritos, y lo que apareció ahí es peor que un cero. Pero vamos por partes: primero qué cambió en el protocolo, después qué implica para quien mantiene un servidor, y al final lo que salió de la auditoría.

Si buscas cómo desplegar servidores MCP en OpenShift AI, eso ya lo conté en [otro artículo](/es/blog/mcp-servers-genai-studio-openshift-ai). Este va de lo que ocurre dentro del protocolo.

## Las revisiones de MCP no llevan número, llevan fecha

MCP no tiene un 2.1 ni un 3.0. Cada versión de la especificación se identifica por la fecha en que se cerró, y un servidor puede hablar varias a la vez para no dejar tirados a los clientes antiguos. Hasta hoy hay cinco:

| Revisión | Qué trajo |
|---|---|
| `2024-11-05` | La primera. Tools, resources y prompts sobre JSON-RPC, con transporte por entrada y salida estándar. |
| `2025-03-26` | Autorización con OAuth 2.1 y el transporte Streamable HTTP, que sustituye al HTTP+SSE anterior. |
| `2025-06-18` | Salida estructurada: una herramienta puede declarar el esquema de lo que devuelve, no solo el de lo que recibe. |
| `2025-11-25` | La anterior a la vigente. Es la que casi todo el mundo tiene desplegada hoy. |
| `2026-07-28` | La vigente: fuera el saludo inicial, fuera las sesiones, fuera la conexión permanente. |

Conviene despejar una duda antes de seguir, porque muchos artículos de mediados de 2026 todavía llaman "draft" a esta revisión. Ya no lo es. Comprobado el 1 de septiembre de 2026:

```bash
$ curl -sIL modelcontextprotocol.io/specification/latest
HTTP/2 307
location: /specification/2026-07-28
```

Los cambios no salieron de una ocurrencia. La especificación solo evoluciona a través de propuestas escritas y discutidas en abierto, las **Specification Enhancement Proposals**. Y esto tiene una utilidad práctica que conviene conocer: la especificación dice *qué* hay que hacer, pero casi nunca *por qué*. Ese razonamiento —con los casos que lo motivaron y las alternativas descartadas— está en la SEP. Cuando una regla te parezca arbitraria, ahí encontrarás el motivo.

Las que sostienen casi todo lo que sigue:

| SEP | Qué propuso |
|---|---|
| [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2575-stateless-mcp.md) | Quitar el saludo `initialize` |
| [SEP-2567](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2567-sessionless-mcp.md) | Quitar las sesiones |
| [SEP-2322](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2322-MRTR.md) | El patrón de reintento |
| [SEP-2549](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2549-TTL-for-list-results.md) | Los tiempos de caché en los listados |
| [SEP-2577](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2577-deprecate-roots-sampling-and-logging.md) | Lo que quedó obsoleto |

Todas viven en [`seps/`](https://github.com/modelcontextprotocol/modelcontextprotocol/tree/main/seps) dentro del repositorio de la especificación. Un aviso por si vas a buscar otra: el nombre del archivo mezcla el número con un título abreviado —`2549-TTL-for-list-results.md`—, así que no puedes componer la URL de memoria. Lo práctico es abrir el directorio y buscar por número. El proceso de propuesta está descrito en las [directrices de SEP](https://modelcontextprotocol.io/community/sep-guidelines).

Y la especificación en sí, para consultarla directamente: [`modelcontextprotocol.io/specification/2026-07-28`](https://modelcontextprotocol.io/specification/2026-07-28). El [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) lista los cambios uno a uno, que es la lectura más rentable si ya conoces la revisión anterior.

## El cambio central: el protocolo se queda sin estado

Hasta la revisión anterior, hablar con un servidor MCP empezaba con un saludo. El cliente mandaba `initialize`, negociaba versión y capacidades, recibía un identificador de sesión en la cabecera `Mcp-Session-Id`, confirmaba con `notifications/initialized` y solo entonces podía pedir algo. Cuatro mensajes para hacer una llamada, y los tres primeros eran preámbulo.

El problema no era la ceremonia. Era que a partir de ese saludo, ese servidor concreto recordaba quién eras. Y en producción un servidor no es un proceso: son varias réplicas idénticas repartiéndose el trabajo detrás de un balanceador. Con diez réplicas, la segunda petición tenía que caer exactamente en la misma que atendió la primera, porque solo esa conocía la sesión.

Las propuestas listan tres problemas que reportaban quienes ya tenían servidores en producción:

| Problema | Qué pasaba |
|---|---|
| No escalaba | Un balanceador convencional reparte cada petición donde le conviene. Aquí no valía: obligaba a configurar sticky sessions, que la propuesta califica de "complejas y frágiles". |
| Era frágil ante fallos | Si moría la instancia que tenía tu sesión, tu sesión moría con ella. De ahí toda la maquinaria de reanudar conexiones. |
| Costaba implementarlo | El servidor debía crear, guardar y limpiar estado por cliente: "una fuente habitual de errores y fugas de memoria". |

Se propuso mantener las sesiones como opción. Lo rechazaron: soportar dos modelos de interacción en paralelo habría aumentado drásticamente la complejidad del protocolo y de cada implementación. Prefirieron el corte limpio.

### Antes y después, en mensajes

```text
# 2025-11-25
cliente -> servidor   initialize { protocolVersion, capabilities }
servidor -> cliente   result + Mcp-Session-Id
cliente -> servidor   notifications/initialized
cliente -> servidor   tools/call + Mcp-Session-Id      <- en cada petición

# 2026-07-28
cliente -> servidor   tools/call searchKnowledgeBase { _meta: { ... } }
```

Un mensaje. La identidad viaja dentro. Cualquier réplica lo atiende.

### Lo que también desaparece

`ping` se elimina del todo: cualquier llamada normal ya demuestra que el servidor está vivo, y para vigilar la salud de la conexión ya están los mecanismos de HTTP y TCP. Las peticiones del servidor al cliente desaparecen como categoría: el servidor ya no exige una conexión viva para pedirte algo, termina la llamada y el cliente reintenta.

Y tres capacidades quedan obsoletas con doce meses de margen, por el mismo motivo declarado: poca adopción para lo que costaba implementarlas.

| Capacidad | Por qué se va | Qué usar |
|---|---|---|
| Roots | Semántica ambigua; se solapaba con los argumentos de las herramientas | Argumentos o configuración |
| Sampling | Compleja de implementar y poco adoptada por los clientes | Hablar directo con la API del modelo |
| Logging | Se solapaba con la salida de error del proceso y con OpenTelemetry | `stderr` u OpenTelemetry |

No todos estuvieron de acuerdo. En la discusión pública quedó registrada la objeción de que, al quitar Sampling, un servidor ya no puede pedirle inferencia al cliente, así que o la paga él o encuentra cómo cobrártela. Lo menciono porque una especificación no es un texto revelado: es gente discutiendo, y las objeciones siguen ahí escritas.

### El intercambio, sin adornos

Los servidores se volvieron mucho más simples de operar. Los clientes asumieron bastante trabajo adicional. ¿Por qué en ese sentido? Porque los harnesses son pocos y los servidores son muchos: cada aplicación de chat o IDE implementa su cliente una vez, mientras que servidores los escribe cualquiera. Si hay que trasladar complejidad a alguien, conviene trasladarla a quien la va a implementar pocas veces y bien.

## Qué implica para quien mantiene un servidor

El estado no se borra: se muda. Sigue habiendo tokens, trabajo a medias y tareas pendientes, pero salen del servidor y se reparten entre el cliente y la propia petición. Para quien escribe el servidor eso se traduce en cuatro piezas concretas.

### La identidad viaja en `_meta`, en cada petición

`_meta` es el hueco que el protocolo reserva en cada mensaje para lo que no son argumentos de la herramienta sino datos sobre la petición. Dentro va lo mínimo para que el servidor sepa con quién habla:

```json
{
  "method": "tools/call",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { "name": "claude-code" },
      "io.modelcontextprotocol/clientCapabilities": { }
    },
    "name": "searchKnowledgeBase",
    "arguments": { "query": "etcd unhealthy after upgrade" }
  }
}
```

Si le quitas el bloque `_meta`, el servidor rechaza la petición. No por severidad, sino porque sin él no le queda ningún otro sitio de donde sacar esa información: ya no hay saludo previo ni sesión que consultar. En `mcp-redhat-kb` la respuesta es un `-32602` con el texto "Stateless request must include _meta". Si tu servidor sigue leyendo la identidad de la sesión, rechazará peticiones perfectamente válidas en cuanto haya más de una réplica.

### `server/discover` es obligatorio

Al desaparecer el saludo, desaparece el momento en que ambos negociaban versión y capacidades. Para eso está `server/discover`, un método nuevo que todo servidor debe implementar y que el cliente llama solo si le hace falta. Esta es la respuesta real de `mcp-redhat-kb`:

```json
{
  "supportedVersions": ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"],
  "serverInfo": { "name": "redhat-kb-mcp", "version": "1.0.0" },
  "capabilities": { "logging": {}, "tools": {} },
  "cacheScope": "public",
  "ttlMs": 300000
}
```

Soporta las cinco revisiones a la vez, así que los clientes viejos siguen funcionando contra el mismo servidor. Sin `server/discover`, un cliente nuevo no puede averiguar qué hablas y te descarta.

### `resultType` dice si la respuesta es definitiva

La revisión añade a toda respuesta un campo `resultType`. Es lo primero que mira el cliente, y solo admite tres valores:

| Valor | Situación | Qué ocurre después |
|---|---|---|
| `complete` | El resultado está listo. Nadie espera a nadie. | Nada. Es el caso de las cuatro herramientas de `mcp-redhat-kb`. |
| `input_required` | El servidor necesita algo tuyo: confirmar, pagar, autorizar acceso a otro sitio. | La llamada termina. Devuelve un `requestState` opaco que el cliente reenvía tal cual en el reintento, junto con tu respuesta. |
| `task` | El servidor está ocupado consigo mismo. Va a tardar. | Devuelve un `taskId` y el cliente pregunta periódicamente con `tasks/get`. |

Lo importante de `input_required` es que la llamada termina. El servidor no se queda esperándote, así que puedes tardar diez minutos, y como el `requestState` viaja en la petición y no en un proceso concreto, el reintento lo atiende cualquier réplica. Este mecanismo sustituye al antiguo `elicitation/create`, que pedía datos a mitad de llamada manteniendo la conexión abierta.

Sin `resultType`, el cliente no distingue una respuesta definitiva de una a medias.

### `ttlMs`: cuánto tiempo puede fiarse el cliente de lo que le dijiste

Si el cliente ya no pregunta cada vez, alguien tiene que decidir cuánto tiempo puede reutilizar lo que le contestaste. Cada respuesta cacheable lleva su `ttlMs`, y el que importa de verdad es el del listado de herramientas, la respuesta a `tools/list`. Con un valor razonable, el cliente deja de preguntar y la primera fase de cada conversación ni siquiera toca la red.

La propuesta que lo introdujo, [SEP-2549](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2549-TTL-for-list-results.md), buscaba que mantener una conexión abierta para recibir avisos dejara de ser obligatorio y pasara a ser una optimización. Si el catálogo rara vez cambia, decir "esto vale una hora" resuelve el problema sin conexión permanente.

Hay un segundo motivo menos evidente. Los clientes también cachean el prompt que mandan al modelo, y esa caché se rompe en cuanto una sola letra cambia. Como los esquemas de las herramientas van dentro de ese prompt, basta con que el catálogo llegue en distinto orden para invalidarla entera. Por eso la revisión también pide que `tools/list` devuelva siempre las herramientas en el mismo orden.

## El fallo silencioso

Vuelvo al cero del principio, porque ahora se entiende del todo.

`mcp-redhat-kb` está escrito en Java con Quarkus y usa la extensión oficial de MCP para Quarkus, en la versión que implementa `2026-07-28`. La extensión deja `ttlMs` de `tools/list` a `0` por defecto, y nada falla ni avisa. Cada cliente que se conectaba volvía a pedir los mismos cuatro esquemas, y la caché de prompt del harness no sobrevivía entre sesiones.

La corrección fueron dos líneas de configuración:

```properties
quarkus.mcp.server.tools.ttl-ms=3600000
quarkus.mcp.server.tools.cache-scope=public
```

De `0` a `3 600 000`: una hora de caché. El harness deja de preguntar.

Lo incómodo no es el cero, sino cómo lo encontré: la propiedad que lo controla no está documentada. Apareció inspeccionando las clases de configuración dentro del `.jar` de la extensión, en `McpServerRuntimeConfig$Tools`. No había forma de dar con ella leyendo.

### `cacheScope`: una decisión que conviene pensar dos veces

El segundo campo admite dos valores:

| Valor | Qué significa |
|---|---|
| `public` | No hay nada específico de un usuario. Cualquier cliente, pasarela o proxy puede guardarlo y servírselo a cualquiera. |
| `private` | Solo se reutiliza dentro del mismo contexto de autorización. Otro token, otra caché. |

El riesgo de `public` es este: un servidor malicioso devuelve un catálogo envenenado y lo marca como público. Una pasarela compartida lo guarda y se lo sirve a los demás. El envenenamiento se propaga a quien nunca habló con ese servidor. Y el campo lo escribe el servidor, así que el atacante lo controla por completo. Por eso la propia especificación avisa de que `cacheScope` no sirve como control de acceso: quien decide qué puede ver cada usuario es la autorización, no una etiqueta de caché.

En `mcp-redhat-kb` puse `public` de forma deliberada: son cuatro herramientas idénticas para todo el mundo. Si tu catálogo cambia según el usuario, la respuesta es `private`.

### La lección

Cumplir la especificación no es elegir la librería correcta. Los valores por defecto de tu framework pueden dejarte fuera de conformidad en silencio, y la única forma de saberlo es preguntarle al servidor por el protocolo y mirar qué contesta:

```bash
META='"_meta":{
  "io.modelcontextprotocol/protocolVersion":"2026-07-28",
  "io.modelcontextprotocol/clientInfo":{"name":"lab","version":"1.0"},
  "io.modelcontextprotocol/clientCapabilities":{}
}'

curl -s -X POST http://127.0.0.1:9098/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Method: tools/list' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\",\"params\":{$META}}"
```

Si tienes un servidor MCP en producción: ¿sabes qué `ttlMs` está devolviendo ahora mismo?

## Lo que apareció al auditar ocho servidores propios

Hasta aquí todo se ha probado sobre `mcp-redhat-kb`, y siempre ha respondido lo esperado. Pero ese servidor está elegido: cuatro herramientas, todas de solo lectura. Es el caso fácil, y un ejemplo que solo confirma lo que quieres enseñar no demuestra casi nada.

Así que cambié el método. En vez de un servidor elegido, todo lo que tenía escrito antes de leer la revisión: nueve directorios, de los que uno resultó ser una carpeta de diapositivas. Quedan ocho. De cada uno conté cuántas herramientas escriben en sistemas reales (abren un ticket, borran un recurso) y cuántos tests hay para comprobar que no lo hacen mal.

El recuento agregado: entre los ocho suman 86 herramientas, de las cuales 19 escriben. Tres servidores son de solo lectura, como el ejemplo. Dos de los ocho son públicos y se pueden nombrar; los otros seis son proyectos internos y van sin nombre, pero sus cifras cuentan igual.

| Proyecto | Stack | Tools | Escriben | Tests |
|---|---|---|---|---|
| `mcp-redhat-kb` | Java, Quarkus | 4 | 0 | 273 |
| `kubernetes-mcp-server` | Go | ~26 | 8 | 62 archivos |

Solo `mcp-redhat-kb` está en `2026-07-28`. Los otros siete siguen en `2025-11-25` o anterior.

### La buena noticia

Tres de los ocho encajan por completo en el caso de solo lectura: todas sus herramientas son consultas que responden `complete` y terminan. La revisión hace que esos servidores sean servibles por una función HTTP sin memoria. Para ellos, migrar es sobre todo borrar código.

### Primer hallazgo: tres servidores, el mismo parche

Para entrar en un servicio de terceros en nombre del usuario, tres servidores independientes resolvieron el problema con el mismo remedio improvisado: haciendo que la persona extraiga las credenciales a mano del navegador. Uno pide copiar dos cookies desde las herramientas de desarrollo. Otro, un JWT de sesión extraído del navegador y pegado en una variable de entorno. El tercero, un token copiado a mano desde un portal. Tres variantes del mismo gesto.

Es deficiente por tres motivos concretos. La credencial acaba en texto plano en una variable de entorno, donde cualquier proceso de la máquina la lee. Caduca sin avisar, y cuando lo hace el servidor falla sin poder renovarla solo. Y no tiene alcance: una cookie de sesión sirve para todo lo que tú puedes hacer en esa plataforma, no solo para la operación que el servidor necesita.

La especificación cierra las dos vías inmediatas: no puedes pedir la contraseña del tercero por un formulario, y no puedes reutilizar el token con el que el cliente habla contigo. Lo segundo tiene nombre, token passthrough, y está prohibido porque todo token se emite para un destinatario concreto. La salida que da la revisión es que el servidor termine la llamada con `input_required` en modo URL, el cliente te mande a la plataforma, el OAuth transcurra entre tú y ella, y el servidor guarde su propio token en su lado. Ni el cliente MCP ni el modelo ven nunca la credencial.

Hay un contraejemplo en el propio portafolio: `kubernetes-mcp-server` sí implementó OAuth como es debido, con validación de token, `.well-known` y todo lo demás. Le costó más de mil líneas. Ese es justo el precio que la revisión busca eliminar.

El argumento no es "la especificación trae algo nuevo". Es: tenía tres servidores con el mismo parche feo y no me di cuenta hasta que leí la revisión con el código delante.

### Segundo hallazgo: los tests están al revés

El mismo inventario, mirando solo dos columnas: cuántas herramientas escriben y cuántos tests hay. Los proyectos con más herramientas que escriben y más credenciales en juego son justo los que no tienen ni un solo test. El único que no modifica nada tiene 273.

El caso extremo son 3 475 líneas y tres herramientas que escriben en un sistema de soporte real, sin una sola prueba que compruebe que no lo rompen. Una de ellas abre un ticket de soporte y acepta una prioridad `URGENT (production down)`. Un modelo que se equivoque ahí no devuelve un error: despierta a un ingeniero de guardia. Es exactamente el escenario para el que existe `input_required`, y hoy no lo tiene.

Esto es un hallazgo sobre mi propio código, y decirlo en público vale más que cualquier recomendación abstracta sobre testing. La pregunta que te dejo es la misma que me hice yo: ¿cuál de tus servidores tiene herramientas que escriben, y cuántos tests tiene?

## Qué hacer el lunes

Si mantienes un servidor, la migración va en contra de lo que sugiere la palabra: es sobre todo borrar.

| Borras | Añades |
|---|---|
| El saludo `initialize` | `resultType` en las respuestas |
| El almacén de sesiones | `ttlMs` en los listados |
| El búfer para reenviar mensajes perdidos | `server/discover` |
| Las llamadas a `elicitation/create` | Leer la identidad de `_meta`, no de la sesión |

Los cuatro campos nuevos fallan de forma distinta, y conviene saberlo antes de priorizar. Sin `resultType`, el cliente no distingue una respuesta definitiva de una a medias. Sin `server/discover`, un cliente nuevo te descarta. Si sigues leyendo la identidad de la sesión, rechazas peticiones válidas en cuanto hay más de una réplica. Y sin `ttlMs`, tu catálogo se pide una y otra vez: no rompe nada, y por eso es el que se olvida.

Si mantienes un cliente, empieza por el patrón de reintento. Cuando los servidores adopten la revisión, la petición a mitad de llamada deja de llegar por la conexión abierta: en su lugar la llamada termina con `input_required`. Si tu cliente no sabe reconocer ese resultado, recoger lo que falta y reemitir la misma petición con la respuesta y el `requestState` que venía, se quedará parado creyendo que ya terminó.

El tema de fondo es que esta revisión mueve MCP a los patrones que ya hicieron escalar la web: peticiones sin estado servibles desde cualquier réplica, tiempos de caché en lo que se puede cachear, identidad que publicas en una URL. Cada cambio es MCP intercambiando un mecanismo a medida por uno aburrido. Y aburrido, aquí, quiere decir probado.

## Para profundizar

Tres ideas para llevarse:

1. El modelo nunca habla MCP. Escribe una intención y se detiene; ejecutar lo hace siempre otro proceso.
2. La librería correcta no garantiza conformidad. Pregúntale a tu servidor por el protocolo, o no lo sabrás.
3. Lee la especificación mirando tu propio código. Lo que apareció aquí no fue una función nueva: fue un parche feo repetido tres veces.

Todo esto está desarrollado con más calma en el workshop interactivo que preparé sobre el tema: 21 secciones que arrancan desde cero (qué es una tool call, quién la ejecuta, por qué la descripción de una herramienta es un prompt), pasan por el coste en tokens y la inyección indirecta de prompt, y terminan con un laboratorio de diez minutos en el que le hablas a `mcp-redhat-kb` directamente con `curl`, ves cómo rechaza una petición sin `_meta` y reproduces el `ttlMs` a cero en tu propia máquina.

<!-- TODO: URL del workshop -->

Si encuentras algo que no cuadre, o si migras un servidor con esto y quieres contarlo, escríbeme.
