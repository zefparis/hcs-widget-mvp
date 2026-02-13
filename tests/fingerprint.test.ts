import { describe, it, expect, beforeEach, vi } from 'vitest';
import { collectFingerprint, analyzeBotSignals, type BrowserFingerprint } from '../src/lib/fingerprint';

// Mock browser APIs
beforeEach(() => {
  // Reset mocks
  vi.restoreAllMocks();

  // Mock navigator
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      language: 'fr-FR',
      languages: ['fr-FR', 'en-US'],
      platform: 'Win32',
      hardwareConcurrency: 8,
      deviceMemory: 8,
      webdriver: false,
      plugins: { length: 3 },
      cookieEnabled: true,
      doNotTrack: null,
    },
    writable: true,
    configurable: true,
  });

  // Mock screen
  Object.defineProperty(globalThis, 'screen', {
    value: { width: 1920, height: 1080, colorDepth: 24 },
    writable: true,
    configurable: true,
  });

  // Mock Intl
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
    resolvedOptions: () => ({ timeZone: 'Europe/Paris' }),
  } as any);
});

// ─── collectFingerprint ─────────────────────────────────────────────────────

describe('collectFingerprint', () => {
  it('returns all required fields', () => {
    const fp = collectFingerprint();
    expect(fp).toHaveProperty('userAgent');
    expect(fp).toHaveProperty('language');
    expect(fp).toHaveProperty('languages');
    expect(fp).toHaveProperty('platform');
    expect(fp).toHaveProperty('hardwareConcurrency');
    expect(fp).toHaveProperty('screenResolution');
    expect(fp).toHaveProperty('colorDepth');
    expect(fp).toHaveProperty('timezone');
    expect(fp).toHaveProperty('webdriver');
    expect(fp).toHaveProperty('canvas');
    expect(fp).toHaveProperty('webgl');
    expect(fp).toHaveProperty('touchSupport');
    expect(fp).toHaveProperty('cookieEnabled');
    expect(fp).toHaveProperty('timestamp');
  });

  it('captures correct navigator values', () => {
    const fp = collectFingerprint();
    expect(fp.language).toBe('fr-FR');
    expect(fp.languages).toEqual(['fr-FR', 'en-US']);
    expect(fp.hardwareConcurrency).toBe(8);
    expect(fp.webdriver).toBe(false);
  });

  it('captures screen resolution', () => {
    const fp = collectFingerprint();
    expect(fp.screenResolution).toBe('1920x1080');
    expect(fp.colorDepth).toBe(24);
  });

  it('captures timezone', () => {
    const fp = collectFingerprint();
    expect(fp.timezone).toBe('Europe/Paris');
  });

  it('includes a recent timestamp', () => {
    const before = Date.now();
    const fp = collectFingerprint();
    const after = Date.now();
    expect(fp.timestamp).toBeGreaterThanOrEqual(before);
    expect(fp.timestamp).toBeLessThanOrEqual(after);
  });
});

// ─── analyzeBotSignals ──────────────────────────────────────────────────────

describe('analyzeBotSignals', () => {
  function makeFingerprint(overrides: Partial<BrowserFingerprint> = {}): BrowserFingerprint {
    return {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      language: 'fr-FR',
      languages: ['fr-FR', 'en-US'],
      platform: 'Win32',
      hardwareConcurrency: 8,
      deviceMemory: 8,
      screenResolution: '1920x1080',
      colorDepth: 24,
      timezone: 'Europe/Paris',
      timezoneOffset: -60,
      webdriver: false,
      plugins: 3,
      canvas: 'abcdefghijklmnop',
      webgl: 'abcdefghijklmnop',
      touchSupport: false,
      cookieEnabled: true,
      doNotTrack: null,
      timestamp: Date.now(),
      ...overrides,
    };
  }

  it('returns low score for a legitimate browser', () => {
    const result = analyzeBotSignals(makeFingerprint());
    expect(result.score).toBeLessThan(50);
    expect(result.suspicious).toBe(false);
    expect(result.signals).toHaveLength(0);
  });

  it('detects webdriver (automation)', () => {
    const result = analyzeBotSignals(makeFingerprint({ webdriver: true }));
    expect(result.signals).toContain('webdriver_detected');
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.suspicious).toBe(true);
  });

  it('detects headless browser (no plugins)', () => {
    const result = analyzeBotSignals(makeFingerprint({ plugins: 0 }));
    expect(result.signals).toContain('no_plugins');
    expect(result.score).toBeGreaterThanOrEqual(20);
  });

  it('detects suspicious user agent', () => {
    const uas = ['HeadlessChrome', 'PhantomJS', 'Selenium', 'puppeteer/1.0', 'Googlebot', 'crawler'];
    for (const ua of uas) {
      const result = analyzeBotSignals(makeFingerprint({ userAgent: ua }));
      expect(result.signals).toContain('suspicious_user_agent');
    }
  });

  it('detects no languages configured', () => {
    const result = analyzeBotSignals(makeFingerprint({ languages: [] }));
    expect(result.signals).toContain('no_languages');
  });

  it('detects abnormal hardware concurrency', () => {
    const zero = analyzeBotSignals(makeFingerprint({ hardwareConcurrency: 0 }));
    expect(zero.signals).toContain('abnormal_hardware');
    const high = analyzeBotSignals(makeFingerprint({ hardwareConcurrency: 64 }));
    expect(high.signals).toContain('abnormal_hardware');
  });

  it('detects invalid canvas fingerprint', () => {
    const result = analyzeBotSignals(makeFingerprint({ canvas: '' }));
    expect(result.signals).toContain('invalid_canvas');
  });

  it('detects invalid webgl fingerprint', () => {
    const result = analyzeBotSignals(makeFingerprint({ webgl: '' }));
    expect(result.signals).toContain('invalid_webgl');
  });

  it('detects disabled cookies', () => {
    const result = analyzeBotSignals(makeFingerprint({ cookieEnabled: false }));
    expect(result.signals).toContain('cookies_disabled');
  });

  it('detects UTC timezone (common for bots)', () => {
    const result = analyzeBotSignals(makeFingerprint({ timezone: 'UTC', timezoneOffset: 0 }));
    expect(result.signals).toContain('utc_timezone');
  });

  it('caps score at 100', () => {
    const result = analyzeBotSignals(makeFingerprint({
      webdriver: true,
      plugins: 0,
      userAgent: 'HeadlessChrome bot',
      languages: [],
      hardwareConcurrency: 0,
      canvas: '',
      webgl: '',
      cookieEnabled: false,
      timezone: 'UTC',
      timezoneOffset: 0,
    }));
    expect(result.score).toBe(100);
    expect(result.suspicious).toBe(true);
  });

  it('accumulates multiple signals', () => {
    const result = analyzeBotSignals(makeFingerprint({
      webdriver: true,
      plugins: 0,
    }));
    expect(result.signals).toContain('webdriver_detected');
    expect(result.signals).toContain('no_plugins');
    expect(result.score).toBeGreaterThanOrEqual(70);
  });
});
