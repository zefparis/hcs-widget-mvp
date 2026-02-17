/**
 * HCS-U7 Widget v3 — HTTP client
 * Centralized fetch wrapper with timeouts and fail-safe.
 */

import { state } from '../core/state';
import { log, logError } from '../core/logger';

export interface FetchOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * Fetch with timeout and fail-safe error handling.
 * Returns null on failure (never throws).
 */
export async function safeFetch<T>(
  path: string,
  opts: FetchOptions = {}
): Promise<T | null> {
  const url = state.config.apiUrl + path;
  const timeout = opts.timeoutMs ?? 5000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const headers: Record<string, string> = {
      'X-HCS-Widget-Version': state.config.version,
      ...(opts.headers || {}),
    };

    if (opts.body) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
      method: opts.method || 'GET',
      signal: controller.signal,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    clearTimeout(timer);

    if (!res.ok) {
      log('api', 'HTTP ' + res.status + ' from ' + path);
      return null;
    }

    // Some endpoints return 204 (no content)
    if (res.status === 204) return null;

    return (await res.json()) as T;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      logError('Timeout (' + timeout + 'ms) on ' + path);
    } else {
      log('api', 'Fetch error on ' + path + ': ' + (err?.message || 'unknown'));
    }
    return null;
  }
}
