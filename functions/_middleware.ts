/**
 * Cloudflare Pages Middleware
 * Handles geolocation-based language redirect and security headers
 */

import type { Env } from "./lib/utils";

// Content Security Policy - strict but allows necessary resources
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https: blob:",
  "connect-src 'self' https://blog.labjp.xyz https://api.github.com https://cloudflareinsights.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

// Comprehensive security headers
const SECURITY_HEADERS = {
  // Prevent clickjacking
  "X-Frame-Options": "SAMEORIGIN",
  // Prevent MIME type sniffing
  "X-Content-Type-Options": "nosniff",
  // Control referrer information
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // HTTP Strict Transport Security (2 years + subdomains + preload)
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  // Content Security Policy
  "Content-Security-Policy": CSP_DIRECTIVES,
  // Restrict browser features
  "Permissions-Policy":
    "accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), cross-origin-isolated=(), display-capture=(), document-domain=(), encrypted-media=(), execution-while-not-rendered=(), execution-while-out-of-viewport=(), fullscreen=(self), geolocation=(), gyroscope=(), keyboard-map=(), magnetometer=(), microphone=(), midi=(), navigation-override=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), usb=(), web-share=(self), xr-spatial-tracking=()",
  // Cross-Origin policies
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  // Prevent DNS prefetch leaks
  "X-DNS-Prefetch-Control": "off",
  // Download options
  "X-Download-Options": "noopen",
  // Permitted cross-domain policies
  "X-Permitted-Cross-Domain-Policies": "none",
};

// Spanish-speaking countries (ISO 3166-1 alpha-2)
const SPANISH_COUNTRIES = new Set([
  "ES", // Spain
  "MX", // Mexico
  "AR", // Argentina
  "CO", // Colombia
  "PE", // Peru
  "VE", // Venezuela
  "CL", // Chile
  "EC", // Ecuador
  "GT", // Guatemala
  "CU", // Cuba
  "BO", // Bolivia
  "DO", // Dominican Republic
  "HN", // Honduras
  "PY", // Paraguay
  "SV", // El Salvador
  "NI", // Nicaragua
  "CR", // Costa Rica
  "PA", // Panama
  "UY", // Uruguay
  "PR", // Puerto Rico
  "GQ", // Equatorial Guinea
]);

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, next } = context;
  const url = new URL(request.url);

  // Helper to add security headers to response
  const addSecurityHeaders = (response: Response): Response => {
    const newResponse = new Response(response.body, response);
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      newResponse.headers.set(key, value);
    });
    return newResponse;
  };

  // API routes: skip language redirect (they have their own CORS handling)
  // but still layer on the shared security headers (nosniff, HSTS, etc.).
  if (url.pathname.startsWith("/api/")) {
    const response = await next();
    return addSecurityHeaders(response);
  }

  // Already localized paths - just add security headers
  if (
    url.pathname.startsWith("/es/") ||
    url.pathname.startsWith("/en/") ||
    url.pathname.startsWith("/_") ||
    url.pathname.includes(".") // Static assets
  ) {
    const response = await next();
    return addSecurityHeaders(response);
  }

  // Get country from Cloudflare headers
  const country = request.headers.get("CF-IPCountry") || "XX";

  // Determine language based on country
  const isSpanishCountry = SPANISH_COUNTRIES.has(country);
  const targetLang = isSpanishCountry ? "es" : "en";

  // Check if visiting root or non-localized paths that need redirect
  const needsRedirect =
    url.pathname === "/" ||
    url.pathname === "/blog" ||
    url.pathname === "/about" ||
    url.pathname.startsWith("/category/");

  if (needsRedirect) {
    const localizedUrl = `/${targetLang}${url.pathname === "/" ? "/" : url.pathname}${url.search}`;

    // Search engine crawlers must see a permanent redirect so link equity
    // consolidates on the localized URL, not a geo-personalized 302.
    const userAgent = request.headers.get("User-Agent") || "";
    const isCrawler =
      /bot|crawl|spider|slurp|googlebot|bingbot|duckduckbot|baiduspider|yandexbot/i.test(
        userAgent,
      );

    return new Response(null, {
      status: isCrawler ? 301 : 302,
      headers: {
        Location: localizedUrl,
        ...SECURITY_HEADERS,
      },
    });
  }

  const response = await next();
  return addSecurityHeaders(response);
};
