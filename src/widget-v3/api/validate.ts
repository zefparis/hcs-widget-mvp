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
      // Mouse dynamics
      mv: Math.round(raw.behavior.mouseVelocityAvg * 100),
      ms: Math.round(raw.behavior.mouseVelocityStd * 100),
      ma: Math.round(raw.behavior.mouseAccelerationAvg * 1000),
      mk: raw.behavior.mouseClicks,
      // Touch dynamics
      te: raw.behavior.touchEvents,
      tp: Math.round(raw.behavior.touchPressureAvg * 1000),
      tr: Math.round(raw.behavior.touchRadiusAvg * 100),
      tv: Math.round(raw.behavior.touchVelocityAvg * 100),
      ts: Math.round(raw.behavior.touchVelocityStd * 100),
      ta: Math.round(raw.behavior.touchAccelerationAvg * 1000),
      tb: Math.round(raw.behavior.touchAccelerationStd * 1000),
      tc: Math.round(raw.behavior.touchCurvatureAvg * 1000),
      th: Math.round(raw.behavior.touchHoldDurationAvg),
      td: Math.round(raw.behavior.touchHoldDurationStd),
      // Device motion (gyroscope + accelerometer)
      ga: Math.round((raw.behavior.gyroAlphaStd || 0) * 1000),
      gb: Math.round((raw.behavior.gyroBetaStd || 0) * 1000),
      gc: Math.round((raw.behavior.gyroGammaStd || 0) * 1000),
      ax: Math.round((raw.behavior.accelXStd || 0) * 1000),
      ay: Math.round((raw.behavior.accelYStd || 0) * 1000),
      az: Math.round((raw.behavior.accelZStd || 0) * 1000),
      dm: raw.behavior.deviceMotionEvents,
      // Scroll + timing
      se: raw.behavior.scrollEvents,
      sv: Math.round(raw.behavior.scrollVelocityAvg * 100),
      sc: raw.behavior.scrollDirectionChanges,
      ce: raw.behavior.copyPasteEvents,
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
    // SECURITY: fail-closed — backend unreachable → challenge, never auto-allow
    log('validate', 'Backend unreachable — fail-closed, forcing challenge');
    state.degraded = true;
    return {
      action: 'challenge',
      reason: 'api_unreachable',
      score: 50,
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
