/**
 * Rate Limiter Utility
 * Prevents API spam and ensures good client-side behavior
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitState {
  requests: number;
  windowStart: number;
}

const limiters = new Map<string, RateLimitState>();

/**
 * Check if a request should be rate limited
 * @param key - Unique identifier for the rate limit bucket (e.g., 'likes', 'comments')
 * @param config - Rate limit configuration
 * @returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(key: string, config: RateLimitConfig): boolean {
  const now = Date.now();
  let state = limiters.get(key);

  if (!state || now - state.windowStart > config.windowMs) {
    // Reset window
    state = { requests: 0, windowStart: now };
    limiters.set(key, state);
  }

  if (state.requests >= config.maxRequests) {
    return false; // Rate limited
  }

  state.requests++;
  return true;
}

// Pre-configured rate limits for different API endpoints
export const API_RATE_LIMITS = {
  comments: { maxRequests: 3, windowMs: 60000 },   // 3 comments per minute
  newsletter: { maxRequests: 2, windowMs: 300000 }, // 2 subscribes per 5 minutes
} as const;
