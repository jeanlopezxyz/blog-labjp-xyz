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

// Articles renamed to the date-slug scheme (2026-09). Old URLs are indexed,
// so they keep a permanent redirect. public/_redirects can't do this: Pages
// Functions run before _redirects, so any request under /es/ or /en/ never
// reaches it — this table is the only place these redirects actually work.
const RENAMED_POSTS: Record<string, string> = {
  "/en/blog/ansible-execution-environment":
    "/en/blog/2025-06-21-ansible-execution-environment",
  "/en/blog/ci-cd-github-actions": "/en/blog/2026-01-16-ci-cd-github-actions",
  "/en/blog/cloud-native-microservices-quarkus":
    "/en/blog/2026-01-15-cloud-native-microservices-quarkus",
  "/en/blog/ebpf-ia-kubernetes-deteccion-amenazas":
    "/en/blog/2025-08-22-ebpf-ia-kubernetes-deteccion-amenazas",
  "/en/blog/gitops-openshift-argocd":
    "/en/blog/2026-01-17-gitops-openshift-argocd",
  "/en/blog/golden-kubestronaut-experiencia":
    "/en/blog/2025-06-21-golden-kubestronaut-experiencia",
  "/en/blog/helm-charts-complete-guide":
    "/en/blog/2026-01-18-helm-charts-complete-guide",
  "/en/blog/langchain4j-java-ai": "/en/blog/2026-01-19-langchain4j-java-ai",
  "/en/blog/mcp-servers-genai-studio-openshift-ai":
    "/en/blog/2026-02-13-mcp-servers-genai-studio-openshift-ai",
  "/en/blog/monitoring-prometheus-grafana":
    "/en/blog/2026-01-14-monitoring-prometheus-grafana",
  "/en/blog/rag-enterprise-java": "/en/blog/2026-01-20-rag-enterprise-java",
  "/es/blog/ansible-execution-environment":
    "/es/blog/2025-06-21-ansible-execution-environment",
  "/es/blog/ci-cd-github-actions": "/es/blog/2026-01-16-ci-cd-github-actions",
  "/es/blog/cloud-native-microservices-quarkus":
    "/es/blog/2026-01-15-cloud-native-microservices-quarkus",
  "/es/blog/ebpf-ia-kubernetes-deteccion-amenazas":
    "/es/blog/2025-08-22-ebpf-ia-kubernetes-deteccion-amenazas",
  "/es/blog/gitops-openshift-argocd":
    "/es/blog/2026-01-17-gitops-openshift-argocd",
  "/es/blog/golden-kubestronaut-experiencia":
    "/es/blog/2025-06-21-golden-kubestronaut-experiencia",
  "/es/blog/helm-charts-complete-guide":
    "/es/blog/2026-01-18-helm-charts-complete-guide",
  "/es/blog/langchain4j-java-ai": "/es/blog/2026-01-19-langchain4j-java-ai",
  "/es/blog/mcp-servers-genai-studio-openshift-ai":
    "/es/blog/2026-02-13-mcp-servers-genai-studio-openshift-ai",
  "/es/blog/monitoring-prometheus-grafana":
    "/es/blog/2026-01-14-monitoring-prometheus-grafana",
  "/es/blog/rag-enterprise-java": "/es/blog/2026-01-20-rag-enterprise-java",
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

    // Cloudflare Pages defaults to a 7-day edge cache (s-maxage=604800) for
    // HTML served through Functions, with no way to purge just this site's
    // subdomain on the Free plan (only the whole zone or exact URLs). A
    // short edge TTL means published edits show up in minutes without
    // needing a zone-wide purge on every deploy.
    const contentType = newResponse.headers.get("Content-Type") || "";
    if (contentType.includes("text/html")) {
      newResponse.headers.set(
        "Cache-Control",
        "public, max-age=0, s-maxage=300, must-revalidate",
      );
    }

    return newResponse;
  };

  // API routes: skip language redirect (they have their own CORS handling)
  // but still layer on the shared security headers (nosniff, HSTS, etc.).
  if (url.pathname.startsWith("/api/")) {
    const response = await next();
    return addSecurityHeaders(response);
  }

  // Renamed post: permanent redirect before anything tries to serve the old path.
  const renamedTarget = RENAMED_POSTS[url.pathname.replace(/\/$/, "")];
  if (renamedTarget) {
    return new Response(null, {
      status: 301,
      headers: {
        Location: `${renamedTarget}/${url.search}`,
        ...SECURITY_HEADERS,
      },
    });
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
