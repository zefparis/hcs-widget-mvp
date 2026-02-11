/**
 * HCS-U7 Widget v3 — Rules engine
 * Maps risk scores to decisions using remote config thresholds.
 */

import type { Decision } from '../core/state';
import type { RemoteConfig } from './remote-config';
import type { RiskBreakdown } from '../risk/risk-engine';
import { DEFAULT_THRESHOLDS } from '../risk/thresholds';

/**
 * Determine the decision based on risk score and config thresholds.
 * Progressive escalation: allow → soft → challenge → hard_challenge → bunker → block
 */
export function evaluateRisk(
  risk: RiskBreakdown,
  config: RemoteConfig | null
): Decision {
  const t = config?.thresholds ?? DEFAULT_THRESHOLDS;
  const score = risk.total;

  // Kill switch — monitor only, never block
  if (config?.killSwitch) return 'allow';

  // Monitor mode — always allow, just observe
  if (config?.mode === 'monitor') return 'allow';

  // Bunker override from remote config
  if (config?.bunkerPolicy?.enabled && score >= t.bunker) return 'bunker';

  // Progressive escalation
  if (score < t.allow) return 'allow';
  if (score < t.soft) return 'soft';
  if (score < t.challenge) return 'challenge';
  if (score < t.bunker) return 'hard_challenge';

  // Score >= bunker threshold
  if (config?.bunkerPolicy?.enabled) return 'bunker';

  // Bunker not enabled — fall back to block
  return 'block';
}
