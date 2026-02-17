/**
 * HCS-U7 Widget v3 — E2E Tests: Security Headers
 * Verifies CSP, HSTS, Permissions-Policy, and other security headers are correctly set.
 */

import { test, expect } from '@playwright/test';

test.describe('Security Headers', () => {
  test('CSP header is present and correct', async ({ page }) => {
    const response = await page.goto('/widget/v3/demo.html');
    const headers = response!.headers();

    const csp = headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain('connect-src');
    expect(csp).toContain('https://api.hcs-u7.org');
    expect(csp).toContain("frame-ancestors *");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  test('CSP does not allow unsafe-eval', async ({ page }) => {
    const response = await page.goto('/widget/v3/demo.html');
    const csp = response!.headers()['content-security-policy'];

    expect(csp).not.toContain('unsafe-eval');
  });

  test('HSTS header is present', async ({ page }) => {
    const response = await page.goto('/widget/v3/demo.html');
    const hsts = response!.headers()['strict-transport-security'];

    expect(hsts).toBeDefined();
    expect(hsts).toContain('max-age=');
    expect(hsts).toContain('includeSubDomains');
  });

  test('X-Content-Type-Options is nosniff', async ({ page }) => {
    const response = await page.goto('/widget/v3/demo.html');
    expect(response!.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('Referrer-Policy is set', async ({ page }) => {
    const response = await page.goto('/widget/v3/demo.html');
    expect(response!.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('Permissions-Policy allows gyroscope and accelerometer', async ({ page }) => {
    const response = await page.goto('/widget/v3/demo.html');
    const pp = response!.headers()['permissions-policy'];

    expect(pp).toBeDefined();
    // Must allow gyroscope + accelerometer for device motion bot detection
    expect(pp).toContain('gyroscope=(self)');
    expect(pp).toContain('accelerometer=(self)');
    // Must block dangerous APIs
    expect(pp).toContain('camera=()');
    expect(pp).toContain('microphone=()');
    expect(pp).toContain('geolocation=()');
    expect(pp).toContain('payment=()');
    expect(pp).toContain('usb=()');
  });

  test('API routes have restrictive CSP', async ({ page }) => {
    const response = await page.goto('/api/health', { waitUntil: 'commit' });
    if (response && response.status() !== 404) {
      const csp = response.headers()['content-security-policy'];
      if (csp) {
        expect(csp).toContain("default-src 'none'");
      }
    }
  });

  test('no CSP violations on demo page', async ({ page }) => {
    const violations: string[] = [];

    page.on('console', (msg) => {
      if (msg.text().includes('[Report Only]') || msg.text().includes('Content Security Policy')) {
        violations.push(msg.text());
      }
    });

    await page.goto('/widget/v3/demo.html');
    await page.waitForTimeout(3000);

    // No CSP violation console messages
    expect(violations).toEqual([]);
  });
});
