/**
 * HCS-U7 Widget v3 — Bunker mode (incident isolation)
 * Never activated by default. Only via remote config or very high risk score.
 * Separate module with its own TTL, whitelist, and minimal UI.
 */

import { state } from '../core/state';
import { log } from '../core/logger';
import { el, append, removeById, appendToBody } from '../core/dom';
import { t } from '../core/i18n';
import { supportsSessionStorage } from '../core/env';
import { nowSec } from '../utils/time';

const BUNKER_OVERLAY_ID = 'hcs-bunker-overlay';
const BUNKER_STORAGE_KEY = 'hcs:bunker:whitelist';

interface BunkerWhitelistEntry {
  token: string;
  expiresAt: number;
}

// Capture the widget-server origin at IIFE load time so we can call
// /api/widget/bunker-pass and /api/widget/bunker-verify on the same host
// that served this bundle. document.currentScript is available during
// synchronous IIFE execution (format: iife via esbuild).
const _widgetOrigin: string | null = (() => {
  try {
    const src = (document.currentScript as HTMLScriptElement | null)?.src;
    if (src) return new URL(src).origin;
  } catch { /* ignore */ }
  return null;
})();

/**
 * Verify a stored bunker whitelist entry against the server-issued HMAC.
 * Returns true only if the server confirms the token is valid and unexpired.
 * Falls back to false (always challenge) if the server is unreachable.
 */
async function checkWhitelist(): Promise<boolean> {
  if (!supportsSessionStorage() || !_widgetOrigin) return false;
  try {
    const raw = sessionStorage.getItem(BUNKER_STORAGE_KEY);
    if (!raw) return false;
    const entry = JSON.parse(raw) as BunkerWhitelistEntry;
    if (!entry.token || !entry.expiresAt || entry.expiresAt <= nowSec()) {
      sessionStorage.removeItem(BUNKER_STORAGE_KEY);
      return false;
    }
    const res = await fetch(_widgetOrigin + '/api/widget/bunker-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: entry.token }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const data = await res.json() as { valid: boolean };
    if (data?.valid === true) {
      log('bunker', 'Server-verified whitelist — passing through');
      return true;
    }
    sessionStorage.removeItem(BUNKER_STORAGE_KEY);
  } catch { /* network error — fall through to challenge */ }
  return false;
}

/**
 * Claim a server-issued HMAC whitelist token and store it in sessionStorage.
 * If the server is unavailable, the whitelist is not stored and the user
 * will be challenged again on the next page load (safer than trusting localStorage).
 */
async function claimWhitelist(ttlSeconds: number): Promise<void> {
  if (!supportsSessionStorage() || !_widgetOrigin) return;
  try {
    const res = await fetch(_widgetOrigin + '/api/widget/bunker-pass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: ttlSeconds }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return;
    const data = await res.json() as { token: string; exp: number };
    if (!data?.token || !data?.exp) return;
    const entry: BunkerWhitelistEntry = { token: data.token, expiresAt: data.exp };
    sessionStorage.setItem(BUNKER_STORAGE_KEY, JSON.stringify(entry));
  } catch { /* server unavailable — no whitelist stored */ }
}

/**
 * Execute bunker mode.
 * Shows a strict verification gate. If already whitelisted, passes through.
 */
export async function executeBunker(): Promise<void> {
  // Verify whitelist against server-signed HMAC nonce (not just sessionStorage truthiness)
  if (await checkWhitelist()) {
    log('bunker', 'Server-verified whitelist — passing through');
    state.sessionValidated = true;
    return;
  }

  log('action', 'BUNKER — strict verification gate');

  return new Promise((resolve) => {
    removeById(BUNKER_OVERLAY_ID);

    const ttl = state.remoteConfig?.bunkerPolicy?.ttlSeconds ?? 900;

    // Full-screen overlay
    const overlay = el('div',
      'position:fixed;top:0;left:0;width:100%;height:100%;background:#0f172a;display:flex;align-items:center;justify-content:center;z-index:999999;font-family:system-ui,-apple-system,sans-serif;');
    overlay.id = BUNKER_OVERLAY_ID;

    const container = el('div', 'text-align:center;max-width:400px;padding:40px;');

    const icon = el('div', 'font-size:48px;margin-bottom:16px;', '\uD83D\uDEE1\uFE0F');
    const title = el('h2', 'color:#f1f5f9;margin:0 0 8px 0;font-size:22px;', t('bunkerTitle'));
    const desc = el('p', 'color:#94a3b8;margin:0 0 24px 0;font-size:14px;line-height:1.5;',
      t('bunkerDescription'));

    // Strict slider challenge (narrower tolerance)
    const targetValue = 40 + Math.floor(Math.random() * 20); // 40-60
    const tolerance = 3;

    const instruction = el('p', 'color:#cbd5e1;margin:0 0 16px 0;font-size:13px;',
      t('bunkerInstruction') + targetValue);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = '0';
    slider.style.cssText = 'width:100%;margin:12px 0;cursor:pointer;';

    const valueDisplay = el('div', 'font-size:32px;font-weight:bold;color:#60a5fa;margin-bottom:20px;', '0');

    const submitBtn = el('button',
      'padding:12px 36px;background:#3b82f6;color:white;border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:600;',
      t('bunkerVerify'));

    const branding = el('p', 'color:#475569;font-size:10px;margin-top:24px;margin-bottom:0;',
      t('bunkerBranding'));

    slider.addEventListener('input', () => {
      valueDisplay.textContent = slider.value;
    });

    submitBtn.addEventListener('click', () => {
      const value = parseInt(slider.value, 10);
      const success = Math.abs(value - targetValue) <= tolerance;

      if (success) {
        log('bunker', 'Verification passed — claiming server whitelist for ' + ttl + 's');
        claimWhitelist(ttl).catch(() => { /* non-blocking — user still passes this session */ });
        state.sessionValidated = true;
        removeById(BUNKER_OVERLAY_ID);
        resolve();
      } else {
        // Show error, let them retry
        instruction.textContent = t('bunkerRetry') + targetValue;
        instruction.style.color = '#f87171';
        slider.value = '0';
        valueDisplay.textContent = '0';
        log('bunker', 'Verification failed (value=' + value + ', target=' + targetValue + ')');
      }
    });

    append(container, icon, title, desc, instruction, slider, valueDisplay, submitBtn, branding);
    overlay.appendChild(container);
    appendToBody(overlay);
  });
}

/** Force-clear bunker whitelist (called on bunker exit / mode change) */
export function clearBunkerWhitelist(): void {
  if (!supportsSessionStorage()) return;
  try {
    sessionStorage.removeItem(BUNKER_STORAGE_KEY);
    log('bunker', 'Whitelist cleared (bunker exit)');
  } catch { /* ignore */ }
}
