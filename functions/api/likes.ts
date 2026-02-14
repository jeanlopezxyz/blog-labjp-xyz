/**
 * API endpoint for likes system
 * POST /api/likes - Add/remove like for a slug
 * GET /api/likes?slug=xxx - Get likes for specific slug
 */

import { normalizeSlug, jsonResponse, errorResponse, corsResponse, type Env } from '../lib/utils';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const { slug: rawSlug, visitorId } = await request.json() as { slug: string; visitorId: string };

    if (!rawSlug || !visitorId) {
      return errorResponse('slug and visitorId are required');
    }

    // Validate input lengths
    if (rawSlug.length > 200 || visitorId.length > 100) {
      return errorResponse('Invalid input length');
    }

    const slug = normalizeSlug(rawSlug);

    const existing = await env.DB.prepare(
      'SELECT id FROM post_likes WHERE slug = ? AND visitor_id = ?'
    ).bind(slug, visitorId).first();

    if (existing) {
      await env.DB.prepare(
        'DELETE FROM post_likes WHERE slug = ? AND visitor_id = ?'
      ).bind(slug, visitorId).run();
    } else {
      await env.DB.prepare(
        'INSERT INTO post_likes (slug, visitor_id) VALUES (?, ?)'
      ).bind(slug, visitorId).run();
    }

    const result = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM post_likes WHERE slug = ?'
    ).bind(slug).first<{ count: number }>();

    return jsonResponse({
      slug,
      likes: result?.count || 0,
      liked: !existing
    });
  } catch {
    return errorResponse('Internal server error', 500);
  }
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const rawSlug = url.searchParams.get('slug');
  const visitorId = url.searchParams.get('visitorId');

  try {
    if (!rawSlug) {
      return errorResponse('slug is required');
    }

    const slug = normalizeSlug(rawSlug);

    const result = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM post_likes WHERE slug = ?'
    ).bind(slug).first<{ count: number }>();

    let liked = false;
    if (visitorId) {
      const existing = await env.DB.prepare(
        'SELECT id FROM post_likes WHERE slug = ? AND visitor_id = ?'
      ).bind(slug, visitorId).first();
      liked = !!existing;
    }

    return jsonResponse({ slug, likes: result?.count || 0, liked });
  } catch {
    return errorResponse('Internal server error', 500);
  }
};

export const onRequestOptions: PagesFunction = async () => corsResponse();
