/**
 * Cloudflare Pages Function for tracking blog post views
 * Uses D1 database for storage
 */

import {
  normalizeSlug,
  isValidSlug,
  checkRateLimit,
  jsonResponse,
  errorResponse,
  corsResponse,
  type Env,
} from "../lib/utils";

// GET: Return all views, consolidating legacy language-prefixed slugs in memory (read-only)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  try {
    const result = await DB.prepare(
      "SELECT slug, views FROM page_views ORDER BY views DESC LIMIT 100",
    ).all<{ slug: string; views: number }>();

    const consolidatedViews = new Map<string, number>();
    for (const row of result.results || []) {
      const normalized = normalizeSlug(row.slug);
      consolidatedViews.set(
        normalized,
        (consolidatedViews.get(normalized) || 0) + row.views,
      );
    }

    const finalResults = Array.from(consolidatedViews.entries())
      .map(([slug, views]) => ({ slug, views }))
      .sort((a, b) => b.views - a.views);

    return jsonResponse(finalResults, { cache: true });
  } catch {
    return errorResponse("Failed to get views", 500);
  }
};

// POST: Increment view count for a slug
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  try {
    const allowed = await checkRateLimit(DB, context.request, "views", {
      limit: 60,
      windowSeconds: 60,
    });
    if (!allowed) {
      return errorResponse("Too many requests, please try again later", 429);
    }

    const body = (await context.request.json()) as { slug?: string };
    const rawSlug = body.slug;

    if (!rawSlug || typeof rawSlug !== "string") {
      return errorResponse("Invalid slug");
    }

    const slug = normalizeSlug(rawSlug);

    if (!isValidSlug(slug)) {
      return errorResponse("Invalid slug format");
    }

    const existing = await DB.prepare(
      "SELECT views FROM page_views WHERE slug = ?",
    )
      .bind(slug)
      .first<{ views: number }>();

    if (existing) {
      await DB.prepare("UPDATE page_views SET views = views + 1 WHERE slug = ?")
        .bind(slug)
        .run();
    } else {
      await DB.prepare("INSERT INTO page_views (slug, views) VALUES (?, 1)")
        .bind(slug)
        .run();
    }

    const result = await DB.prepare(
      "SELECT views FROM page_views WHERE slug = ?",
    )
      .bind(slug)
      .first<{ views: number }>();

    return jsonResponse({ success: true, slug, views: result?.views || 1 });
  } catch {
    return errorResponse("Failed to track view", 500);
  }
};

// OPTIONS: Handle CORS preflight
export const onRequestOptions: PagesFunction = async () => corsResponse();
