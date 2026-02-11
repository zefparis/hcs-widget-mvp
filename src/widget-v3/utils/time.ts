/**
 * HCS-U7 Widget v3 — Time utilities
 */

/** Current epoch seconds */
export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** High-resolution timestamp (ms) */
export function hrt(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Sleep helper */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Add jitter to a base delay: base ± jitterPct% */
export function jitter(baseMs: number, jitterPct: number = 0.2): number {
  const range = baseMs * jitterPct;
  return baseMs + (Math.random() * 2 - 1) * range;
}

/** Check if a unix-second timestamp is expired */
export function isExpired(expSec: number): boolean {
  return nowSec() > expSec;
}

/** Check if within grace period (1 hour after expiry) */
export function isInGrace(expSec: number): boolean {
  const now = nowSec();
  return now > expSec && now - expSec <= 3600;
}
