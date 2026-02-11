/**
 * HCS-U7 Widget v3 — Challenge actions
 * Minimal friction challenges: cognitive-lite, voice (if enabled).
 * All UI via DOM API + textContent, never innerHTML.
 */

import { state } from '../core/state';
import { log } from '../core/logger';
import { el, append, removeById, appendToBody } from '../core/dom';

const OVERLAY_ID = 'hcs-challenge-overlay';

/**
 * Execute a challenge. Returns true if passed, false if failed.
 * @param hard  If true, use harder challenge variant
 */
export async function executeChallenge(hard: boolean = false): Promise<boolean> {
  const actions = hard
    ? (state.remoteConfig?.challengeActions ?? ['cognitive-lite'])
    : ['cognitive-lite'];

  log('action', (hard ? 'HARD_' : '') + 'CHALLENGE — actions: ' + actions.join(', '));

  for (const action of actions) {
    switch (action) {
      case 'cognitive-lite':
        return cognitiveLite();
      case 'voice-if-enabled':
        // Voice challenge only if explicitly enabled in remote config
        if (state.remoteConfig?.challengeActions?.includes('voice-if-enabled')) {
          log('challenge', 'Voice challenge not yet implemented — falling back to cognitive-lite');
        }
        return cognitiveLite();
      default:
        log('challenge', 'Unknown challenge action: ' + action);
        return cognitiveLite();
    }
  }

  return true; // No actions configured = pass
}

/**
 * Cognitive-lite: slider challenge (move to target value).
 * Short, minimal friction, accessible.
 */
function cognitiveLite(): Promise<boolean> {
  return new Promise((resolve) => {
    removeById(OVERLAY_ID);

    const targetValue = 30 + Math.floor(Math.random() * 40); // 30-70
    const tolerance = 5;
    const startTime = Date.now();

    // Overlay
    const overlay = el('div', 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999999;');
    overlay.id = OVERLAY_ID;

    // Container
    const container = el('div', 'background:white;border-radius:12px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);max-width:420px;width:90%;padding:30px;text-align:center;');

    // Title
    const title = el('h3', 'margin:0 0 12px 0;color:#1e293b;font-family:system-ui,-apple-system,sans-serif;font-size:18px;', 'Human Verification');

    // Instruction
    const instruction = el('p', 'margin:0 0 20px 0;color:#64748b;font-size:14px;font-family:system-ui,-apple-system,sans-serif;',
      'Move the slider to ' + targetValue);

    // Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = '0';
    slider.style.cssText = 'width:100%;margin:16px 0;cursor:pointer;';

    // Value display
    const valueDisplay = el('div', 'font-size:28px;font-weight:bold;color:#3b82f6;font-family:system-ui,-apple-system,sans-serif;margin-bottom:16px;', '0');

    // Submit button
    const submitBtn = el('button', 'padding:10px 30px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-size:15px;font-family:system-ui,-apple-system,sans-serif;font-weight:600;', 'Validate');

    // Branding
    const branding = el('p', 'color:#cbd5e1;font-size:10px;margin-top:16px;margin-bottom:0;font-family:system-ui,-apple-system,sans-serif;', 'Protected by HCS-U7');

    slider.addEventListener('input', () => {
      valueDisplay.textContent = slider.value;
    });

    submitBtn.addEventListener('click', () => {
      const value = parseInt(slider.value, 10);
      const success = Math.abs(value - targetValue) <= tolerance;
      const duration = Date.now() - startTime;

      log('challenge', 'Cognitive-lite result: ' + (success ? 'PASS' : 'FAIL') +
        ' (value=' + value + ', target=' + targetValue + ', duration=' + duration + 'ms)');

      removeById(OVERLAY_ID);
      resolve(success);
    });

    append(container, title, instruction, slider, valueDisplay, submitBtn, branding);
    overlay.appendChild(container);
    appendToBody(overlay);
  });
}
