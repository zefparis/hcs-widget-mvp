/**
 * HCS-U7 Widget v3 — Signal analysis
 * Analyzes fingerprint + behavior to produce bot signal scores.
 */

import type { BrowserFingerprint } from './fingerprint';
import type { BehaviorSignals } from './behavior';
import { supportsLocalStorage, supportsSessionStorage } from '../core/env';

export interface BotSignals {
  score: number;
  signals: string[];
  suspicious: boolean;
}

export interface IntegritySignals {
  storageAvailable: boolean;
  cookiesEnabled: boolean;
  cspBlocked: boolean;
  adblockDetected: boolean;
}

/**
 * Analyze fingerprint for automation hints.
 * Returns a score 0-100 and list of signal names.
 */
export function analyzeFingerprint(fp: BrowserFingerprint): BotSignals {
  const signals: string[] = [];
  let score = 0;

  if (fp.webdriver) { signals.push('webdriver'); score += 50; }
  if (fp.plugins === 0) { signals.push('no_plugins'); score += 20; }

  const suspicious = ['headless', 'phantom', 'selenium', 'puppeteer', 'bot', 'crawler', 'spider'];
  const ua = fp.userAgent.toLowerCase();
  if (suspicious.some((s) => ua.indexOf(s) !== -1)) { signals.push('suspicious_ua'); score += 40; }

  if (fp.languages.length === 0) { signals.push('no_languages'); score += 15; }
  if (fp.hardwareConcurrency === 0 || fp.hardwareConcurrency > 32) { signals.push('abnormal_hw'); score += 10; }
  if (!fp.canvas || fp.canvas.length < 5) { signals.push('invalid_canvas'); score += 25; }
  if (!fp.webgl || fp.webgl.length < 5) { signals.push('invalid_webgl'); score += 20; }
  if (!fp.cookieEnabled) { signals.push('cookies_disabled'); score += 10; }
  if (fp.timezone === 'UTC' || fp.timezoneOffset === 0) { signals.push('utc_tz'); score += 5; }

  return { score: Math.min(100, score), signals, suspicious: score >= 50 };
}

/**
 * Analyze behavioral signals for bot-like patterns.
 * Returns a score 0-100.
 */
export function analyzeBehavior(b: BehaviorSignals): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  // No mouse movement at all
  if (b.noMouseMovement && b.sessionDuration > 2) { signals.push('no_mouse'); score += 15; }

  // Perfectly linear mouse movement (bot)
  if (b.linearMovement) { signals.push('linear_mouse'); score += 20; }

  // No keystrokes but long session
  if (b.keystrokes === 0 && b.sessionDuration > 5) { signals.push('no_keystrokes'); score += 5; }

  // Micro-timing entropy too high (artificial randomness)
  if (b.microTimingEntropy > 0.85) { signals.push('artificial_timing'); score += 25; }

  // Micro-timing entropy too low (robotic)
  if (b.microTimingEntropy < 0.15 && b.sessionDuration > 2) { signals.push('robotic_timing'); score += 20; }

  // Very fast time to first interaction (< 100ms)
  if (b.timeToFirstInteraction < 0.1 && b.sessionDuration > 1) { signals.push('instant_interaction'); score += 15; }

  // Zero idle gaps in a long session (bot doesn't pause)
  if (b.idleGaps === 0 && b.sessionDuration > 30) { signals.push('no_idle'); score += 10; }

  // Keystroke dwell too uniform (std < 5ms)
  if (b.keystrokeDwellStd < 5 && b.keystrokes > 10) { signals.push('uniform_dwell'); score += 15; }

  // Mouse curvature near zero (straight lines)
  if (b.mouseCurvatureAvg < 0.001 && b.mouseMovements > 20) { signals.push('zero_curvature'); score += 15; }

  return { score: Math.min(100, score), signals };
}

/**
 * Collect integrity signals (storage, cookies, CSP, adblock).
 */
export function collectIntegrity(): IntegritySignals {
  return {
    storageAvailable: supportsLocalStorage() && supportsSessionStorage(),
    cookiesEnabled: !!navigator.cookieEnabled,
    cspBlocked: false, // Updated async by diagnostics
    adblockDetected: false, // Updated async by diagnostics
  };
}
