/**
 * Cloudflare Pages Function for tracking blog post views
 * Uses D1 database for storage
 */

interface Env {
  DB: D1Database;
}

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

    // Get all views
    const result = await DB.prepare(
      'SELECT slug, views FROM page_views ORDER BY views DESC'
    ).all<{ slug: string; views: number }>();

    // Consolidate views from prefixed slugs into base slugs
    const consolidatedViews = new Map<string, number>();
    const slugsToDelete: string[] = [];

    for (const row of result.results || []) {
      const normalizedSlug = row.slug.replace(/^(en|es)\//, '');
      const currentViews = consolidatedViews.get(normalizedSlug) || 0;
      consolidatedViews.set(normalizedSlug, currentViews + row.views);

      // Mark prefixed slugs for cleanup
      if (row.slug !== normalizedSlug) {
        slugsToDelete.push(row.slug);
      }
    }

    // Clean up prefixed slugs in background (merge into base slug)
    if (slugsToDelete.length > 0) {
      for (const oldSlug of slugsToDelete) {
        const normalizedSlug = oldSlug.replace(/^(en|es)\//, '');
        const totalViews = consolidatedViews.get(normalizedSlug) || 0;

        // Update or insert the normalized slug with total views
        await DB.prepare(
          'INSERT OR REPLACE INTO page_views (slug, views) VALUES (?, ?)'
        ).bind(normalizedSlug, totalViews).run();

        // Delete the prefixed slug
        await DB.prepare(
          'DELETE FROM page_views WHERE slug = ?'
        ).bind(oldSlug).run();
      }
    }

    // Return consolidated results
    const finalResults = Array.from(consolidatedViews.entries())
      .map(([slug, views]) => ({ slug, views }))
      .sort((a, b) => b.views - a.views);

    return new Response(JSON.stringify(finalResults), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://blog1.labjp.xyz',
        'Cache-Control': 'public, max-age=60'
      }
    });
  } catch (error) {
    console.error('Error getting views:', error);
    return new Response(JSON.stringify({ error: 'Failed to get views' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Normalize slug by removing language prefixes
function normalizeSlug(slug: string): string {
  return slug.replace(/^(en|es)\//, '');
}

// POST: Increment view count for a slug
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  try {
    const body = await context.request.json() as { slug?: string };
    const rawSlug = body.slug;

    if (!rawSlug || typeof rawSlug !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid slug' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Normalize slug to remove language prefixes
    const slug = normalizeSlug(rawSlug);

    // Check if entry exists
    const existing = await DB.prepare(
      'SELECT views FROM page_views WHERE slug = ?'
    ).bind(slug).first<{ views: number }>();

    if (existing) {
      // Update existing entry
      await DB.prepare(
        'UPDATE page_views SET views = views + 1 WHERE slug = ?'
      ).bind(slug).run();
    } else {
      // Insert new entry
      await DB.prepare(
        'INSERT INTO page_views (slug, views) VALUES (?, 1)'
      ).bind(slug).run();
    }

    // Get updated count
    const result = await DB.prepare(
      'SELECT views FROM page_views WHERE slug = ?'
    ).bind(slug).first<{ views: number }>();

    return new Response(JSON.stringify({
      success: true,
      slug,
      views: result?.views || 1
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://blog1.labjp.xyz'
      }
    });
  } catch (error) {
    console.error('Error incrementing view:', error);
    return new Response(JSON.stringify({ error: 'Failed to track view' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// OPTIONS: Handle CORS preflight
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': 'https://blog1.labjp.xyz',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
};
