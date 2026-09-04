/**
 * API endpoint for newsletter subscriptions
 * POST /api/newsletter - Subscribe email
 * DELETE /api/newsletter - Unsubscribe email
 */

import { isValidEmail, jsonResponse, errorResponse, corsResponse, type Env } from '../lib/utils';

async function initDatabase(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      subscribed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      unsubscribed_at TEXT
    )
  `).run();
  await db.prepare(
    'CREATE INDEX IF NOT EXISTS idx_subscribers_email ON newsletter_subscribers(email)'
  ).run();
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    await initDatabase(env.DB);
    const { email } = await request.json() as { email: string };

    if (!email || !isValidEmail(email)) {
      return errorResponse('Valid email is required');
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await env.DB.prepare(
      'SELECT id, unsubscribed_at FROM newsletter_subscribers WHERE email = ?'
    ).bind(normalizedEmail).first<{ id: number; unsubscribed_at: string | null }>();

    if (existing) {
      if (existing.unsubscribed_at) {
        await env.DB.prepare(
          'UPDATE newsletter_subscribers SET unsubscribed_at = NULL, subscribed_at = CURRENT_TIMESTAMP WHERE email = ?'
        ).bind(normalizedEmail).run();
      }
      return jsonResponse({ success: true, message: 'Subscribed successfully' });
    }

    await env.DB.prepare(
      'INSERT INTO newsletter_subscribers (email) VALUES (?)'
    ).bind(normalizedEmail).run();

    return jsonResponse({ success: true, message: 'Subscribed successfully' }, { status: 201 });
  } catch {
    return errorResponse('Internal server error', 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    await initDatabase(env.DB);
    const { email } = await request.json() as { email: string };

    if (!email) {
      return errorResponse('Email is required');
    }

    const normalizedEmail = email.toLowerCase().trim();

    await env.DB.prepare(
      'UPDATE newsletter_subscribers SET unsubscribed_at = CURRENT_TIMESTAMP WHERE email = ?'
    ).bind(normalizedEmail).run();

    return jsonResponse({ success: true, message: 'Unsubscribed successfully' });
  } catch {
    return errorResponse('Internal server error', 500);
  }
};

export const onRequestOptions: PagesFunction = async () => corsResponse();
