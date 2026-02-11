/**
 * HCS-U7 Widget v3 — Browser fingerprinting
 * Collects browser characteristics for bot scoring.
 */

import { djb2 } from '../utils/crypto';

export interface BrowserFingerprint {
  userAgent: string;
  language: string;
  languages: readonly string[];
  platform: string;
  hardwareConcurrency: number;
  deviceMemory: number | null;
  screenResolution: string;
  colorDepth: number;
  timezone: string;
  timezoneOffset: number;
  webdriver: boolean;
  plugins: number;
  canvas: string;
  webgl: string;
  touchSupport: boolean;
  cookieEnabled: boolean;
  doNotTrack: string | null;
  timestamp: number;
}

export function collectFingerprint(): BrowserFingerprint {
  const nav = navigator as any;
  return {
    userAgent: nav.userAgent || '',
    language: nav.language || '',
    languages: nav.languages || [],
    platform: nav.platform || '',
    hardwareConcurrency: nav.hardwareConcurrency || 0,
    deviceMemory: nav.deviceMemory || null,
    screenResolution: screen.width + 'x' + screen.height,
    colorDepth: screen.colorDepth || 0,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: new Date().getTimezoneOffset(),
    webdriver: !!nav.webdriver,
    plugins: nav.plugins ? nav.plugins.length : 0,
    canvas: getCanvasFingerprint(),
    webgl: getWebGLFingerprint(),
    touchSupport: 'ontouchstart' in window,
    cookieEnabled: !!nav.cookieEnabled,
    doNotTrack: nav.doNotTrack || null,
    timestamp: Date.now(),
  };
}

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    canvas.width = 200;
    canvas.height = 50;
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('HCS-U7', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('HCS-U7', 4, 17);
    return djb2(canvas.toDataURL());
  } catch {
    return '';
  }
}

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return '';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return '';
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    return djb2(vendor + '~' + renderer);
  } catch {
    return '';
  }
}
