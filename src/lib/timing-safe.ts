/**
 * Timing-safe response utility.
 * Ensures all API responses take a minimum consistent duration
 * to prevent timing-based enumeration attacks.
 */

const MIN_RESPONSE_TIME_MS = 200;
const JITTER_MS = 50;

/**
 * Pads the elapsed time so that every response takes at least
 * MIN_RESPONSE_TIME_MS + random jitter, regardless of whether
 * the request was rejected early or hit the backend.
 */
export async function padResponseTime(startTime: number): Promise<void> {
  const elapsed = Date.now() - startTime;
  const jitter = Math.random() * JITTER_MS;
  const target = MIN_RESPONSE_TIME_MS + jitter;
  const remaining = target - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}
