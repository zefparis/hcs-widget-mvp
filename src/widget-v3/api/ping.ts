/**
 * HCS-U7 Widget v3 — Widget ping
 * Silent heartbeat to backend. No domain in body (backend reads Origin/Referer).
 */

import { state } from '../core/state';
import { log } from '../core/logger';
import { safeFetch } from './client';
import { rateAllow } from '../utils/rate-limit';

/**
 * Send a silent ping to the backend.
 * Rate-limited to 1 per 30 seconds per page load.
 * Body contains only widgetPublicId — no domain, no secrets.
 */
export async function sendPing(): Promise<void> {
  const wid = state.config.widgetPublicId;
  if (!wid) return;

  if (!rateAllow('ping', 1, 30_000)) {
    log('ping', 'Rate limited — skipping');
    return;
  }

  const timeout = state.remoteConfig?.timeouts?.pingMs ?? 3000;

  const ok = await safeFetch('/api/widgets/ping', {
    method: 'POST',
    body: { widgetPublicId: wid },
    timeoutMs: timeout,
  });

  if (!ok && typeof document !== 'undefined') {
    try {
      const url =
        state.config.apiUrl +
        '/api/widgets/ping.gif?widgetPublicId=' +
        encodeURIComponent(wid) +
        '&_=' +
        Date.now();
      const img = new Image();
      img.src = url;
    } catch {
      // silent
    }
  }

  log('ping', 'Sent');
}
