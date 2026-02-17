/**
 * HCS-U7 Widget v3 — Block action
 * Replaces page content with a block message.
 * All UI via textContent, never innerHTML.
 */

import { log } from '../core/logger';
import { el, append } from '../core/dom';
import { t } from '../core/i18n';

/**
 * Block access and show a full-page block screen.
 * @param reason  Safe string reason (sanitized via textContent)
 */
export function executeBlock(reason: string): void {
  log('action', 'BLOCK — reason: ' + reason);

  const wrapper = el('div',
    'display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif;');

  const inner = el('div', 'text-align:center;max-width:500px;padding:40px;');
  const icon = el('div', 'font-size:64px;margin-bottom:20px;', '\uD83D\uDEE1\uFE0F');
  const h1 = el('h1', 'color:#1e293b;margin:0 0 10px 0;font-size:24px;', t('blockTitle'));
  const p1 = el('p', 'color:#64748b;margin:0 0 20px 0;font-size:15px;',
    t('blockMessage'));
  const p2 = el('p', 'color:#94a3b8;font-size:13px;',
    t('blockReason') + (typeof reason === 'string' ? reason : 'Unknown'));
  const p3 = el('p', 'color:#94a3b8;font-size:11px;margin-top:30px;',
    t('blockBranding'));

  append(inner, icon, h1, p1, p2, p3);
  wrapper.appendChild(inner);

  document.body.textContent = '';
  document.body.appendChild(wrapper);
}
