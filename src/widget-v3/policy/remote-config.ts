/**
 * HCS-U7 Widget v3 — Remote Config
 * Fetches per-tenant config from backend, caches in memory + localStorage.
 * Falls back to safe defaults on failure.
 */

import { state } from '../core/state';
import { log, logError } from '../core/logger';
import { supportsLocalStorage } from '../core/env';
import { DEFAULT_THRESHOLDS, type Thresholds } from '../risk/thresholds';

export interface RemoteConfig {
  mode: 'monitor' | 'adaptive' | 'enforce';
  thresholds: Thresholds;
  softActions: string[];
  challengeActions: string[];
  bunkerPolicy: { enabled: boolean; ttlSeconds: number };
  sampling: { telemetry: number; fullSignals: number };
  privacy: { maskPII: boolean };
  timeouts: { configMs: number; validateMs: number; pingMs: number };
  ui: { showBadge: boolean; showToastOnChallenge: boolean };
  killSwitch: boolean;
  updatedAt: string;
  ttlSeconds: number;
}

export const SAFE_DEFAULTS: RemoteConfig = {
  mode: 'adaptive',
  thresholds: { ...DEFAULT_THRESHOLDS },
  softActions: ['pow-lite', 'js-attestation', 'silent-retry', 'token-refresh'],
  challengeActions: ['cognitive-lite'],
  bunkerPolicy: { enabled: true, ttlSeconds: 900 },
  sampling: { telemetry: 0.25, fullSignals: 0.10 },
  privacy: { maskPII: true },
  timeouts: { configMs: 4000, validateMs: 5000, pingMs: 2000 },
  ui: { showBadge: false, showToastOnChallenge: true },
  killSwitch: false,
  updatedAt: '',
  ttlSeconds: 300,
};

interface CacheEntry {
  config: RemoteConfig;
  fetchedAt: number;
}

let memoryCache: CacheEntry | null = null;

function cacheKey(): string {
  const wid = state.config.widgetPublicId || state.config.tenantId || 'unknown';
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return 'hcs:cfg:' + wid + ':' + host;
}

function readLocalCache(): CacheEntry | null {
  if (!supportsLocalStorage()) return null;
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry.config || !entry.fetchedAt) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeLocalCache(entry: CacheEntry): void {
  if (!supportsLocalStorage()) return;
  try {
    localStorage.setItem(cacheKey(), JSON.stringify(entry));
  } catch { /* quota exceeded — ignore */ }
}

function isFresh(entry: CacheEntry): boolean {
  const ttl = (entry.config.ttlSeconds || 300) * 1000;
  return Date.now() - entry.fetchedAt < ttl;
}

/**
 * Fetch remote config. Returns cached if fresh, otherwise fetches.
 * On failure, returns safe defaults and logs "config_fetch_failed".
 */
export async function fetchRemoteConfig(): Promise<RemoteConfig> {
  // 1. Check memory cache
  if (memoryCache && isFresh(memoryCache)) {
    log('config', 'Using memory cache');
    return memoryCache.config;
  }

  // 2. Check localStorage cache
  const local = readLocalCache();
  if (local && isFresh(local)) {
    memoryCache = local;
    log('config', 'Using localStorage cache');
    return local.config;
  }

  // 3. Fetch from backend
  const wid = state.config.widgetPublicId;
  const tid = state.config.tenantId;
  if (!wid && !tid) {
    log('config', 'No widgetPublicId or tenantId — using safe defaults');
    return SAFE_DEFAULTS;
  }

  const timeout = (local?.config?.timeouts?.configMs) || SAFE_DEFAULTS.timeouts.configMs;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    // Prefer widgetPublicId, fall back to tenantId (legacy Worker injection)
    const qp = wid
      ? 'widgetPublicId=' + encodeURIComponent(wid)
      : 'tenantId=' + encodeURIComponent(tid!);
    const url = state.config.apiUrl + '/api/widgets/config?' + qp;
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'X-HCS-Widget-Version': state.config.version },
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json() as any;

    // If backend returned widgetPublicId, store it for ping
    if (data.widgetPublicId && !state.config.widgetPublicId) {
      state.config.widgetPublicId = data.widgetPublicId;
      log('config', 'Resolved widgetPublicId from backend: ' + data.widgetPublicId.slice(0, 6) + '...');
    }

    const cfg = data.config || data;

    // Validate essential fields
    if (!cfg.thresholds || typeof cfg.mode !== 'string') {
      throw new Error('Invalid config shape');
    }

    const entry: CacheEntry = { config: cfg, fetchedAt: Date.now() };
    memoryCache = entry;
    writeLocalCache(entry);

    log('config', 'Fetched remote config (mode=' + cfg.mode + ')');
    return cfg;

  } catch (err: any) {
    logError('config_fetch_failed: ' + (err?.message || 'unknown'));

    // Use stale cache if available
    if (local) {
      log('config', 'Using stale localStorage cache as fallback');
      memoryCache = local;
      return local.config;
    }

    log('config', 'No cache — using safe defaults');
    return SAFE_DEFAULTS;
  }
}

/** Force-clear config cache (for testing) */
export function clearConfigCache(): void {
  memoryCache = null;
  if (supportsLocalStorage()) {
    try { localStorage.removeItem(cacheKey()); } catch { /* ignore */ }
  }
}
