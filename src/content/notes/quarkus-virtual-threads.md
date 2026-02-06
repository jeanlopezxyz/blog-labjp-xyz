---
pubDate: 2026-01-10
source: linkedin
sourceUrl: https://linkedin.com/in/jean-paul-lopez
link:
  url: https://quarkus.io/blog/virtual-threads-2
  title: "Virtual Threads in Quarkus - Part 2"
  domain: quarkus.io
---

Los Virtual Threads de Java 21 cambiaron todo.

Pero la mayoría de developers los usa mal.

El problema no es la tecnología, es la arquitectura. Si tu código bloquea I/O de forma síncrona, los virtual threads solo hacen que falle más rápido.

Este artículo del equipo de Quarkus explica exactamente cómo usarlos correctamente.
