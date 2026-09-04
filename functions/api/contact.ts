/**
 * API endpoint for contact form
 * POST /api/contact - Submit contact form
 */

import {
  isValidEmail,
  sanitize,
  checkRateLimit,
  jsonResponse,
  errorResponse,
  corsResponse,
  type Env,
} from "../lib/utils";

// POST: Submit contact form
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context;

  try {
    const allowed = await checkRateLimit(env.DB, request, "contact", {
      limit: 5,
      windowSeconds: 300,
    });
    if (!allowed) {
      return errorResponse("Too many requests, please try again later", 429);
    }

    const body = (await request.json()) as {
      name?: string;
      email?: string;
      subject?: string;
      message?: string;
    };

    const { name, email, subject, message } = body;

    if (!name || !email || !message) {
      return errorResponse("name, email, and message are required");
    }

    if (!isValidEmail(email)) {
      return errorResponse("Invalid email format");
    }

    if (name.length > 100) {
      return errorResponse("Name too long (max 100)");
    }

    if (message.length > 5000) {
      return errorResponse("Message too long (max 5000)");
    }

    await env.DB.prepare(
      "INSERT INTO contact_submissions (name, email, subject, message) VALUES (?, ?, ?, ?)",
    )
      .bind(
        sanitize(name),
        email.toLowerCase().trim(),
        subject ? sanitize(subject) : null,
        sanitize(message),
      )
      .run();

    return jsonResponse(
      { success: true, message: "Message sent successfully" },
      { status: 201 },
    );
  } catch {
    return errorResponse("Failed to send message", 500);
  }
};

// OPTIONS: Handle CORS
export const onRequestOptions: PagesFunction = async () => corsResponse();
