/**
 * HCS-U7 API Client
 * Communication avec le backend pour validation
 */

import type { BrowserFingerprint, BotSignals } from './fingerprint';
import type { ChallengeResult } from './challenge-engine';

export interface ValidationRequest {
  tenantId: string;
  fingerprint: BrowserFingerprint;
  botSignals: BotSignals;
  challenge?: ChallengeResult;
  url: string;
  referrer: string;
}

export interface ValidationResponse {
  valid: boolean;
  score: number;
  action: 'allow' | 'block' | 'challenge';
  reason?: string;
  sessionToken?: string;
}

// SECURITY: Cache last successful backend decision (TTL-based)
const DECISION_CACHE_TTL_MS = 60_000; // 1 minute
let lastValidDecision: { response: ValidationResponse; expiry: number } | null = null;

export class HCSApiClient {
  private apiUrl: string;
  private tenantId: string;

  constructor(apiUrl: string, tenantId: string) {
    this.apiUrl = apiUrl;
    this.tenantId = tenantId;
  }

  /**
   * Valide une requête auprès du backend
   * SECURITY: fail-closed — backend down → challenge (never auto-allow)
   */
  async validate(
    fingerprint: BrowserFingerprint,
    botSignals: BotSignals,
    challenge?: ChallengeResult
  ): Promise<ValidationResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5_000);

      const request: ValidationRequest = {
        tenantId: this.tenantId,
        fingerprint,
        botSignals,
        challenge,
        url: window.location.href,
        referrer: document.referrer,
      };

      const response = await fetch(`${this.apiUrl}/widget/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-HCS-Widget-Version': '1.0.0',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Cache successful decisions for short-lived fallback
      if (data.action === 'allow') {
        lastValidDecision = { response: data, expiry: Date.now() + DECISION_CACHE_TTL_MS };
      }

      return data;
    } catch (error) {
      console.error('[HCS-U7] API validation error:', error);

      // SECURITY: fail-closed — if cached allow exists and not expired, use it
      if (lastValidDecision && Date.now() < lastValidDecision.expiry) {
        return { ...lastValidDecision.response, reason: 'cached_decision' };
      }

      // No cache → force challenge (never auto-allow)
      return {
        valid: false,
        score: 0,
        action: 'challenge',
        reason: 'api_unavailable',
      };
    }
  }

  /**
   * Enregistre un événement de sécurité
   */
  async logSecurityEvent(
    eventType: string,
    data: any
  ): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/widget/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId: this.tenantId,
          eventType,
          data,
          timestamp: Date.now(),
          url: window.location.href,
        }),
      });
    } catch (error) {
      // Silent fail pour les logs
      console.debug('[HCS-U7] Log error:', error);
    }
  }

  /**
   * Vérifie le statut du tenant
   */
  async checkTenantStatus(): Promise<{ active: boolean; plan: string }> {
    try {
      const response = await fetch(`${this.apiUrl}/widget/tenant/${this.tenantId}/status`);
      if (!response.ok) {
        throw new Error('Tenant check failed');
      }
      return await response.json();
    } catch (error) {
      console.error('[HCS-U7] Tenant status check error:', error);
      return { active: true, plan: 'unknown' };
    }
  }
}
