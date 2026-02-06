/**
 * Cloudflare Pages Middleware
 * Handles geolocation-based language redirect and security headers
 */

interface Env {
  DB: D1Database;
}

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://blog.labjp.xyz',
  'https://labjp.xyz',
];

// Content Security Policy - strict but allows necessary resources
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https: blob:",
  "connect-src 'self' https://blog.labjp.xyz https://fonts.googleapis.com",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ');

// Comprehensive security headers
const SECURITY_HEADERS = {
  // Prevent clickjacking
  'X-Frame-Options': 'SAMEORIGIN',
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  // XSS Protection (legacy browsers)
  'X-XSS-Protection': '1; mode=block',
  // Control referrer information
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // HTTP Strict Transport Security (2 years + subdomains + preload)
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  // Content Security Policy
  'Content-Security-Policy': CSP_DIRECTIVES,
  // Restrict browser features
  'Permissions-Policy': 'accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), cross-origin-isolated=(), display-capture=(), document-domain=(), encrypted-media=(), execution-while-not-rendered=(), execution-while-out-of-viewport=(), fullscreen=(self), geolocation=(), gyroscope=(), keyboard-map=(), magnetometer=(), microphone=(), midi=(), navigation-override=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), usb=(), web-share=(self), xr-spatial-tracking=()',
  // Cross-Origin policies
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  // Prevent DNS prefetch leaks
  'X-DNS-Prefetch-Control': 'on',
  // Download options
  'X-Download-Options': 'noopen',
  // Permitted cross-domain policies
  'X-Permitted-Cross-Domain-Policies': 'none',
};

// Spanish-speaking countries (ISO 3166-1 alpha-2)
const SPANISH_COUNTRIES = new Set([
  'ES', // Spain
  'MX', // Mexico
  'AR', // Argentina
  'CO', // Colombia
  'PE', // Peru
  'VE', // Venezuela
  'CL', // Chile
  'EC', // Ecuador
  'GT', // Guatemala
  'CU', // Cuba
  'BO', // Bolivia
  'DO', // Dominican Republic
  'HN', // Honduras
  'PY', // Paraguay
  'SV', // El Salvador
  'NI', // Nicaragua
  'CR', // Costa Rica
  'PA', // Panama
  'UY', // Uruguay
  'PR', // Puerto Rico
  'GQ', // Equatorial Guinea
]);

// Helper to get CORS origin
export function getAllowedOrigin(request: Request): string {
  const origin = request.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  return ALLOWED_ORIGINS[0]; // Default to main domain
}

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

  // Skip language redirect for API routes, assets, and already localized paths
  // But still add security headers for non-API routes
  if (url.pathname.startsWith('/api/')) {
    return next(); // API has its own CORS handling
  }

  if (
    url.pathname.startsWith('/en/') ||
    url.pathname.startsWith('/_') ||
    url.pathname.includes('.') // Static assets
  ) {
    const response = await next();
    return addSecurityHeaders(response);
  }

  // Check if user has language preference cookie
  const cookies = request.headers.get('Cookie') || '';
  const hasLangPreference = cookies.includes('lang_preference=');

  if (hasLangPreference) {
    const response = await next();
    return addSecurityHeaders(response);
  }

  // Get country from Cloudflare headers
  const country = request.headers.get('CF-IPCountry') || 'XX';

  // If not from Spanish-speaking country and visiting root paths, suggest English
  if (!SPANISH_COUNTRIES.has(country)) {
    // Only redirect on first visit to homepage or main sections
    const isMainPath = url.pathname === '/' ||
      url.pathname === '/blog' ||
      url.pathname === '/about' ||
      url.pathname === '/notes' ||
      url.pathname.startsWith('/category/');

    if (isMainPath) {
      // Set cookie to remember preference and redirect
      const englishUrl = `/en${url.pathname}${url.search}`;
      const response = new Response(null, {
        status: 302,
        headers: {
          'Location': englishUrl,
          'Set-Cookie': `lang_preference=en; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Strict; Secure`,
          ...SECURITY_HEADERS
        }
      });
      return response;
    }
  } else {
    // Set Spanish preference cookie
    const response = await next();
    const newResponse = addSecurityHeaders(response);
    newResponse.headers.append(
      'Set-Cookie',
      `lang_preference=es; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Strict; Secure`
    );
    return newResponse;
  }

  const response = await next();
  return addSecurityHeaders(response);
};
