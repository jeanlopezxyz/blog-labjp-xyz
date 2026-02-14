/**
 * API endpoint for contact form
 * POST /api/contact - Submit contact form
 */

import { isValidEmail, sanitize, jsonResponse, errorResponse, corsResponse, type Env } from '../lib/utils';

// Initialize contact table
async function initContactTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS contact_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      read INTEGER DEFAULT 0
    )
  `).run();
}

// POST: Submit contact form
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context;

  try {
    await initContactTable(env.DB);

    const body = await request.json() as {
      name?: string;
      email?: string;
      subject?: string;
      message?: string;
    };

    const { name, email, subject, message } = body;

    if (!name || !email || !message) {
      return errorResponse('name, email, and message are required');
    }

    if (!isValidEmail(email)) {
      return errorResponse('Invalid email format');
    }

    if (name.length > 100) {
      return errorResponse('Name too long (max 100)');
    }

    if (message.length > 5000) {
      return errorResponse('Message too long (max 5000)');
    }

    await env.DB.prepare(
      'INSERT INTO contact_submissions (name, email, subject, message) VALUES (?, ?, ?, ?)'
    ).bind(
      sanitize(name),
      email.toLowerCase().trim(),
      subject ? sanitize(subject) : null,
      sanitize(message)
    ).run();

    return jsonResponse({ success: true, message: 'Message sent successfully' }, { status: 201 });
  } catch {
    return errorResponse('Failed to send message', 500);
  }
};

// OPTIONS: Handle CORS
export const onRequestOptions: PagesFunction = async () => corsResponse();
