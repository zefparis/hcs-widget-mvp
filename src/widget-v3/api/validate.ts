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
import { encodePayload, hashSignal, djb2 } from '../utils/crypto';

interface ValidateRequestRaw {
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

/**
 * Minify field names and hash signal strings to prevent
 * casual inspection of detection strategy in DevTools.
 */
function obfuscateBody(raw: ValidateRequestRaw): Record<string, unknown> {
  const fp = raw.fingerprint;
  return {
    f: {
      ua: djb2(fp.userAgent),
      l: fp.language,
      p: djb2(fp.platform),
      hc: fp.hardwareConcurrency,
      sr: fp.screenResolution,
      cd: fp.colorDepth,
      tz: fp.timezoneOffset,
      wd: fp.webdriver,
      pl: fp.plugins,
      cv: fp.canvas,
      gl: fp.webgl,
      ts: fp.touchSupport,
      ck: fp.cookieEnabled,
    },
    bs: {
      s: raw.botSignals.score,
      r: raw.botSignals.signals.map(hashSignal),
    },
    bh: {
      nm: raw.behavior.noMouseMovement,
      lm: raw.behavior.linearMovement,
      ks: raw.behavior.keystrokes,
      mt: Math.round(raw.behavior.microTimingEntropy * 100),
      ti: Math.round(raw.behavior.timeToFirstInteraction * 100),
      ig: raw.behavior.idleGaps,
      sd: Math.round(raw.behavior.sessionDuration),
      mc: Math.round(raw.behavior.mouseCurvatureAvg * 1000),
      mm: raw.behavior.mouseMovements,
    },
    rb: {
      t: Math.round(raw.riskBreakdown.total),
      c: Object.fromEntries(
        Object.entries(raw.riskBreakdown.components).map(([k, v]) => [k[0], Math.round(v as number)])
      ),
      r: raw.riskBreakdown.reasons.map(hashSignal),
    },
    u: djb2(raw.url),
    rf: djb2(raw.referrer),
    ...(raw.token ? { tk: raw.token } : {}),
    ...(raw.tenantId ? { ti: raw.tenantId } : {}),
    ...(raw.widgetPublicId ? { wp: raw.widgetPublicId } : {}),
  };
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

  // Build raw request body
  const raw: ValidateRequestRaw = {
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
    raw.token = cfg.token;
  } else if (cfg.tenantId) {
    raw.tenantId = cfg.tenantId;
  }

  if (cfg.widgetPublicId) {
    raw.widgetPublicId = cfg.widgetPublicId;
  }

  // Obfuscate: minify field names + hash signals + encode as opaque payload
  const obfuscated = obfuscateBody(raw);
  const encoded = encodePayload(obfuscated);

  const result = await safeFetch<ValidateResponse>('/widget/validate', {
    method: 'POST',
    body: { _e: encoded, _v: 3 },
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
