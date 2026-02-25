/**
 * HCS-U7 Widget v3 — "Protected by HCS-U7" badge + info card
 * Always visible on all protected sites (bottom-right corner).
 * Click opens info card with description, metrics, and CTA.
 * Does not interfere with auth flow (challenge/bunker overlays).
 *
 * @copyright (c) 2025-2026 Benjamin BARRERE / IA SOLUTION
 * @license Patents Pending FR2514274 | FR2514546
 */

import { state } from '../core/state';
import { isDebug } from '../core/logger';
import { appendToBody, removeById } from '../core/dom';
import { t } from '../core/i18n';

const BADGE_ID = 'hcs-u7-badge';
const CARD_ID = 'hcs-u7-card';
const ACCENT = '#6366f1';
const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";

// ── SVG shield icon (inline, no external dependency) ──
const SHIELD_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + ACCENT + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4" stroke="' + ACCENT + '"/></svg>';

// ── Helpers ──
function css(styles: Record<string, string>): string {
  let s = '';
  for (const k in styles) s += k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()) + ':' + styles[k] + ';';
  return s;
}

function div(id: string, styleObj: Record<string, string>): HTMLDivElement {
  const d = document.createElement('div');
  d.id = id;
  d.style.cssText = css(styleObj);
  return d;
}

function span(text: string, styleObj: Record<string, string>): HTMLSpanElement {
  const s = document.createElement('span');
  s.textContent = text;
  s.style.cssText = css(styleObj);
  return s;
}

let cardVisible = false;

// ── Badge (always visible) ──
export function showBadge(): void {
  removeById(BADGE_ID);
  removeById(CARD_ID);

  const badge = div(BADGE_ID, {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    width: '36px',
    height: '36px',
    background: 'rgba(15,23,42,0.45)',
    borderRadius: '50%',
    zIndex: '2147483646',
    cursor: 'pointer',
    userSelect: 'none',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(99,102,241,0.15)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.3s, transform 0.3s, box-shadow 0.2s, border-color 0.2s',
    opacity: '0',
    transform: 'translateY(8px)',
  });

  // Shield icon (slightly larger for standalone display)
  const iconWrap = document.createElement('span');
  iconWrap.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="' + ACCENT + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.85"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4" stroke="' + ACCENT + '"/></svg>';
  iconWrap.style.cssText = 'display:flex;align-items:center;justify-content:center;';

  badge.appendChild(iconWrap);

  // Click → toggle card
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCard();
  });

  // Hover effect
  badge.addEventListener('mouseenter', () => {
    badge.style.border = '1px solid rgba(99,102,241,0.4)';
    badge.style.boxShadow = '0 2px 16px rgba(99,102,241,0.2)';
    badge.style.background = 'rgba(15,23,42,0.6)';
  });
  badge.addEventListener('mouseleave', () => {
    badge.style.border = '1px solid rgba(99,102,241,0.15)';
    badge.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    badge.style.background = 'rgba(15,23,42,0.45)';
  });

  appendToBody(badge);

  // Fade-in animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      badge.style.opacity = '1';
      badge.style.transform = 'translateY(0)';
    });
  });
}

