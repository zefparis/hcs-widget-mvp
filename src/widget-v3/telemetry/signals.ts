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
 * Returns a score 0-100 and list of opaque signal codes.
 */
export function analyzeFingerprint(fp: BrowserFingerprint): BotSignals {
  const signals: string[] = [];
  let score = 0;

  if (fp.webdriver) { signals.push('a1'); score += 50; }
  if (fp.plugins === 0 && !fp.touchSupport) { signals.push('a2'); score += 10; }

  const _s = ['\x68\x65\x61\x64\x6c\x65\x73\x73', '\x70\x68\x61\x6e\x74\x6f\x6d', '\x73\x65\x6c\x65\x6e\x69\x75\x6d', '\x70\x75\x70\x70\x65\x74\x65\x65\x72', '\x62\x6f\x74', '\x63\x72\x61\x77\x6c\x65\x72', '\x73\x70\x69\x64\x65\x72'];
  const ua = fp.userAgent.toLowerCase();
  if (_s.some((s) => ua.indexOf(s) !== -1)) { signals.push('a3'); score += 40; }

  if (fp.languages.length === 0) { signals.push('a4'); score += 15; }
  if (fp.hardwareConcurrency === 0 || fp.hardwareConcurrency > 32) { signals.push('a5'); score += 10; }
  if (!fp.canvas || fp.canvas.length < 5) { signals.push('a6'); score += 25; }
  if (!fp.webgl || fp.webgl.length < 5) { signals.push('a7'); score += 20; }
  if (!fp.cookieEnabled) { signals.push('a8'); score += 10; }
  if (fp.timezone === 'UTC' || fp.timezoneOffset === 0) { signals.push('a9'); score += 5; }

  return { score: Math.min(100, score), signals, suspicious: score >= 50 };
}

/**
 * Analyze behavioral signals for bot-like patterns.
 * Returns a score 0-100.
 *
 * MOBILE-AWARE: Touch devices get positive bonuses for gyro/accel/touch
 * and are NOT penalized for missing mouse/keyboard signals.
 */
export function analyzeBehavior(b: BehaviorSignals, isTouchDevice?: boolean): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  const isMobile = b.touchEvents > 0 || b.deviceMotionEvents > 0 || isTouchDevice === true;

  // b1: No mouse — only penalize on desktop (mobile has no mouse)
  if (b.noMouseMovement && b.sessionDuration > 2 && !isMobile) { signals.push('b1'); score += 15; }

  // b2: Linear mouse movement (bot straight lines)
  if (b.linearMovement) { signals.push('b2'); score += 20; }

  // b3: No keystrokes — normal on mobile, only mild penalty on desktop
  if (b.keystrokes === 0 && b.sessionDuration > 5 && !isMobile) { signals.push('b3'); score += 5; }

  // b4/b5: Timing entropy extremes (too perfect or too random)
  if (b.microTimingEntropy > 0.85) { signals.push('b4'); score += 25; }
  if (b.microTimingEntropy < 0.15 && b.sessionDuration > 2) { signals.push('b5'); score += 20; }

  // b6: Instant interaction (< 100ms)
  if (b.timeToFirstInteraction < 0.1 && b.sessionDuration > 1) { signals.push('b6'); score += 15; }

  // b7: No idle gaps in very long session
  if (b.idleGaps === 0 && b.sessionDuration > 30) { signals.push('b7'); score += 10; }

  // b8: Robotic keystroke dwell
  if (b.keystrokeDwellStd < 5 && b.keystrokes > 10) { signals.push('b8'); score += 15; }

  // b9: Straight-line mouse (no curvature)
  if (b.mouseCurvatureAvg < 0.001 && b.mouseMovements > 20) { signals.push('b9'); score += 15; }

  // ── Mobile positive signals ──

  // m1: Touch interaction present (hard to fake)
  if (b.touchEvents > 0) { signals.push('m1'); score -= 10; }

  // m2: Natural touch velocity variation (humans vary)
  if (b.touchEvents > 0 && b.touchVelocityStd > 0 && b.touchVelocityAvg > 0) {
    const cv = b.touchVelocityStd / b.touchVelocityAvg;
    if (cv >= 0.1 && cv <= 1.2) { signals.push('m2'); score -= 8; }
  }

  // m3: Touch curvature (humans swipe in curves)
  if (b.touchCurvatureAvg > 0.003) { signals.push('m3'); score -= 5; }

  // m4: Natural touch hold duration
  if (b.touchHoldDurationAvg >= 40 && b.touchHoldDurationAvg <= 2000
    && b.touchHoldDurationStd > 5) { signals.push('m4'); score -= 5; }

  // m5: Device motion present (physical device — very hard to fake)
  if (b.deviceMotionEvents > 0) { signals.push('m5'); score -= 10; }

  // m6: Gyroscope natural tremor (human hand holding phone)
  const gyroSum = (b.gyroAlphaStd || 0) + (b.gyroBetaStd || 0) + (b.gyroGammaStd || 0);
  if (gyroSum >= 0.01) { signals.push('m6'); score -= 10; }

  // m7: Accelerometer natural variation
  const accelSum = (b.accelXStd || 0) + (b.accelYStd || 0) + (b.accelZStd || 0);
  if (accelSum >= 0.01) { signals.push('m7'); score -= 8; }

  // m8: Mobile human trifecta — touch + gyro + accel all natural
  if (b.touchEvents > 0 && gyroSum >= 0.01 && accelSum >= 0.01) {
    signals.push('m8'); score -= 15;
  }

  // m9: Scroll behavior (humans scroll on mobile)
  if (b.scrollEvents > 0 && isMobile) { signals.push('m9'); score -= 5; }

  return { score: Math.max(0, Math.min(100, score)), signals };
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
