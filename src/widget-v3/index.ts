/**
 * HCS-U7 Widget v3.0.0 — Enterprise Adaptive Engine
 * Copyright (c) 2025-2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 *
 * Risk-based, remote config, progressive escalation.
 * Default UX = invisible. Zero friction for normal humans.
 * Fail-safe: site client never broken.
 */

import { isBrowser } from './core/env';
import { initConfig } from './core/init';
import { state } from './core/state';
import { log, logError, isDebug, getLogs, setDebug } from './core/logger';
import { maskId } from './utils/crypto';
import { onReady } from './core/dom';
import { initBehavior, getSignals } from './telemetry/behavior';
import { collectFingerprint } from './telemetry/fingerprint';
import { fetchRemoteConfig } from './policy/remote-config';
import { runDecision } from './policy/decision';
import { sendPing } from './api/ping';
import { showBadge, updateBadge } from './ui/badge';

// ── Version constant (embedded at build time) ──
const HCS_WIDGET_VERSION = '3.0.0';

// ── Guard: only run in browser ──
if (isBrowser()) {
  // Start behavioral collection immediately (passive listeners)
  initBehavior();

  // Main init
  boot();
}

async function boot(): Promise<void> {
  // 1. Parse config from script tag / globals
  if (!initConfig()) {
    // Invalid config — fail silently, don't break client site
    return;
  }

  state.config.version = HCS_WIDGET_VERSION;
  log('boot', 'Widget v' + HCS_WIDGET_VERSION + ' booting');

  // 2. Fetch remote config (non-blocking, with cache + fallback)
  try {
    state.remoteConfig = await fetchRemoteConfig();
    log('boot', 'Remote config loaded (mode=' + state.remoteConfig.mode + ')');

    // Kill switch — stop everything
    if (state.remoteConfig.killSwitch) {
      log('boot', 'Kill switch active — monitor only');
      state.ready = true;
      exposeStatus();
      return;
    }
  } catch {
    log('boot', 'Remote config failed — using safe defaults');
    state.degraded = true;
  }

  // 3. Apply debug from remote config
  if (state.remoteConfig?.ui?.showBadge) {
    setDebug(true);
  }

  // 4. Setup debug badge (if authorized)
  setupDebugAPI();
  showBadge();

  // 5. Send widget ping (non-blocking, silent)
  sendPing().catch(() => { /* silent */ });

  // 6. Run decision pipeline
  onReady(async () => {
    try {
      const decision = await runDecision();
      updateBadge(state.lastRisk?.total ?? 0, decision);
      state.ready = true;
      state.lastSeen = Date.now();
      exposeStatus();
      log('boot', 'Boot complete — decision: ' + decision);
    } catch (err: any) {
      logError('Boot decision failed: ' + (err?.message || 'unknown'));
      state.degraded = true;
      state.ready = true;
      exposeStatus();
    }
  });
}

// ── Public API (minimal surface) ──

interface HCSStatus {
  ready: boolean;
  lastDecision: string | null;
  lastSeen: number;
  version: string;
  degraded: boolean;
}

function exposeStatus(): void {
  const status: HCSStatus = {
    ready: state.ready,
    lastDecision: state.lastDecision,
    lastSeen: state.lastSeen,
    version: HCS_WIDGET_VERSION,
    degraded: state.degraded,
  };

  // Read-only status object
  try {
    Object.defineProperty(window, 'HCS_STATUS', {
      value: Object.freeze(status),
      writable: false,
      configurable: true,
      enumerable: true,
    });
  } catch {
    // Fallback if defineProperty fails
    (window as any).HCS_STATUS = status;
  }
}

/**
 * Debug API — exposed if debug mode is authorized OR window.__HCS_DEBUG__ === true.
 * No methods that allow forcing revalidation from attacker console.
 */
function setupDebugAPI(): void {
  // Support window.__HCS_DEBUG__ = true as a trigger (set before widget loads)
  if ((window as any).__HCS_DEBUG__ === true) {
    setDebug(true);
  }

  if (!isDebug()) return;

  // Only allow debug if token explicitly allows it, or legacy mode with data-debug
  const cfg = state.config;
  const debugAllowed = (cfg.tokenPayload?.dbg) || !cfg.token;
  if (!debugAllowed) {
    log('debug', 'Debug requested but not authorized by token');
    setDebug(false);
    return;
  }

  (window as any).__HCS_DEBUG__ = Object.freeze({
    version: HCS_WIDGET_VERSION,
    tenantId: maskId(cfg.tenantId),
    mode: state.remoteConfig?.mode ?? 'unknown',
    env: cfg.env,

    getFingerprint: () => collectFingerprint(),
    getBehavior: () => getSignals(),
    getLogs: () => getLogs(),
    getRisk: () => state.lastRisk ? { ...state.lastRisk } : null,
    getDecision: () => state.lastDecision,
    getConfig: () => state.remoteConfig ? { ...state.remoteConfig } : null,
    isDegraded: () => state.degraded,
    getStatus: () => ({
      riskScore: Math.round(state.emaScore),
      decision: state.lastDecision,
      thresholds: state.remoteConfig?.thresholds ?? null,
      mode: state.remoteConfig?.mode ?? 'unknown',
      bunkerActive: state.bunkerActive,
      degraded: state.degraded,
      sessionValidated: state.sessionValidated,
    }),
  });

  log('debug', 'Debug API exposed on window.__HCS_DEBUG__');
}
