/**
 * HCS-U7 Widget v3 — Debug badge
 * Small semi-transparent badge in bottom-right corner.
 * Only shown if debug=true in remote config + token debug.
 */

import { state } from '../core/state';
import { isDebug } from '../core/logger';
import { el, appendToBody, removeById } from '../core/dom';

const BADGE_ID = 'hcs-debug-badge';
const SCORE_ID = 'hcs-debug-score';

export function showBadge(): void {
  if (!isDebug()) return;
  if (!state.remoteConfig?.ui?.showBadge && !state.config.debug) return;

  removeById(BADGE_ID);

  const badge = el('div',
    'position:fixed;bottom:10px;right:10px;background:rgba(30,41,59,0.8);color:#e2e8f0;padding:6px 12px;border-radius:8px;font-family:system-ui,-apple-system,sans-serif;font-size:11px;z-index:999998;cursor:pointer;user-select:none;backdrop-filter:blur(4px);border:1px solid rgba(148,163,184,0.2);');
  badge.id = BADGE_ID;

  const label = el('span', 'font-weight:600;', '\uD83D\uDEE1\uFE0F HCS Debug ');
  const scoreSpan = el('span', 'margin-left:4px;', '...');
  scoreSpan.id = SCORE_ID;

  badge.appendChild(label);
  badge.appendChild(scoreSpan);

  badge.addEventListener('click', () => {
    console.group('[HCS-U7] Debug Details');
    console.log('Version:', state.config.version);
    console.log('Decision:', state.lastDecision);
    console.log('Risk:', state.lastRisk);
    console.log('Validation:', state.lastValidation);
    console.log('Degraded:', state.degraded);
    console.log('Remote config:', state.remoteConfig?.mode);
    console.groupEnd();
  });

  appendToBody(badge);
}

export function updateBadge(score: number, decision: string): void {
  if (!isDebug()) return;
  const scoreEl = document.getElementById(SCORE_ID);
  if (!scoreEl) return;

  const color = decision === 'allow' ? '#4ade80'
    : decision === 'soft' ? '#a3e635'
    : decision === 'challenge' || decision === 'hard_challenge' ? '#fbbf24'
    : decision === 'bunker' ? '#f97316'
    : '#f87171';

  const icon = decision === 'allow' ? '\u2705'
    : decision === 'soft' ? '\uD83D\uDFE2'
    : decision === 'challenge' || decision === 'hard_challenge' ? '\u26A0\uFE0F'
    : decision === 'bunker' ? '\uD83D\uDEE1\uFE0F'
    : '\u274C';

  scoreEl.textContent = icon + ' ' + Math.round(score);
  scoreEl.style.color = color;
}
