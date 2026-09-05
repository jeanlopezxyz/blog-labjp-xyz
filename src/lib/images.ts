/**
 * Rewrite Unsplash source URLs to request the actual rendered size instead
 * of the oversized default the CMS/frontmatter stores (e.g. 1200x630 og-image
 * dimensions shown at 96x64 in a card thumbnail).
 */
export function getThumbnailUrl(
  src: string,
  width: number,
  height: number,
): string {
  if (!src.includes("images.unsplash.com")) return src;

  const url = new URL(src);
  url.searchParams.set("w", String(width));
  url.searchParams.set("h", String(height));
  url.searchParams.set("fit", "crop");
  url.searchParams.set("fm", "webp");
  url.searchParams.set("q", "70");
  return url.toString();
}
