/**
 * API endpoint for newsletter subscriptions
 * POST /api/newsletter - Subscribe email
 * DELETE /api/newsletter - Unsubscribe email
 */

interface Env {
  DB: D1Database;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const { email } = await request.json() as { email: string };

    if (!email || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'Valid email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if already subscribed
    const existing = await env.DB.prepare(
      'SELECT id, unsubscribed_at FROM newsletter_subscribers WHERE email = ?'
    ).bind(normalizedEmail).first<{ id: number; unsubscribed_at: string | null }>();

    if (existing) {
      if (existing.unsubscribed_at) {
        // Resubscribe
        await env.DB.prepare(
          'UPDATE newsletter_subscribers SET unsubscribed_at = NULL, subscribed_at = CURRENT_TIMESTAMP WHERE email = ?'
        ).bind(normalizedEmail).run();
      }
      // Already subscribed, just return success
      return new Response(JSON.stringify({
        success: true,
        message: 'Subscribed successfully'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'https://blog.labjp.xyz'
        }
      });
    }

    // New subscriber
    await env.DB.prepare(
      'INSERT INTO newsletter_subscribers (email) VALUES (?)'
    ).bind(normalizedEmail).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Subscribed successfully'
    }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://blog.labjp.xyz'
      }
    });
  } catch (error) {
    console.error('Error subscribing:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const { email } = await request.json() as { email: string };

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    await env.DB.prepare(
      'UPDATE newsletter_subscribers SET unsubscribed_at = CURRENT_TIMESTAMP WHERE email = ?'
    ).bind(normalizedEmail).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Unsubscribed successfully'
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://blog.labjp.xyz'
      }
    });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': 'https://blog.labjp.xyz',
      'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
};
