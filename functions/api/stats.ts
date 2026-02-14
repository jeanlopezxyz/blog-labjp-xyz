/**
 * API endpoint for post stats (likes + comments count)
 * GET /api/stats?slugs=slug1,slug2,slug3 - Get stats for multiple posts
 * GET /api/stats?slug=xxx - Get stats for single post
 */

import { normalizeSlug, jsonResponse, errorResponse, corsResponse, type Env } from '../lib/utils';

interface PostStats {
  slug: string;
  likes: number;
  comments: number;
}

// Initialize tables if they don't exist
async function initTables(db: D1Database) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS post_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL,
        visitor_id TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(slug, visitor_id)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        approved INTEGER DEFAULT 1
      )
    `)
  ]);
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  const singleSlug = url.searchParams.get('slug');
  const multipleSlugs = url.searchParams.get('slugs');

  let slugs: string[] = [];

  if (singleSlug) {
    slugs = [normalizeSlug(singleSlug)];
  } else if (multipleSlugs) {
    slugs = multipleSlugs.split(',').map(s => normalizeSlug(s.trim()));
  }

  if (slugs.length === 0) {
    return errorResponse('slug or slugs parameter is required');
  }

  try {
    await initTables(env.DB);

    const placeholders = slugs.map(() => '?').join(',');

    const likesResult = await env.DB.prepare(`
      SELECT slug, COUNT(*) as count
      FROM post_likes
      WHERE slug IN (${placeholders})
      GROUP BY slug
    `).bind(...slugs).all<{ slug: string; count: number }>();

    const commentsResult = await env.DB.prepare(`
      SELECT slug, COUNT(*) as count
      FROM comments
      WHERE slug IN (${placeholders}) AND approved = 1
      GROUP BY slug
    `).bind(...slugs).all<{ slug: string; count: number }>();

    const likesMap = new Map(likesResult.results?.map(r => [r.slug, r.count]) || []);
    const commentsMap = new Map(commentsResult.results?.map(r => [r.slug, r.count]) || []);

    const stats: Record<string, PostStats> = {};
    for (const slug of slugs) {
      stats[slug] = {
        slug,
        likes: likesMap.get(slug) || 0,
        comments: commentsMap.get(slug) || 0
      };
    }

    return jsonResponse(stats, { cache: true });
  } catch {
    return errorResponse('Failed to get stats', 500);
  }
};

export const onRequestOptions: PagesFunction = async () => corsResponse();
