/**
 * API endpoint for contact form
 * POST /api/contact - Submit contact form
 * GET /api/contact - Get contact submissions (admin)
 */

interface Env {
  DB: D1Database;
}

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

// Simple validation
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitize(str: string): string {
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .trim();
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

    // Validation
    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: 'name, email, and message are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (name.length > 100) {
      return new Response(JSON.stringify({ error: 'Name too long (max 100)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (message.length > 5000) {
      return new Response(JSON.stringify({ error: 'Message too long (max 5000)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Sanitize and insert
    await env.DB.prepare(
      'INSERT INTO contact_submissions (name, email, subject, message) VALUES (?, ?, ?, ?)'
    ).bind(
      sanitize(name),
      email.toLowerCase().trim(),
      subject ? sanitize(subject) : null,
      sanitize(message)
    ).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Message sent successfully'
    }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://blog1.labjp.xyz'
      }
    });
  } catch (error) {
    console.error('Error submitting contact form:', error);
    return new Response(JSON.stringify({ error: 'Failed to send message' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// OPTIONS: Handle CORS
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': 'https://blog1.labjp.xyz',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
};
