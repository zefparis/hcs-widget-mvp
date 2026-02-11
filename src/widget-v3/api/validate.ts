/**
 * HCS-U7 Widget v3 — Backend validation
 * Sends risk breakdown + signals to backend, receives server decision.
 */

import { state, type ValidationResult } from '../core/state';
import { log } from '../core/logger';
import { safeFetch } from './client';
import { getSignals } from '../telemetry/behavior';
import { collectFingerprint } from '../telemetry/fingerprint';
import type { RiskBreakdown } from '../risk/risk-engine';
import { getHref, getReferrer } from '../core/env';

interface ValidateRequest {
  fingerprint: ReturnType<typeof collectFingerprint>;
  botSignals: { score: number; signals: string[] };
  behavior: ReturnType<typeof getSignals>;
  riskBreakdown: RiskBreakdown;
  url: string;
  referrer: string;
  token?: string;
  tenantId?: string;
  widgetPublicId?: string;
}

interface ValidateResponse {
  action: string;
  token?: string;
  expiresIn?: number;
  serverRisk?: number;
  flags?: string[];
  reason?: string;
  score?: number;
}

/**
 * Validate with backend. Returns server result or null on failure.
 * On failure → degraded mode (monitor-only, no blocking).
 */
export async function validate(clientRisk: RiskBreakdown): Promise<ValidationResult | null> {
  const cfg = state.config;
  const timeout = state.remoteConfig?.timeouts?.validateMs ?? 1200;

  // Build request body
  const body: ValidateRequest = {
    fingerprint: collectFingerprint(),
    botSignals: {
      score: clientRisk.components.fingerprint,
      signals: clientRisk.reasons,
    },
    behavior: getSignals(),
    riskBreakdown: clientRisk,
    url: getHref(),
    referrer: getReferrer(),
  };

  // Auth: signed token (v2+) or raw tenantId (legacy)
  if (cfg.token) {
    body.token = cfg.token;
  } else if (cfg.tenantId) {
    body.tenantId = cfg.tenantId;
  }

  if (cfg.widgetPublicId) {
    body.widgetPublicId = cfg.widgetPublicId;
  }

  const result = await safeFetch<ValidateResponse>('/widget/validate', {
    method: 'POST',
    body,
    timeoutMs: timeout,
  });

  if (!result) {
    // API unreachable → degraded mode
    log('validate', 'Backend unreachable — degraded mode');
    state.degraded = true;
    return {
      action: 'allow',
      reason: 'api_unreachable',
      score: 0,
    };
  }

  log('validate', 'Server response: action=' + result.action +
    ' serverRisk=' + (result.serverRisk ?? 'n/a'));

  // Store session token if provided
  if (result.token) {
    state.sessionToken = result.token;
  }

  return {
    action: result.action,
    token: result.token,
    expiresIn: result.expiresIn,
    serverRisk: result.serverRisk,
    flags: result.flags,
    reason: result.reason,
    score: result.score,
  };
}
