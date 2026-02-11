/**
 * HCS-U7 Widget v3 — Scoring helpers
 * Weighted combination, clamping, smoothing.
 */

/** Clamp a value to [0, 100] */
export function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/** Weighted average of component scores */
export function weightedScore(
  components: Record<string, number>,
  weights: Record<string, number>
): number {
  let total = 0;
  let wSum = 0;
  for (const key of Object.keys(weights)) {
    const val = components[key] ?? 0;
    const w = weights[key];
    total += clamp(val) * w;
    wSum += w;
  }
  return wSum > 0 ? clamp(total / wSum) : 0;
}

/**
 * Exponential moving average for score smoothing.
 * Prevents single-frame spikes from triggering escalation.
 * @param prev  Previous smoothed score
 * @param curr  Current raw score
 * @param alpha Smoothing factor (0-1, lower = smoother)
 */
export function ema(prev: number, curr: number, alpha: number = 0.3): number {
  if (prev === 0) return curr;
  return clamp(alpha * curr + (1 - alpha) * prev);
}

/**
 * Combine client-side risk with server-side risk.
 * Server risk is weighted higher because it has more context.
 */
export function combineRisk(clientRisk: number, serverRisk: number): number {
  return clamp(clientRisk * 0.4 + serverRisk * 0.6);
}
