/**
 * HCS-U7 Widget v3 — Risk Engine
 * Computes a structured risk breakdown from all signal sources.
 */

import { collectFingerprint } from '../telemetry/fingerprint';
import { getSignals } from '../telemetry/behavior';
import { analyzeFingerprint, analyzeBehavior, collectIntegrity } from '../telemetry/signals';
import { weightedScore, clamp } from './scoring';
import { state } from '../core/state';
import { log } from '../core/logger';
import { nowSec } from '../utils/time';

import type { RiskBreakdown } from './types';
export type { RiskBreakdown } from './types';

const WEIGHTS: Record<string, number> = {
  fingerprint: 0.25,
  behavior: 0.30,
  automation: 0.20,
  integrity: 0.10,
  velocity: 0.10,
  network: 0.05,
};

let lastAssessTime = 0;

/**
 * Compute full risk breakdown from current signals.
 * Non-blocking, synchronous (all data already collected passively).
 */
export function assessRisk(): RiskBreakdown {
  const reasons: string[] = [];

  // 1. Fingerprint analysis
  const fp = collectFingerprint();
  const fpResult = analyzeFingerprint(fp);
  reasons.push(...fpResult.signals);

  // 2. Behavior analysis
  const behavior = getSignals();
  const behResult = analyzeBehavior(behavior);
  reasons.push(...behResult.signals);

  // 3. Automation score (subset of fingerprint focused on webdriver/headless)
  let automationScore = 0;
  if (fp.webdriver) automationScore += 60;
  if (fpResult.signals.includes('a3')) automationScore += 40;
  automationScore = clamp(automationScore);

  // 4. Integrity
  const integrity = collectIntegrity();
  let integrityScore = 0;
  if (!integrity.storageAvailable) { integrityScore += 20; reasons.push('i1'); }
  if (!integrity.cookiesEnabled) { integrityScore += 15; reasons.push('i2'); }
  if (integrity.cspBlocked) { integrityScore += 10; reasons.push('i3'); }
  integrityScore = clamp(integrityScore);

  // 5. Velocity (actions too fast)
  let velocityScore = 0;
  const now = nowSec();
  if (lastAssessTime > 0 && now - lastAssessTime < 2) {
    velocityScore = 30;
    reasons.push('v1');
  }
  lastAssessTime = now;

  // 6. Network (placeholder — enriched by server)
  const networkScore = 0;

  const components = {
    fingerprint: clamp(fpResult.score),
    behavior: clamp(behResult.score),
    automation: automationScore,
    integrity: integrityScore,
    velocity: velocityScore,
    network: networkScore,
  };

  const total = weightedScore(components, WEIGHTS);

  const breakdown: RiskBreakdown = { total, components, reasons };

  log('risk', 'Score: ' + Math.round(total) + ' | reasons: ' + reasons.join(', '));
  state.lastRisk = breakdown;

  return breakdown;
}
