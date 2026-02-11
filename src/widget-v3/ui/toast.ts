/**
 * HCS-U7 Widget v3 — Toast notifications
 * Minimal, non-intrusive toast for challenge/soft action feedback.
 * All UI via textContent, never innerHTML.
 */

import { el, appendToBody, removeById } from '../core/dom';
import { state } from '../core/state';

const TOAST_ID = 'hcs-toast';

/**
 * Show a brief toast notification.
 * Auto-dismisses after durationMs.
 */
export function showToast(message: string, type: 'info' | 'warn' | 'error' = 'info', durationMs: number = 3000): void {
  // Respect remote config
  if (!state.remoteConfig?.ui?.showToastOnChallenge && type !== 'error') return;

  removeById(TOAST_ID);

  const bgColor = type === 'error' ? 'rgba(239,68,68,0.95)'
    : type === 'warn' ? 'rgba(245,158,11,0.95)'
    : 'rgba(30,41,59,0.95)';

  const toast = el('div',
    'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:' + bgColor +
    ';color:white;padding:10px 20px;border-radius:8px;font-family:system-ui,-apple-system,sans-serif;font-size:13px;z-index:999999;backdrop-filter:blur(4px);box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;',
    message);
  toast.id = TOAST_ID;

  appendToBody(toast);

  setTimeout(() => {
    const existing = document.getElementById(TOAST_ID);
    if (existing) {
      existing.style.opacity = '0';
      setTimeout(() => removeById(TOAST_ID), 300);
    }
  }, durationMs);
}
