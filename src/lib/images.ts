/**
 * Named 2x-of-rendered-size targets for getThumbnailUrl, kept in one place
 * so every card/hero using the same visual size requests the same image.
 */
export const THUMBNAIL_SIZES = {
  /** Small card thumbnail (rendered ~96x64, e.g. post list rows) */
  card: { width: 192, height: 128 },
  /** Sidebar thumbnail (rendered ~320x180, e.g. popular posts) */
  sidebar: { width: 640, height: 360 },
  /** Related-post grid thumbnail (rendered ~400x225) */
  related: { width: 800, height: 450 },
  /** Full-width hero image (rendered up to ~800x450 at max-w-4xl) */
  hero: { width: 1600, height: 900 },
} as const;

/**
 * Rewrite Unsplash source URLs to request the actual rendered size instead
 * of the oversized default the CMS/frontmatter stores (e.g. 1200x630 og-image
 * dimensions shown at 96x64 in a card thumbnail).
 */
export function getThumbnailUrl(
  src: string,
  size: { width: number; height: number },
): string {
  if (!src.includes("images.unsplash.com")) return src;

  const url = new URL(src);
  url.searchParams.set("w", String(size.width));
  url.searchParams.set("h", String(size.height));
  url.searchParams.set("fit", "crop");
  url.searchParams.set("fm", "webp");
  url.searchParams.set("q", "70");
  return url.toString();
}
