import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { detectDevTools, isDevToolsOpen, resetDevToolsDetection } from '../src/lib/devtools-detection';

describe('devtools-detection', () => {
  beforeEach(() => {
    resetDevToolsDetection();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('detectDevTools', () => {
    it('returns a cleanup function', () => {
      const cleanup = detectDevTools(() => {});
      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('detects when window outer/inner size difference exceeds threshold', () => {
      const callback = vi.fn();

      // Simulate DevTools open: outerWidth - innerWidth > 160
      Object.defineProperty(window, 'outerWidth', { value: 1400, configurable: true });
      Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
      Object.defineProperty(window, 'outerHeight', { value: 900, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });

      const cleanup = detectDevTools(callback);
      expect(callback).toHaveBeenCalledTimes(1);
      cleanup();
    });

    it('does not trigger when size difference is below threshold', () => {
      const callback = vi.fn();

      Object.defineProperty(window, 'outerWidth', { value: 1400, configurable: true });
      Object.defineProperty(window, 'innerWidth', { value: 1350, configurable: true });
      Object.defineProperty(window, 'outerHeight', { value: 900, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 870, configurable: true });

      const cleanup = detectDevTools(callback);
      expect(callback).not.toHaveBeenCalled();
      cleanup();
    });

    it('only triggers callback once', () => {
      const callback = vi.fn();

      Object.defineProperty(window, 'outerWidth', { value: 1400, configurable: true });
      Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
      Object.defineProperty(window, 'outerHeight', { value: 900, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });

      const cleanup = detectDevTools(callback);
      // Advance timer to trigger interval check
      vi.advanceTimersByTime(4000);
      expect(callback).toHaveBeenCalledTimes(1);
      cleanup();
    });
  });

  describe('isDevToolsOpen', () => {
    it('returns false initially', () => {
      expect(isDevToolsOpen()).toBe(false);
    });

    it('returns true after detection', () => {
      Object.defineProperty(window, 'outerWidth', { value: 1400, configurable: true });
      Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
      Object.defineProperty(window, 'outerHeight', { value: 900, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });

      const cleanup = detectDevTools(() => {});
      expect(isDevToolsOpen()).toBe(true);
      cleanup();
    });
  });

  describe('resetDevToolsDetection', () => {
    it('resets the detection state', () => {
      Object.defineProperty(window, 'outerWidth', { value: 1400, configurable: true });
      Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
      Object.defineProperty(window, 'outerHeight', { value: 900, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });

      const cleanup = detectDevTools(() => {});
      expect(isDevToolsOpen()).toBe(true);
      
      resetDevToolsDetection();
      expect(isDevToolsOpen()).toBe(false);
      cleanup();
    });
  });
});
