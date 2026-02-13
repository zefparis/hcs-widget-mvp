import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HCSApiClient } from '../src/lib/api-client';

describe('HCSApiClient', () => {
  let client: HCSApiClient;
  const API_URL = 'https://api.hcs-u7.org';
  const TENANT_ID = 'test-tenant-123';

  beforeEach(() => {
    client = new HCSApiClient(API_URL, TENANT_ID);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validate', () => {
    it('sends correct request to backend', async () => {
      const mockResponse = {
        valid: true,
        score: 15,
        action: 'allow' as const,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const fingerprint = {
        userAgent: 'Mozilla/5.0',
        language: 'fr-FR',
        languages: ['fr-FR'],
        platform: 'Win32',
        hardwareConcurrency: 8,
        deviceMemory: 8,
        screenResolution: '1920x1080',
        colorDepth: 24,
        timezone: 'Europe/Paris',
        timezoneOffset: -60,
        webdriver: false,
        plugins: 3,
        canvas: 'abc123',
        webgl: 'def456',
        touchSupport: false,
        cookieEnabled: true,
        doNotTrack: null,
        timestamp: Date.now(),
      };

      const botSignals = { score: 0, signals: [], suspicious: false };

      const result = await client.validate(fingerprint, botSignals);

      expect(fetch).toHaveBeenCalledOnce();
      const [url, options] = (fetch as any).mock.calls[0];
      expect(url).toBe(`${API_URL}/widget/validate`);
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['X-HCS-Widget-Version']).toBe('1.0.0');

      const body = JSON.parse(options.body);
      expect(body.tenantId).toBe(TENANT_ID);
      expect(body.fingerprint).toEqual(fingerprint);
      expect(body.botSignals).toEqual(botSignals);

      expect(result).toEqual(mockResponse);
    });

    it('returns fail-open response on API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const fingerprint = {} as any;
      const botSignals = { score: 0, signals: [], suspicious: false };

      const result = await client.validate(fingerprint, botSignals);

      expect(result.valid).toBe(true);
      expect(result.action).toBe('allow');
      expect(result.reason).toBe('api_error');
    });

    it('returns fail-open response on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const fingerprint = {} as any;
      const botSignals = { score: 0, signals: [], suspicious: false };

      const result = await client.validate(fingerprint, botSignals);

      expect(result.valid).toBe(true);
      expect(result.action).toBe('allow');
      expect(result.reason).toBe('api_error');
    });

    it('includes challenge result when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ valid: true, score: 5, action: 'allow' }),
      });

      const fingerprint = {} as any;
      const botSignals = { score: 0, signals: [], suspicious: false };
      const challenge = { type: 'slider', success: true, duration: 1500, data: { value: 50 } };

      await client.validate(fingerprint, botSignals, challenge);

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.challenge).toEqual(challenge);
    });
  });

  describe('logSecurityEvent', () => {
    it('sends log event to backend silently', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      await client.logSecurityEvent('devtools_detected', { timestamp: 123 });

      expect(fetch).toHaveBeenCalledOnce();
      const [url, options] = (fetch as any).mock.calls[0];
      expect(url).toBe(`${API_URL}/widget/log`);
      const body = JSON.parse(options.body);
      expect(body.tenantId).toBe(TENANT_ID);
      expect(body.eventType).toBe('devtools_detected');
    });

    it('does not throw on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('fail'));

      // Should not throw
      await expect(client.logSecurityEvent('test', {})).resolves.toBeUndefined();
    });
  });

  describe('checkTenantStatus', () => {
    it('returns tenant status from backend', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ active: true, plan: 'PRO' }),
      });

      const result = await client.checkTenantStatus();
      expect(result.active).toBe(true);
      expect(result.plan).toBe('PRO');
    });

    it('returns default on error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('fail'));

      const result = await client.checkTenantStatus();
      expect(result.active).toBe(true);
      expect(result.plan).toBe('unknown');
    });
  });
});
