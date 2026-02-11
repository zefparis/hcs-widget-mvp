/**
 * HCS-U7 Widget v3 — Decision orchestrator
 * Coordinates risk assessment → rule evaluation → action execution.
 */

import { state, type Decision } from '../core/state';
import { log } from '../core/logger';
import { assessRisk } from '../risk/risk-engine';
import { evaluateRisk } from './rules';
import { combineRisk, ema } from '../risk/scoring';
import { executeAllow } from '../actions/allow';
import { executeSoft } from '../actions/soft';
import { executeChallenge } from '../actions/challenge';
import { executeBunker } from '../actions/bunker';
import { executeBlock } from '../actions/block';
import { validate } from '../api/validate';
import { clearBunkerWhitelist } from '../actions/bunker';
import { applyDevTolerance } from '../risk/scoring';

/**
 * Run the full decision pipeline:
 * 1. Reset bunker state if mode is not bunker
 * 2. Assess client-side risk
 * 3. Apply dev tolerance + EMA smoothing
 * 4. Validate with backend (if API reachable)
 * 5. Combine client + server risk
 * 6. Anti-escalation hysteresis
 * 7. Evaluate rules → decision
 * 8. Execute action
 */
export async function runDecision(): Promise<Decision> {
  if (state.sessionValidated) {
    log('decision', 'Already validated this session');
    return state.lastDecision ?? 'allow';
  }

  // PART 2: Reset bunker state when mode is not bunker
  const mode = state.remoteConfig?.mode ?? 'adaptive';
  if (mode !== 'enforce' && state.bunkerActive) {
    log('decision', 'Bunker exit detected — resetting bunker state');
    state.bunkerActive = false;
    state.sessionToken = null;
    state.emaScore = 0;
    clearBunkerWhitelist();
  }

  try {
    // 1. Client-side risk assessment
    const clientRisk = assessRisk();

    // PART 4: Dev mode tolerance
    clientRisk.total = applyDevTolerance(clientRisk.total);

    // PART 2: EMA smoothing — prevents single-frame spikes
    state.emaScore = ema(state.emaScore, clientRisk.total, 0.3);
    clientRisk.total = state.emaScore;

    // 2. Server validation (non-blocking timeout)
    const serverResult = await validate(clientRisk);

    // PART 6: Fail-safe — if API unreachable, enter monitor-only mode
    if (!serverResult || serverResult.reason === 'api_unreachable') {
      log('decision', 'API unreachable — monitor-only mode (soft actions only)');
      state.degraded = true;
      state.lastDecision = 'soft';
      state.lastSeen = Date.now();
      await executeSoft();
      state.sessionValidated = true;
      return 'soft';
    }

    // 3. Combine risks
    let finalScore = clientRisk.total;
    if (serverResult.serverRisk !== undefined) {
      finalScore = combineRisk(clientRisk.total, serverResult.serverRisk);
      // Re-apply EMA on combined score
      state.emaScore = ema(state.emaScore, finalScore, 0.3);
      finalScore = state.emaScore;
      clientRisk.total = finalScore;
    }

    // If server says block/bunker directly, respect it
    if (serverResult.action === 'block') {
      state.lastDecision = 'block';
      state.lastValidation = serverResult;
      executeBlock(serverResult.reason || 'Server decision');
      return 'block';
    }
    if (serverResult.action === 'bunker' && state.remoteConfig?.bunkerPolicy?.enabled) {
      state.lastDecision = 'bunker';
      state.lastValidation = serverResult;
      state.bunkerActive = true;
      await executeBunker();
      return 'bunker';
    }

    // 4. Evaluate rules with combined score
    let decision = evaluateRisk(clientRisk, state.remoteConfig);

    // PART 5: Anti-escalation hysteresis
    // Prevent challenge if previous decision was allow and score is near threshold
    const t = state.remoteConfig?.thresholds;
    if (
      state.lastDecision === 'allow' &&
      (decision === 'challenge' || decision === 'hard_challenge') &&
      t && finalScore < t.challenge + 5
    ) {
      log('decision', 'Hysteresis: suppressing escalation allow→' + decision + ' (score ' + Math.round(finalScore) + ' < challenge+5)');
      decision = 'soft';
    }
    // Prevent soft→challenge oscillation
    if (
      state.lastDecision === 'soft' &&
      (decision === 'challenge' || decision === 'hard_challenge') &&
      t && finalScore < t.challenge + 3
    ) {
      log('decision', 'Hysteresis: suppressing escalation soft→' + decision);
      decision = 'soft';
    }

    // 5. Store results
    state.lastDecision = decision;
    state.lastValidation = serverResult;
    state.lastSeen = Date.now();

    if (serverResult.token) {
      state.sessionToken = serverResult.token;
    }

    // Track bunker activation
    if (decision === 'bunker') {
      state.bunkerActive = true;
    }

    // 6. Execute action
    log('decision', 'Decision: ' + decision + ' (score: ' + Math.round(finalScore) + ', ema: ' + Math.round(state.emaScore) + ')');

    switch (decision) {
      case 'allow':
        executeAllow();
        state.sessionValidated = true;
        break;
      case 'soft':
        await executeSoft();
        state.sessionValidated = true;
        break;
      case 'challenge':
      case 'hard_challenge':
        const passed = await executeChallenge(decision === 'hard_challenge');
        if (passed) {
          state.sessionValidated = true;
        } else {
          executeBlock('Challenge failed');
          state.lastDecision = 'block';
          return 'block';
        }
        break;
      case 'bunker':
        await executeBunker();
        break;
      case 'block':
        executeBlock('Risk threshold exceeded');
        break;
    }

    return decision;

  } catch (err: any) {
    // PART 6: Fail-safe — never break the client's site
    // Enter monitor-only: soft actions only, no bunker, no challenge
    log('decision', 'Pipeline error — monitor-only fail-safe: ' + (err?.message || 'unknown'));
    state.degraded = true;
    state.lastDecision = 'soft';
    state.sessionValidated = true;
    await executeSoft();
    return 'soft';
  }
}
