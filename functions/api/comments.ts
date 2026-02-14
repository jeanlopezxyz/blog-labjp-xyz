/**
 * API endpoint for comments system
 * GET /api/comments?slug=xxx - Get comments for a post
 * POST /api/comments - Add a new comment
 */

import { normalizeSlug, sanitize, jsonResponse, errorResponse, corsResponse, type Env } from '../lib/utils';

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

// GET: Get comments for a post
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return errorResponse('slug is required');
  }

  try {
    await initCommentsTable(env.DB);
    const normalizedSlug = normalizeSlug(slug);

    const result = await env.DB.prepare(
      'SELECT id, slug, author, content, created_at FROM comments WHERE slug = ? AND approved = 1 ORDER BY created_at DESC'
    ).bind(normalizedSlug).all<Comment>();

    return jsonResponse(result.results || [], { cache: true });
  } catch {
    return errorResponse('Failed to get comments', 500);
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
      return errorResponse('slug, author, and content are required');
    }

    if (author.length > 100) {
      return errorResponse('Author name too long (max 100)');
    }

    if (content.length > 2000) {
      return errorResponse('Comment too long (max 2000)');
    }

    const normalizedSlug = normalizeSlug(slug);
    const sanitizedAuthor = sanitize(author);
    const sanitizedContent = sanitize(content);

    await env.DB.prepare(
      'INSERT INTO comments (slug, author, content) VALUES (?, ?, ?)'
    ).bind(normalizedSlug, sanitizedAuthor, sanitizedContent).run();

    const result = await env.DB.prepare(
      'SELECT id, slug, author, content, created_at FROM comments WHERE slug = ? ORDER BY id DESC LIMIT 1'
    ).bind(normalizedSlug).first<Comment>();

    return jsonResponse({ success: true, comment: result }, { status: 201 });
  } catch {
    return errorResponse('Failed to add comment', 500);
  }
};

// OPTIONS: Handle CORS
export const onRequestOptions: PagesFunction = async () => corsResponse();
