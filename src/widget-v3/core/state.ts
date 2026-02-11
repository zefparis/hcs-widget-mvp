/**
 * HCS-U7 Widget v3 — Global state
 * Single source of truth for widget runtime state.
 */

import type { RemoteConfig } from '../policy/remote-config';
import type { RiskBreakdown } from '../risk/types';

export type Decision = 'allow' | 'soft' | 'challenge' | 'hard_challenge' | 'bunker' | 'block';

export interface WidgetConfig {
  apiUrl: string;
  version: string;
  debug: boolean;
  env: string;
  token: string | null;
  tenantId: string | null;
  widgetPublicId: string | null;
  tokenPayload: TokenPayload | null;
}

export interface TokenPayload {
  tid: string;
  exp: number;
  v: number;
  dbg?: boolean;
  env?: string;
}

export interface ValidationResult {
  action: string;
  token?: string;
  expiresIn?: number;
  serverRisk?: number;
  flags?: string[];
  reason?: string;
  score?: number;
}

export interface WidgetState {
  config: WidgetConfig;
  remoteConfig: RemoteConfig | null;
  sessionValidated: boolean;
  sessionToken: string | null;
  lastDecision: Decision | null;
  lastRisk: RiskBreakdown | null;
  lastValidation: ValidationResult | null;
  lastSeen: number;
  degraded: boolean;
  ready: boolean;
  bunkerActive: boolean;
  emaScore: number;
}

const DEFAULT_API_URL = 'https://api.hcs-u7.org';

export const state: WidgetState = {
  config: {
    apiUrl: DEFAULT_API_URL,
    version: '3.0.0',
    debug: false,
    env: 'production',
    token: null,
    tenantId: null,
    widgetPublicId: null,
    tokenPayload: null,
  },
  remoteConfig: null,
  sessionValidated: false,
  sessionToken: null,
  lastDecision: null,
  lastRisk: null,
  lastValidation: null,
  lastSeen: 0,
  degraded: false,
  ready: false,
  bunkerActive: false,
  emaScore: 0,
};
