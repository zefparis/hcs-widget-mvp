/**
 * HCS-U7 Widget v3 — Client-side rate limiter
 * Prevents the widget from hammering the backend on rapid page loads.
 */

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

/**
 * Returns true if the action is allowed under the rate limit.
 * @param key   Unique key for the action (e.g. "ping", "validate")
 * @param max   Max calls per window
 * @param windowMs  Window duration in ms
 */
export function rateAllow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  if (bucket.count >= max) {
    return false;
  }

  bucket.count++;
  return true;
}
