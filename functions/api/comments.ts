/**
 * API endpoint for comments system
 * GET /api/comments?slug=xxx - Get comments for a post
 * POST /api/comments - Add a new comment
 */

interface Env {
  DB: D1Database;
}

interface Comment {
  id: number;
  slug: string;
  author: string;
  content: string;
  created_at: string;
}

// Initialize comments table
async function initCommentsTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      approved INTEGER DEFAULT 1
    )
  `).run();
}

// Normalize slug
function normalizeSlug(slug: string): string {
  return slug.replace(/^(en|es)\//, '');
}

// Simple content sanitization
function sanitize(str: string): string {
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .trim();
}

// GET: Get comments for a post
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return new Response(JSON.stringify({ error: 'slug is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await initCommentsTable(env.DB);
    const normalizedSlug = normalizeSlug(slug);

    const result = await env.DB.prepare(
      'SELECT id, slug, author, content, created_at FROM comments WHERE slug = ? AND approved = 1 ORDER BY created_at DESC'
    ).bind(normalizedSlug).all<Comment>();

    return new Response(JSON.stringify(result.results || []), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://blog.labjp.xyz',
        'Cache-Control': 'public, max-age=60'
      }
    });
  } catch (error) {
    console.error('Error getting comments:', error);
    return new Response(JSON.stringify({ error: 'Failed to get comments' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// POST: Add a new comment
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context;

  try {
    await initCommentsTable(env.DB);

    const body = await request.json() as { slug?: string; author?: string; content?: string };
    const { slug, author, content } = body;

    if (!slug || !author || !content) {
      return new Response(JSON.stringify({ error: 'slug, author, and content are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate lengths
    if (author.length > 100) {
      return new Response(JSON.stringify({ error: 'Author name too long (max 100)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (content.length > 2000) {
      return new Response(JSON.stringify({ error: 'Comment too long (max 2000)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedSlug = normalizeSlug(slug);
    const sanitizedAuthor = sanitize(author);
    const sanitizedContent = sanitize(content);

    await env.DB.prepare(
      'INSERT INTO comments (slug, author, content) VALUES (?, ?, ?)'
    ).bind(normalizedSlug, sanitizedAuthor, sanitizedContent).run();

    // Get the inserted comment
    const result = await env.DB.prepare(
      'SELECT id, slug, author, content, created_at FROM comments WHERE slug = ? ORDER BY id DESC LIMIT 1'
    ).bind(normalizedSlug).first<Comment>();

    return new Response(JSON.stringify({
      success: true,
      comment: result
    }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://blog.labjp.xyz'
      }
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    return new Response(JSON.stringify({ error: 'Failed to add comment' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// OPTIONS: Handle CORS
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': 'https://blog.labjp.xyz',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
};
