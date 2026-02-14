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

/**
 * Create a rate-limited fetch wrapper
 * @param key - Unique identifier for the rate limit bucket
 * @param config - Rate limit configuration
 * @returns A fetch function that respects rate limits
 */
export function createRateLimitedFetch(
  key: string,
  config: RateLimitConfig = { maxRequests: 10, windowMs: 60000 }
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!checkRateLimit(key, config)) {
      throw new Error('Rate limit exceeded. Please wait before making more requests.');
    }
    return fetch(input, init);
  };
}

/**
 * Debounce a function
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Pre-configured rate limits for different API endpoints
export const API_RATE_LIMITS = {
  likes: { maxRequests: 5, windowMs: 60000 },      // 5 likes per minute
  comments: { maxRequests: 3, windowMs: 60000 },   // 3 comments per minute
  newsletter: { maxRequests: 2, windowMs: 300000 }, // 2 subscribes per 5 minutes
  views: { maxRequests: 30, windowMs: 60000 },     // 30 view records per minute
} as const;
