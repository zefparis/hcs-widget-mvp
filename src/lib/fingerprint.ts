/**
 * HCS-U7 Browser Fingerprinting
 * Détecte les caractéristiques du navigateur pour scorer les bots
 */

export interface BrowserFingerprint {
  userAgent: string;
  language: string;
  languages: string[];
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

export interface BotSignals {
  score: number; // 0-100 (0 = humain, 100 = bot)
  signals: string[];
  suspicious: boolean;
}

/**
 * Collecte l'empreinte du navigateur
 */
export function collectFingerprint(): BrowserFingerprint {
  const nav = navigator as any;
  
  return {
    userAgent: nav.userAgent || '',
    language: nav.language || '',
    languages: nav.languages || [],
    platform: nav.platform || '',
    hardwareConcurrency: nav.hardwareConcurrency || 0,
    deviceMemory: nav.deviceMemory || null,
    screenResolution: `${screen.width}x${screen.height}`,
    colorDepth: screen.colorDepth || 0,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: new Date().getTimezoneOffset(),
    webdriver: nav.webdriver || false,
    plugins: nav.plugins?.length || 0,
    canvas: getCanvasFingerprint(),
    webgl: getWebGLFingerprint(),
    touchSupport: 'ontouchstart' in window,
    cookieEnabled: nav.cookieEnabled || false,
    doNotTrack: nav.doNotTrack || null,
    timestamp: Date.now(),
  };
}

/**
 * Analyse l'empreinte et détecte les signaux de bot
 */
export function analyzeBotSignals(fingerprint: BrowserFingerprint): BotSignals {
  const signals: string[] = [];
  let score = 0;

  // 1. WebDriver détecté (bot automation)
  if (fingerprint.webdriver) {
    signals.push('webdriver_detected');
    score += 50;
  }

  // 2. Pas de plugins (headless browser)
  if (fingerprint.plugins === 0) {
    signals.push('no_plugins');
    score += 20;
  }

  // 3. User agent suspect
  const suspiciousUA = [
    'headless',
    'phantom',
    'selenium',
    'puppeteer',
    'bot',
    'crawler',
    'spider',
  ];
  if (suspiciousUA.some(ua => fingerprint.userAgent.toLowerCase().includes(ua))) {
    signals.push('suspicious_user_agent');
    score += 40;
  }

  // 4. Pas de langues configurées
  if (fingerprint.languages.length === 0) {
    signals.push('no_languages');
    score += 15;
  }

  // 5. Hardware concurrency anormal
  if (fingerprint.hardwareConcurrency === 0 || fingerprint.hardwareConcurrency > 32) {
    signals.push('abnormal_hardware');
    score += 10;
  }

  // 6. Canvas fingerprint vide ou suspect
  if (!fingerprint.canvas || fingerprint.canvas.length < 10) {
    signals.push('invalid_canvas');
    score += 25;
  }

  // 7. WebGL fingerprint vide
  if (!fingerprint.webgl || fingerprint.webgl.length < 10) {
    signals.push('invalid_webgl');
    score += 20;
  }

  // 8. Cookies désactivés
  if (!fingerprint.cookieEnabled) {
    signals.push('cookies_disabled');
    score += 10;
  }

  // 9. Timezone suspect (UTC souvent utilisé par bots)
  if (fingerprint.timezone === 'UTC' || fingerprint.timezoneOffset === 0) {
    signals.push('utc_timezone');
    score += 5;
  }

  // Cap à 100
  score = Math.min(100, score);

  return {
    score,
    signals,
    suspicious: score >= 50,
  };
}

/**
 * Génère une empreinte Canvas unique
 */
function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    canvas.width = 200;
    canvas.height = 50;

    // Dessiner du texte avec différents styles
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('HCS-U7 🛡️', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('HCS-U7 🛡️', 4, 17);

    // Convertir en hash
    const dataURL = canvas.toDataURL();
    return hashString(dataURL);
  } catch (e) {
    return '';
  }
}

/**
 * Génère une empreinte WebGL unique
 */
function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as any;
    if (!gl) return '';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return '';

    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

    return hashString(`${vendor}~${renderer}`);
  } catch (e) {
    return '';
  }
}

/**
 * Hash simple d'une chaîne
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
