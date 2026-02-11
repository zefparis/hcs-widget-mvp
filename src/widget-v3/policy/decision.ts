/**
 * HCS-U7 Widget v3 — Decision orchestrator
 * Coordinates risk assessment → rule evaluation → action execution.
 */

import { state, type Decision } from '../core/state';
import { log } from '../core/logger';
import { assessRisk } from '../risk/risk-engine';
import { evaluateRisk } from './rules';
import { combineRisk } from '../risk/scoring';
import { executeAllow } from '../actions/allow';
import { executeSoft } from '../actions/soft';
import { executeChallenge } from '../actions/challenge';
import { executeBunker } from '../actions/bunker';
import { executeBlock } from '../actions/block';
import { validate } from '../api/validate';

/**
 * Run the full decision pipeline:
 * 1. Assess client-side risk
 * 2. Validate with backend (if API reachable)
 * 3. Combine client + server risk
 * 4. Evaluate rules → decision
 * 5. Execute action
 */
export async function runDecision(): Promise<Decision> {
  if (state.sessionValidated) {
    log('decision', 'Already validated this session');
    return state.lastDecision ?? 'allow';
  }

  try {
    // 1. Client-side risk assessment
    const clientRisk = assessRisk();

    // 2. Server validation (non-blocking timeout)
    const serverResult = await validate(clientRisk);

    // 3. Combine risks
    let finalScore = clientRisk.total;
    if (serverResult && serverResult.serverRisk !== undefined) {
      finalScore = combineRisk(clientRisk.total, serverResult.serverRisk);
      clientRisk.total = finalScore;
    }

    // If server says block/bunker directly, respect it
    if (serverResult?.action === 'block') {
      state.lastDecision = 'block';
      state.lastValidation = serverResult;
      executeBlock(serverResult.reason || 'Server decision');
      return 'block';
    }
    if (serverResult?.action === 'bunker' && state.remoteConfig?.bunkerPolicy?.enabled) {
      state.lastDecision = 'bunker';
      state.lastValidation = serverResult;
      await executeBunker();
      return 'bunker';
    }

    // 4. Evaluate rules with combined score
    const decision = evaluateRisk(clientRisk, state.remoteConfig);

    // 5. Store results
    state.lastDecision = decision;
    state.lastValidation = serverResult;
    state.lastSeen = Date.now();

    if (serverResult?.token) {
      state.sessionToken = serverResult.token;
    }

    // 6. Execute action
    log('decision', 'Decision: ' + decision + ' (score: ' + Math.round(finalScore) + ')');

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
    // Fail-safe: never break the client's site
    log('decision', 'Error in decision pipeline: ' + (err?.message || 'unknown'));
    state.degraded = true;
    state.lastDecision = 'allow';
    state.sessionValidated = true;
    executeAllow();
    return 'allow';
  }
}
