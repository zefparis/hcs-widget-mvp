/**
 * HCS-U7 Widget v3 — Risk types
 * Shared types for the risk module, extracted to avoid circular imports.
 */

export interface RiskBreakdown {
  total: number;
  components: {
    fingerprint: number;
    behavior: number;
    automation: number;
    integrity: number;
    velocity: number;
    network: number;
  };
  reasons: string[];
}