// ── Info card popup ──
function createCard(): HTMLDivElement {
  const card = div(CARD_ID, {
    position: 'fixed',
    bottom: '60px',
    right: '16px',
    width: '320px',
    maxWidth: 'calc(100vw - 32px)',
    background: 'rgba(15,23,42,0.96)',
    color: '#e2e8f0',
    borderRadius: '12px',
    fontFamily: FONT,
    fontSize: '13px',
    lineHeight: '1.5',
    zIndex: '2147483647',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(99,102,241,0.2)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    overflow: 'hidden',
    opacity: '0',
    transform: 'translateY(8px) scale(0.98)',
    transition: 'opacity 0.25s ease, transform 0.25s ease',
  });

  // ── Header ──
  const header = document.createElement('div');
  header.style.cssText = css({
    padding: '16px 16px 12px',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(148,163,184,0.1)',
  });

  const headerLeft = document.createElement('div');
  const shieldLg = document.createElement('span');
  shieldLg.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="' + ACCENT + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4" stroke="' + ACCENT + '"/></svg>';
  shieldLg.style.cssText = 'display:inline-flex;vertical-align:middle;margin-right:8px;';

  const titleText = span(t('cardTitle'), {
    fontWeight: '700',
    fontSize: '14px',
    color: '#f1f5f9',
  });

  headerLeft.appendChild(shieldLg);
  headerLeft.appendChild(titleText);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u2715';
  closeBtn.style.cssText = css({
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '0 0 0 8px',
    lineHeight: '1',
    flexShrink: '0',
  });
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideCard();
  });
  closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#e2e8f0'; });
  closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#64748b'; });

  header.appendChild(headerLeft);
  header.appendChild(closeBtn);

  // ── Body ──
  const body = document.createElement('div');
  body.style.cssText = css({ padding: '14px 16px' });

  const desc = document.createElement('p');
  desc.textContent = t('cardDescription');
  desc.style.cssText = css({
    margin: '0 0 14px 0',
    color: '#94a3b8',
    fontSize: '12.5px',
    lineHeight: '1.6',
  });

  // Metrics bar
  const metrics = document.createElement('div');
  metrics.style.cssText = css({
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    padding: '10px 14px',
    background: 'rgba(74,222,128,0.06)',
    borderRadius: '8px',
    marginBottom: '14px',
    border: '1px solid rgba(74,222,128,0.1)',
  });

  const metricData = [
    { value: t('cardMetricStatusValue'), label: t('cardMetricStatus'), color: '#4ade80' },
    { value: '99.9%', label: t('cardMetricUptime'), color: '#4ade80' },
    { value: '9.7/10', label: t('cardMetricAudit'), color: '#4ade80' },
  ];

  for (const m of metricData) {
    const item = document.createElement('div');
    item.style.cssText = css({ textAlign: 'center', flex: '1', minWidth: '70px' });
    const val = document.createElement('div');
    val.textContent = m.value;
    val.style.cssText = css({ fontWeight: '700', fontSize: '13px', color: m.color });
    const lbl = document.createElement('div');
    lbl.textContent = m.label;
    lbl.style.cssText = css({ fontSize: '10px', color: '#64748b', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' });
    item.appendChild(val);
    item.appendChild(lbl);
    metrics.appendChild(item);
  }

  body.appendChild(desc);
  body.appendChild(metrics);

  // ── Footer: CTA ──
  const footer = document.createElement('div');
  footer.style.cssText = css({
    padding: '0 16px 16px',
  });

  const cta = document.createElement('a');
  cta.href = 'https://hcs-u7.com';
  cta.target = '_blank';
  cta.rel = 'noopener noreferrer';
  cta.textContent = t('cardCta');
  cta.style.cssText = css({
    display: 'block',
    width: '100%',
    textAlign: 'center',
    padding: '10px 0',
    background: ACCENT,
    color: '#ffffff',
    fontWeight: '600',
    fontSize: '13px',
    borderRadius: '8px',
    textDecoration: 'none',
    cursor: 'pointer',
    border: 'none',
    transition: 'background 0.15s',
    boxSizing: 'border-box',
  });
  cta.addEventListener('mouseenter', () => { cta.style.background = '#818cf8'; });
  cta.addEventListener('mouseleave', () => { cta.style.background = ACCENT; });

  footer.appendChild(cta);

  // ── Debug info (only in debug mode) ──
  if (isDebug() || state.config.debug) {
    const debugBar = document.createElement('div');
    debugBar.id = 'hcs-u7-debug-bar';
    debugBar.style.cssText = css({
      padding: '8px 16px',
      borderTop: '1px solid rgba(148,163,184,0.1)',
      fontSize: '10px',
      color: '#475569',
      fontFamily: 'monospace',
    });
    debugBar.textContent = 'v' + state.config.version + ' | mode: ' + (state.remoteConfig?.mode ?? 'n/a');
    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);
    card.appendChild(debugBar);
  } else {
    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);
  }

  // Close on outside click
  const onOutside = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (!card.contains(t) && t.id !== BADGE_ID && !t.closest('#' + BADGE_ID)) {
      hideCard();
      document.removeEventListener('click', onOutside);
    }
  };
  setTimeout(() => document.addEventListener('click', onOutside), 10);

  return card;
}

function toggleCard(): void {
  if (cardVisible) {
    hideCard();
  } else {
    showCard();
  }
}

function showCard(): void {
  removeById(CARD_ID);
  const card = createCard();
  appendToBody(card);
  cardVisible = true;

  // Fade-in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0) scale(1)';
    });
  });
}

function hideCard(): void {
  const card = document.getElementById(CARD_ID);
  if (card) {
    card.style.opacity = '0';
    card.style.transform = 'translateY(8px) scale(0.98)';
    setTimeout(() => removeById(CARD_ID), 250);
  }
  cardVisible = false;
}

// ── Update badge (called after decision pipeline) ──
export function updateBadge(_score: number, _decision: string): void {
  // Production badge doesn't display score — but debug bar updates if visible
  if (isDebug() || state.config.debug) {
    const debugBar = document.getElementById('hcs-u7-debug-bar');
    if (debugBar) {
      const color = _decision === 'allow' ? '#4ade80'
        : _decision === 'soft' ? '#a3e635'
        : _decision === 'challenge' || _decision === 'hard_challenge' ? '#fbbf24'
        : _decision === 'bunker' ? '#f97316'
        : '#f87171';
      debugBar.textContent = 'v' + state.config.version + ' | ' + _decision + ' (' + Math.round(_score) + ') | ' + (state.remoteConfig?.mode ?? 'n/a');
      debugBar.style.color = color;
    }
  }
}
