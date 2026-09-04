# Plantilla de artículo

Los artículos se escriben en Markdown (`.md`) dentro de `src/content/blog/es/` o `src/content/blog/en/`.

```md
---
title: "Título claro y específico"
description: "Resumen de una o dos frases para SEO y listados."
pubDate: 2026-09-04
updatedDate: 2026-09-05
image: "https://example.com/imagen.jpg"
categories: ["kubernetes", "ia"]
tags: ["mcp", "agentes", "openshift"]
featured: false
draft: false
lang: "es"
---

## Introducción

Contenido técnico en Markdown.
```

`updatedDate` es opcional: úsalo solo cuando cambies el contenido publicado. La página mostrará la fecha de actualización y la incluirá en los datos estructurados para buscadores.
