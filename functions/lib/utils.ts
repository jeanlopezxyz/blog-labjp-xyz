/**
 * Shared utilities for Cloudflare Functions API endpoints
 * Consolidates common functions to avoid duplication
 */

/** Cloudflare environment bindings */
export interface Env {
  DB: D1Database;
}

/** Site domain for CORS */
const SITE_ORIGIN = 'https://blog.labjp.xyz';

/**
 * Normalize slug by removing language prefixes (en/, es/)
 */
export function normalizeSlug(slug: string): string {
  return slug.replace(/^(en|es)\//, '');
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitize(str: string): string {
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .trim();
}

/**
 * Standard CORS headers for API responses
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': SITE_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const;

/**
 * Create a JSON response with proper headers
 */
export function jsonResponse(
  data: unknown,
  options: { status?: number; cache?: boolean } = {}
): Response {
  const { status = 200, cache = false } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': SITE_ORIGIN,
  };

  if (cache) {
    headers['Cache-Control'] = 'public, max-age=60';
  }

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
