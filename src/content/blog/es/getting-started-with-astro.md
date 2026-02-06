---
title: "Primeros pasos con Astro 5"
description: "Una guia completa para comenzar a construir sitios web modernos con Astro 5, el framework que prioriza el rendimiento."
pubDate: 2024-01-15
tags: ["astro", "javascript", "tutorial"]
categories: ["devops"]
featured: true
lang: es
---

Astro se ha convertido en uno de los frameworks más populares para construir sitios web estáticos y contenido. En esta guía, exploraremos cómo comenzar con Astro 5.

## ¿Por qué Astro?

Astro ofrece varias ventajas sobre otros frameworks:

- **Zero JavaScript por defecto**: Astro envía HTML puro al navegador
- **Islas de componentes**: Hidrata solo lo que necesitas
- **Agnóstico de framework**: Usa React, Vue, Svelte o cualquier otro
- **Excelente DX**: Hot module replacement ultra rápido

## Instalación

Para crear un nuevo proyecto Astro:

```bash
npm create astro@latest my-project
cd my-project
npm run dev
```

## Estructura del proyecto

Un proyecto Astro típico tiene esta estructura:

```
src/
├── components/
├── layouts/
├── pages/
└── styles/
```

## Creando tu primera página

Las páginas en Astro son archivos `.astro` en la carpeta `src/pages`:

```astro
---
// Este es el frontmatter - código que se ejecuta en el servidor
const title = "Mi primera página";
---

<html>
  <head>
    <title>{title}</title>
  </head>
  <body>
    <h1>{title}</h1>
    <p>¡Hola, mundo!</p>
  </body>
</html>
```

## Conclusión

Astro es una excelente opción para blogs, documentación y sitios de marketing. Su enfoque en el rendimiento y la simplicidad lo hace ideal para proyectos modernos.
