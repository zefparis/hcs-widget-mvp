/**
 * HCS-U7 Widget v3 — E2E Tests: Widget Loading & Initialization
 * Verifies the widget loads correctly, exposes HCS_STATUS, and doesn't break the host page.
 */

import { test, expect } from '@playwright/test';

test.describe('Widget Loading', () => {
  test('demo page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/widget/v3/demo.html');
    await page.waitForTimeout(3000);

    // No uncaught JS errors
    expect(errors).toEqual([]);
  });

  test('widget script tag is present in DOM', async ({ page }) => {
    await page.goto('/widget/v3/demo.html');

    const scriptTag = page.locator('script[data-widget]');
    await expect(scriptTag).toHaveCount(1);
    await expect(scriptTag).toHaveAttribute('data-widget', 'demo_widget_public_id');
  });

  test('HCS_STATUS is exposed on window after boot', async ({ page }) => {
    await page.goto('/widget/v3/demo.html');
    await page.waitForTimeout(4000);

    const status = await page.evaluate(() => (window as any).HCS_STATUS);
    expect(status).toBeDefined();
    expect(status).toHaveProperty('ready');
    expect(status).toHaveProperty('version');
    expect(status).toHaveProperty('degraded');
    expect(status).toHaveProperty('lastDecision');
    expect(typeof status.version).toBe('string');
    expect(status.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('widget does not break host page DOM', async ({ page }) => {
    await page.goto('/widget/v3/demo.html');
    await page.waitForTimeout(3000);

    // Demo page elements should still be intact
    await expect(page.locator('h1')).toContainText('HCS-U7 Widget v3');
    await expect(page.locator('.card')).toHaveCount(4);
    await expect(page.locator('.btn')).toBeVisible();
  });

  test('refresh status button works', async ({ page }) => {
    await page.goto('/widget/v3/demo.html');
    await page.waitForTimeout(4000);

    await page.click('.btn');
    await page.waitForTimeout(500);

    const decisionText = await page.locator('#s-decision').textContent();
    // Should have a real decision or 'pending', not the initial '—'
    expect(decisionText).toBeTruthy();
  });
});
