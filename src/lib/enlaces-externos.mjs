/**
 * Abre en una pestaña nueva los enlaces que salen del sitio.
 *
 * Los internos (rutas relativas, anclas, `mailto:`) se dejan intactos: dentro
 * del sitio, abrir pestañas nuevas rompe el botón de volver.
 *
 * El `rel` no es cosmético. Sin `noopener`, la página destino recibe una
 * referencia a `window.opener` y puede redirigir la pestaña de origen a donde
 * quiera (tabnabbing).
 *
 * Plugin de hast en el formato de Sätteri, el procesador de Markdown que trae
 * Astro 7: se declara el filtro de etiquetas y se recibe cada nodo ya filtrado.
 */
const esExterno = (href) => typeof href === 'string' && /^https?:\/\//i.test(href);

export function enlacesExternos() {
  return {
    name: 'enlaces-externos',
    element: {
      filter: ['a'],
      visit(node, ctx) {
        if (!esExterno(node.properties?.href)) return;
        ctx.setProperty(node, 'target', '_blank');
        ctx.setProperty(node, 'rel', 'noopener noreferrer');
      },
    },
  };
}
