/**
 * API endpoint for newsletter subscriptions
 * POST /api/newsletter - Subscribe email
 * DELETE /api/newsletter - Unsubscribe email (requires the subscriber's unsubscribe token)
 */

import {
  isValidEmail,
  checkRateLimit,
  jsonResponse,
  errorResponse,
  corsResponse,
  type Env,
} from "../lib/utils";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const allowed = await checkRateLimit(env.DB, request, "newsletter", {
      limit: 5,
      windowSeconds: 300,
    });
    if (!allowed) {
      return errorResponse("Too many requests, please try again later", 429);
    }

    const { email } = (await request.json()) as { email: string };

    if (!email || !isValidEmail(email)) {
      return errorResponse("Valid email is required");
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await env.DB.prepare(
      "SELECT id, unsubscribed_at FROM newsletter_subscribers WHERE email = ?",
    )
      .bind(normalizedEmail)
      .first<{ id: number; unsubscribed_at: string | null }>();

    if (existing) {
      if (existing.unsubscribed_at) {
        await env.DB.prepare(
          "UPDATE newsletter_subscribers SET unsubscribed_at = NULL, subscribed_at = CURRENT_TIMESTAMP WHERE email = ?",
        )
          .bind(normalizedEmail)
          .run();
      }
      return jsonResponse({
        success: true,
        message: "Subscribed successfully",
      });
    }

    const unsubscribeToken = crypto.randomUUID();

    await env.DB.prepare(
      "INSERT INTO newsletter_subscribers (email, unsubscribe_token) VALUES (?, ?)",
    )
      .bind(normalizedEmail, unsubscribeToken)
      .run();

    return jsonResponse(
      { success: true, message: "Subscribed successfully" },
      { status: 201 },
    );
  } catch {
    return errorResponse("Internal server error", 500);
  }
};

// DELETE: Unsubscribe using the subscriber's own token (prevents unsubscribing someone else by guessing their email)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const allowed = await checkRateLimit(env.DB, request, "newsletter-unsub", {
      limit: 10,
      windowSeconds: 300,
    });
    if (!allowed) {
      return errorResponse("Too many requests, please try again later", 429);
    }

    const { email, token } = (await request.json()) as {
      email?: string;
      token?: string;
    };

    if (!email || !token) {
      return errorResponse("email and token are required");
    }

    const normalizedEmail = email.toLowerCase().trim();

    const result = await env.DB.prepare(
      "UPDATE newsletter_subscribers SET unsubscribed_at = CURRENT_TIMESTAMP WHERE email = ? AND unsubscribe_token = ?",
    )
      .bind(normalizedEmail, token)
      .run();

    if (result.meta.changes === 0) {
      return errorResponse("Invalid email or token", 404);
    }

    return jsonResponse({
      success: true,
      message: "Unsubscribed successfully",
    });
  } catch {
    return errorResponse("Internal server error", 500);
  }
};

export const onRequestOptions: PagesFunction = async () => corsResponse();
