/**
 * Cloudflare Pages Function for tracking blog post views
 * Uses D1 database for storage
 */

import { normalizeSlug, jsonResponse, errorResponse, corsResponse, type Env } from '../lib/utils';

// Initialize database table if it doesn't exist
async function initDatabase(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS page_views (
      slug TEXT PRIMARY KEY,
      views INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

// GET: Return all views (with automatic cleanup of prefixed slugs)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  try {
    await initDatabase(DB);

    const result = await DB.prepare(
      'SELECT slug, views FROM page_views ORDER BY views DESC'
    ).all<{ slug: string; views: number }>();

    // Consolidate views from prefixed slugs into base slugs
    const consolidatedViews = new Map<string, number>();
    const slugsToDelete: string[] = [];

    for (const row of result.results || []) {
      const normalized = normalizeSlug(row.slug);
      const currentViews = consolidatedViews.get(normalized) || 0;
      consolidatedViews.set(normalized, currentViews + row.views);

      if (row.slug !== normalized) {
        slugsToDelete.push(row.slug);
      }
    }

    // Clean up prefixed slugs in background
    if (slugsToDelete.length > 0) {
      for (const oldSlug of slugsToDelete) {
        const normalized = normalizeSlug(oldSlug);
        const totalViews = consolidatedViews.get(normalized) || 0;

        await DB.prepare(
          'INSERT OR REPLACE INTO page_views (slug, views) VALUES (?, ?)'
        ).bind(normalized, totalViews).run();

        await DB.prepare(
          'DELETE FROM page_views WHERE slug = ?'
        ).bind(oldSlug).run();
      }
    }

    const finalResults = Array.from(consolidatedViews.entries())
      .map(([slug, views]) => ({ slug, views }))
      .sort((a, b) => b.views - a.views);

    return jsonResponse(finalResults, { cache: true });
  } catch {
    return errorResponse('Failed to get views', 500);
  }
};

// POST: Increment view count for a slug
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  try {
    const body = await context.request.json() as { slug?: string };
    const rawSlug = body.slug;

    if (!rawSlug || typeof rawSlug !== 'string') {
      return errorResponse('Invalid slug');
    }

    const slug = normalizeSlug(rawSlug);

    const existing = await DB.prepare(
      'SELECT views FROM page_views WHERE slug = ?'
    ).bind(slug).first<{ views: number }>();

    if (existing) {
      await DB.prepare(
        'UPDATE page_views SET views = views + 1 WHERE slug = ?'
      ).bind(slug).run();
    } else {
      await DB.prepare(
        'INSERT INTO page_views (slug, views) VALUES (?, 1)'
      ).bind(slug).run();
    }

    const result = await DB.prepare(
      'SELECT views FROM page_views WHERE slug = ?'
    ).bind(slug).first<{ views: number }>();

    return jsonResponse({ success: true, slug, views: result?.views || 1 });
  } catch {
    return errorResponse('Failed to track view', 500);
  }
};

// OPTIONS: Handle CORS preflight
export const onRequestOptions: PagesFunction = async () => corsResponse();
