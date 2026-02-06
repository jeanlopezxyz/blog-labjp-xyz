/**
 * API endpoint for likes system
 * POST /api/likes - Add/remove like for a slug
 * GET /api/likes?slug=xxx - Get likes for specific slug
 */

interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const { slug, visitorId } = await request.json() as { slug: string; visitorId: string };

    if (!slug || !visitorId) {
      return new Response(JSON.stringify({ error: 'slug and visitorId are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if already liked
    const existing = await env.DB.prepare(
      'SELECT id FROM post_likes WHERE slug = ? AND visitor_id = ?'
    ).bind(slug, visitorId).first();

    if (existing) {
      // Remove like
      await env.DB.prepare(
        'DELETE FROM post_likes WHERE slug = ? AND visitor_id = ?'
      ).bind(slug, visitorId).run();
    } else {
      // Add like
      await env.DB.prepare(
        'INSERT INTO post_likes (slug, visitor_id) VALUES (?, ?)'
      ).bind(slug, visitorId).run();
    }

    // Get updated count
    const result = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM post_likes WHERE slug = ?'
    ).bind(slug).first<{ count: number }>();

    return new Response(JSON.stringify({
      slug,
      likes: result?.count || 0,
      liked: !existing
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://blog1.labjp.xyz'
      }
    });
  } catch (error) {
    console.error('Error handling like:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  const visitorId = url.searchParams.get('visitorId');

  try {
    if (!slug) {
      return new Response(JSON.stringify({ error: 'slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get like count
    const result = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM post_likes WHERE slug = ?'
    ).bind(slug).first<{ count: number }>();

    // Check if visitor liked
    let liked = false;
    if (visitorId) {
      const existing = await env.DB.prepare(
        'SELECT id FROM post_likes WHERE slug = ? AND visitor_id = ?'
      ).bind(slug, visitorId).first();
      liked = !!existing;
    }

    return new Response(JSON.stringify({
      slug,
      likes: result?.count || 0,
      liked
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://blog1.labjp.xyz'
      }
    });
  } catch (error) {
    console.error('Error getting likes:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': 'https://blog1.labjp.xyz',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
};
