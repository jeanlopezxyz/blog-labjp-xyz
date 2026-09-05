#!/usr/bin/env node
/**
 * Comprueba que los enlaces internos del sitio construido apunten a algo que
 * existe.
 *
 * Esto no lo cubre ninguna otra validación: el esquema de contenido revisa el
 * frontmatter y `astro build` compila sin quejarse aunque una plantilla genere
 * una URL inexistente. El caso que motivó el script fue el selector de idioma,
 * que traducía el prefijo a ciegas y mandaba a 404 en trece páginas —las
 * etiquetas están traducidas (`/es/…/ia` frente a `/en/…/ai`), `/projects` solo
 * existe en español y un artículo puede no tener aún su versión.
 *
 * Uso: node scripts/check-dist-links.mjs [dist]
 */
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(process.argv[2] ?? "dist");

if (!fs.existsSync(raiz)) {
  console.error(`No existe ${raiz}. ¿Falta ejecutar el build?`);
  process.exit(1);
}

const paginas = [];
(function recorrer(dir) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta);
    else if (ruta.endsWith(".html")) paginas.push(ruta);
  }
})(raiz);

// Externos, anclas y protocolos que no son navegación interna.
const EXTERNO = /^(https?:|\/\/|mailto:|tel:|#|data:|javascript:)/;

const resuelve = (url) => {
  const limpia = decodeURIComponent(url.split(/[#?]/)[0]);
  const destino = path.join(raiz, limpia);
  return (
    fs.existsSync(destino) ||
    fs.existsSync(path.join(destino, "index.html")) ||
    fs.existsSync(`${destino}.html`)
  );
};

const rotos = new Map();
for (const pagina of paginas) {
  const html = fs.readFileSync(pagina, "utf8");
  for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (EXTERNO.test(url) || !url.startsWith("/")) continue;
    if (resuelve(url)) continue;
    const origen = path.relative(raiz, pagina);
    rotos.set(url, [...(rotos.get(url) ?? []), origen]);
  }
}

for (const [url, origenes] of rotos) {
  const muestra = origenes.slice(0, 3).join(", ");
  const resto = origenes.length > 3 ? ` y ${origenes.length - 3} más` : "";
  console.log(`::error::Enlace interno roto: ${url} (desde ${muestra}${resto})`);
}

console.log(
  `${paginas.length} páginas revisadas · ${rotos.size} enlaces internos rotos`,
);
process.exit(rotos.size > 0 ? 1 : 0);
