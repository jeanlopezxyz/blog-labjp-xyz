/**
 * Shared utilities for Cloudflare Functions API endpoints
 * Consolidates common functions to avoid duplication
 */

/** Cloudflare environment bindings */
export interface Env {
  DB: D1Database;
}

/** Site domain for CORS */
const SITE_ORIGIN = "https://blog.labjp.xyz";

/**
 * Normalize slug by removing language prefixes (en/, es/)
 */
export function normalizeSlug(slug: string): string {
  return slug.replace(/^(en|es)\//, "");
}

/**
 * Validate that a slug looks like a real post slug (lowercase, digits,
 * hyphens), bounded in length. Rejects arbitrary/oversized input before
 * it reaches D1.
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]{1,120}$/.test(slug);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Trim user input. HTML escaping happens only at render time (client),
 * never at storage time — keeps stored data reusable across output contexts.
 */
export function sanitize(str: string): string {
  return str.trim();
}

/**
 * Server-side rate limiting backed by D1 (see rate_limits table in schema.sql).
 * Returns true if the request is allowed, false if it should be rejected.
 */
export async function checkRateLimit(
  db: D1Database,
  request: Request,
  bucket: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): Promise<boolean> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `${bucket}:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;

  await db
    .prepare("DELETE FROM rate_limits WHERE key = ? AND created_at < ?")
    .bind(key, windowStart)
    .run();

  const result = await db
    .prepare("SELECT COUNT(*) as count FROM rate_limits WHERE key = ?")
    .bind(key)
    .first<{ count: number }>();

  if ((result?.count || 0) >= limit) {
    return false;
  }

  await db
    .prepare("INSERT INTO rate_limits (key, created_at) VALUES (?, ?)")
    .bind(key, now)
    .run();

  return true;
}

/**
 * Standard CORS headers for API responses
 */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

/**
 * Create a JSON response with proper headers
 */
export function jsonResponse(
  data: unknown,
  options: { status?: number; cache?: boolean } = {},
): Response {
  const { status = 200, cache = false } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": SITE_ORIGIN,
  };

  headers["Cache-Control"] = cache ? "public, max-age=60" : "no-store";

  return new Response(JSON.stringify(data), { status, headers });
}

/**
 * Create an error response
 */
export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, { status });
}

/**
 * Create a CORS preflight response
 */
export function corsResponse(): Response {
  return new Response(null, { headers: CORS_HEADERS });
}
