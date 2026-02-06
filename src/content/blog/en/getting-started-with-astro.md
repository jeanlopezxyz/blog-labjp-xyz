---
title: "Getting Started with Astro 5"
description: "A complete guide to start building modern websites with Astro 5, the performance-first framework."
pubDate: 2024-01-15
tags: ["astro", "javascript", "tutorial"]
categories: ["devops"]
featured: true
lang: en
---

Astro has become one of the most popular frameworks for building static websites and content. In this guide, we'll explore how to get started with Astro 5.

## Why Astro?

Astro offers several advantages over other frameworks:

- **Zero JavaScript by default**: Astro sends pure HTML to the browser
- **Component Islands**: Hydrate only what you need
- **Framework agnostic**: Use React, Vue, Svelte or any other
- **Excellent DX**: Ultra-fast hot module replacement

## Installation

To create a new Astro project:

```bash
npm create astro@latest my-project
cd my-project
npm run dev
```

## Project Structure

A typical Astro project has this structure:

```
src/
├── components/
├── layouts/
├── pages/
└── styles/
```

## Creating Your First Page

Pages in Astro are `.astro` files in the `src/pages` folder:

```astro
---
// This is the frontmatter - code that runs on the server
const title = "My first page";
---

<html>
  <head>
    <title>{title}</title>
  </head>
  <body>
    <h1>{title}</h1>
    <p>Hello, world!</p>
  </body>
</html>
```

## Conclusion

Astro is an excellent choice for blogs, documentation, and marketing sites. Its focus on performance and simplicity makes it ideal for modern projects.
