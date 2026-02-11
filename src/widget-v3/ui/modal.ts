/**
 * HCS-U7 Widget v3 — Modal utility
 * Generic full-screen modal overlay. Used by challenge and bunker.
 * All UI via textContent, never innerHTML.
 */

import { el, removeById, appendToBody } from '../core/dom';

const MODAL_ID = 'hcs-modal-overlay';

export interface ModalOptions {
  title: string;
  message: string;
  onClose?: () => void;
}

/**
 * Show a simple informational modal.
 */
export function showModal(opts: ModalOptions): void {
  removeById(MODAL_ID);

  const overlay = el('div',
    'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:999999;font-family:system-ui,-apple-system,sans-serif;');
  overlay.id = MODAL_ID;

  const container = el('div',
    'background:white;border-radius:12px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);max-width:420px;width:90%;padding:30px;text-align:center;position:relative;');

  const closeBtn = el('button',
    'position:absolute;top:12px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;padding:4px 8px;',
    '\u00D7');
  closeBtn.addEventListener('click', () => {
    removeById(MODAL_ID);
    opts.onClose?.();
  });

  const title = el('h3', 'margin:0 0 12px 0;color:#1e293b;font-size:18px;', opts.title);
  const message = el('p', 'margin:0;color:#64748b;font-size:14px;line-height:1.5;', opts.message);

  container.appendChild(closeBtn);
  container.appendChild(title);
  container.appendChild(message);
  overlay.appendChild(container);
  appendToBody(overlay);
}

/**
 * Close the modal if open.
 */
export function closeModal(): void {
  removeById(MODAL_ID);
}
