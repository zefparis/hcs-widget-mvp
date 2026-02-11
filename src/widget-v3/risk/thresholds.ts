/**
 * HCS-U7 Widget v3 — Default thresholds
 * These are safe defaults; overridden by remote config.
 */

export interface Thresholds {
  allow: number;
  soft: number;
  challenge: number;
  bunker: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  allow: 35,
  soft: 60,
  challenge: 80,
  bunker: 92,
};
