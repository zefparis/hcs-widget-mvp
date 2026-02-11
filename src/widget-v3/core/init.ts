/**
 * HCS-U7 Widget v3 — Initialization
 * Reads config from script tag attributes or window globals.
 * Backwards compatible: data-widget, data-tenant, window.HCS_TENANT_ID
 */

import { state, type TokenPayload } from './state';
import { base64urlDecode, maskId } from '../utils/crypto';
import { log, logError, setDebug } from './logger';

/** Parse a signed widget token (payload.signature format) */
function parseToken(token: string): TokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const decoded = base64urlDecode(parts[0]);
  if (!decoded) return null;
  try {
    const payload = JSON.parse(decoded) as TokenPayload;
    if (!payload.tid || !payload.exp || !payload.v) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Check if a value looks like a legacy raw tenant ID (UUID/CUID) */
function isLegacyTenantId(value: string): boolean {
  if (!value || value.includes('.')) return false;
  if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(value)) return true;
  if (/^c[a-z0-9]{20,30}$/.test(value)) return true;
  return false;
}

/**
 * Initialize widget config from script tag or globals.
 * Returns true if config is valid, false otherwise.
 */
export function initConfig(): boolean {
  const cfg = state.config;

  // Find our script tag
  const scripts = document.querySelectorAll(
    'script[data-widget], script[data-tenant], script[src*="hcs-widget"]'
  );
  let scriptTag: Element | null = null;

  for (let i = 0; i < scripts.length; i++) {
    if (
      scripts[i].getAttribute('data-widget') ||
      scripts[i].getAttribute('data-tenant') ||
      (scripts[i].getAttribute('src') || '').indexOf('hcs-widget') !== -1
    ) {
      scriptTag = scripts[i];
      break;
    }
  }

  // Mode 0: data-widget (v3/v2.1 enterprise — widgetPublicId)
  if (scriptTag && scriptTag.getAttribute('data-widget')) {
    cfg.widgetPublicId = scriptTag.getAttribute('data-widget');
    // data-tenant is optional alongside data-widget
    const tv = scriptTag.getAttribute('data-tenant');
    if (tv) {
      if (isLegacyTenantId(tv)) {
        cfg.tenantId = tv;
      } else {
        const p = parseToken(tv);
        if (p) {
          cfg.token = tv;
          cfg.tokenPayload = p;
          cfg.tenantId = p.tid;
        }
      }
    }
    log('init', 'Widget public ID from data-widget');
  }
  // Mode 1: data-tenant (v2 recommended)
  else if (scriptTag && scriptTag.getAttribute('data-tenant')) {
    const tokenValue = scriptTag.getAttribute('data-tenant')!;
    if (isLegacyTenantId(tokenValue)) {
      cfg.tenantId = tokenValue;
      cfg.token = null;
      log('init', 'Legacy tenant ID from data-tenant');
    } else {
      const payload = parseToken(tokenValue);
      if (payload) {
        cfg.token = tokenValue;
        cfg.tokenPayload = payload;
        cfg.tenantId = payload.tid;
        if (payload.dbg) cfg.debug = true;
        if (payload.env) cfg.env = payload.env;
        log('init', 'Signed token parsed, tenant: ' + maskId(payload.tid));
      } else {
        logError('Invalid data-tenant token format');
        return false;
      }
    }
  }
  // Mode 2: window.HCS_TENANT_ID (v1 legacy)
  else if ((window as any).HCS_TENANT_ID) {
    cfg.tenantId = (window as any).HCS_TENANT_ID;
    cfg.token = null;
    log('init', 'Legacy window.HCS_TENANT_ID mode');
  }
  // No config found
  else {
    logError('Missing data-widget, data-tenant, or window.HCS_TENANT_ID');
    return false;
  }

  // Read optional data attributes
  if (scriptTag) {
    if (scriptTag.getAttribute('data-debug') === 'true') {
      cfg.debug = true;
    }
    if (scriptTag.getAttribute('data-env')) {
      cfg.env = scriptTag.getAttribute('data-env')!;
    }
    if (scriptTag.getAttribute('data-api')) {
      cfg.apiUrl = scriptTag.getAttribute('data-api')!;
    }
  }

  // Apply debug setting
  setDebug(cfg.debug);

  log('init', 'Widget v' + cfg.version + ' | tenant: ' + maskId(cfg.tenantId) +
    ' | mode: ' + (cfg.token ? 'signed_token' : 'legacy'));

  return true;
}
