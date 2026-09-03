export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  retryAfterSeconds?: number;
}

const rateLimitWindows = new Map<string, number[]>();

/**
 * In-memory sliding-window rate limiter (D-07).
 * Tracks request timestamps per key and prunes timestamps older than windowMs.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60000
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  let timestamps = rateLimitWindows.get(key) || [];
  timestamps = timestamps.filter((ts) => ts > windowStart);

  if (timestamps.length >= limit) {
    const oldest = timestamps[0];
    const resetMs = Math.max(0, oldest + windowMs - now);
    const retryAfterSeconds = Math.max(1, Math.ceil(resetMs / 1000));
    rateLimitWindows.set(key, timestamps);
    return {
      allowed: false,
      remaining: 0,
      resetMs,
      retryAfterSeconds,
    };
  }

  timestamps.push(now);
  rateLimitWindows.set(key, timestamps);

  const oldest = timestamps[0];
  const resetMs = Math.max(0, oldest + windowMs - now);

  return {
    allowed: true,
    remaining: limit - timestamps.length,
    resetMs,
  };
}

/**
 * Clear all rate limit buckets (useful for test isolation).
 */
export function resetRateLimits(): void {
  rateLimitWindows.clear();
}

/**
 * Prune keys with no active timestamps in window to prevent memory accumulation (§6.5).
 */
export function pruneExpiredKeys(windowMs: number = 60000): void {
  const now = Date.now();
  const windowStart = now - windowMs;
  for (const [key, timestamps] of rateLimitWindows.entries()) {
    const valid = timestamps.filter((ts) => ts > windowStart);
    if (valid.length === 0) {
      rateLimitWindows.delete(key);
    } else {
      rateLimitWindows.set(key, valid);
    }
  }
}

// Background cleanup every 5 minutes (unrefed so process can exit cleanly)
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    pruneExpiredKeys();
  }, 5 * 60 * 1000);
  if (timer.unref) {
    timer.unref();
  }
}
