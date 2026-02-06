/**
 * HCS-U7 Protection Widget v1.0.0
 * Copyright (c) 2025 Benjamin BARRERE / IA SOLUTION
 * Patent Pending FR2514274
 * 
 * Widget autonome de protection anti-bot
 * Aucune modification DNS requise
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    apiUrl: 'https://api.hcs-u7.online',
    version: '1.0.0',
    debug: false,
  };

  // Vérifier que le tenant ID est fourni
  if (!window.HCS_TENANT_ID) {
    console.error('[HCS-U7] Missing HCS_TENANT_ID. Please set window.HCS_TENANT_ID before loading the widget.');
    return;
  }

  const TENANT_ID = window.HCS_TENANT_ID;

  // État global
  let sessionValidated = false;
  let sessionToken = null;

  /**
   * Collecte l'empreinte du navigateur
   */
  function collectFingerprint() {
    const nav = navigator;
    
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
      webdriver: nav.webdriver || false,
      plugins: nav.plugins ? nav.plugins.length : 0,
      canvas: getCanvasFingerprint(),
      webgl: getWebGLFingerprint(),
      touchSupport: 'ontouchstart' in window,
      cookieEnabled: nav.cookieEnabled || false,
      doNotTrack: nav.doNotTrack || null,
      timestamp: Date.now(),
    };
  }

  /**
   * Analyse les signaux de bot
   */
  function analyzeBotSignals(fingerprint) {
    const signals = [];
    let score = 0;

    // WebDriver détecté
    if (fingerprint.webdriver) {
      signals.push('webdriver_detected');
      score += 50;
    }

    // Pas de plugins
    if (fingerprint.plugins === 0) {
      signals.push('no_plugins');
      score += 20;
    }

    // User agent suspect
    const suspiciousUA = ['headless', 'phantom', 'selenium', 'puppeteer', 'bot', 'crawler', 'spider'];
    const uaLower = fingerprint.userAgent.toLowerCase();
    if (suspiciousUA.some(function(ua) { return uaLower.includes(ua); })) {
      signals.push('suspicious_user_agent');
      score += 40;
    }

    // Pas de langues
    if (fingerprint.languages.length === 0) {
      signals.push('no_languages');
      score += 15;
    }

    // Hardware anormal
    if (fingerprint.hardwareConcurrency === 0 || fingerprint.hardwareConcurrency > 32) {
      signals.push('abnormal_hardware');
      score += 10;
    }

    // Canvas vide
    if (!fingerprint.canvas || fingerprint.canvas.length < 10) {
      signals.push('invalid_canvas');
      score += 25;
    }

    // WebGL vide
    if (!fingerprint.webgl || fingerprint.webgl.length < 10) {
      signals.push('invalid_webgl');
      score += 20;
    }

    // Cookies désactivés
    if (!fingerprint.cookieEnabled) {
      signals.push('cookies_disabled');
      score += 10;
    }

    // Timezone UTC
    if (fingerprint.timezone === 'UTC' || fingerprint.timezoneOffset === 0) {
      signals.push('utc_timezone');
      score += 5;
    }

    score = Math.min(100, score);

    return {
      score: score,
      signals: signals,
      suspicious: score >= 50,
    };
  }

  /**
   * Canvas fingerprint
   */
  function getCanvasFingerprint() {
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

      const dataURL = canvas.toDataURL();
      return hashString(dataURL);
    } catch (e) {
      return '';
    }
  }

  /**
   * WebGL fingerprint
   */
  function getWebGLFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return '';

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) return '';

      const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

      return hashString(vendor + '~' + renderer);
    } catch (e) {
      return '';
    }
  }

  /**
   * Hash simple
   */
  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Affiche un challenge
   */
  function showChallenge() {
    return new Promise(function(resolve) {
      const overlay = document.createElement('div');
      overlay.id = 'hcs-challenge-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999999;';

      const container = document.createElement('div');
      container.style.cssText = 'background:white;border-radius:12px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);max-width:500px;width:90%;padding:30px;text-align:center;';

      // Challenge slider simple
      container.innerHTML = '<h3 style="margin:0 0 20px 0;color:#1e293b;">Vérification Humaine</h3><p style="margin:0 0 20px 0;color:#64748b;">Déplacez le curseur jusqu\'à 50</p><input type="range" min="0" max="100" value="0" id="hcs-slider" style="width:100%;margin:20px 0;"/><div id="hcs-value" style="font-size:24px;font-weight:bold;color:#3b82f6;">0</div><button id="hcs-submit" style="margin-top:20px;padding:10px 30px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-size:16px;">Valider</button>';

      overlay.appendChild(container);
      document.body.appendChild(overlay);

      const slider = document.getElementById('hcs-slider');
      const valueDisplay = document.getElementById('hcs-value');
      const submitBtn = document.getElementById('hcs-submit');

      const startTime = Date.now();

      slider.addEventListener('input', function() {
        valueDisplay.textContent = slider.value;
      });

      submitBtn.addEventListener('click', function() {
        const value = parseInt(slider.value);
        const success = Math.abs(value - 50) <= 5;
        const duration = Date.now() - startTime;

        overlay.remove();
        resolve({
          type: 'slider',
          success: success,
          duration: duration,
          data: { value: value, target: 50 },
        });
      });
    });
  }

  /**
   * Valide auprès du backend
   */
  async function validateWithBackend(fingerprint, botSignals, challenge) {
    try {
      const response = await fetch(CONFIG.apiUrl + '/widget/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-HCS-Widget-Version': CONFIG.version,
        },
        body: JSON.stringify({
          tenantId: TENANT_ID,
          fingerprint: fingerprint,
          botSignals: botSignals,
          challenge: challenge,
          url: window.location.href,
          referrer: document.referrer,
        }),
      });

      if (!response.ok) {
        throw new Error('API error: ' + response.status);
      }

      return await response.json();
    } catch (error) {
      if (CONFIG.debug) {
        console.error('[HCS-U7] Validation error:', error);
      }
      // Fail-open en cas d'erreur
      return {
        valid: true,
        score: 0,
        action: 'allow',
        reason: 'api_error',
      };
    }
  }

  /**
   * Bloque l'accès
   */
  function blockAccess(reason) {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif;"><div style="text-align:center;max-width:500px;padding:40px;"><div style="font-size:64px;margin-bottom:20px;">🛡️</div><h1 style="color:#1e293b;margin:0 0 10px 0;">Accès Bloqué</h1><p style="color:#64748b;margin:0 0 20px 0;">Votre accès a été bloqué par HCS-U7 Protection.</p><p style="color:#94a3b8;font-size:14px;">Raison: ' + reason + '</p><p style="color:#94a3b8;font-size:12px;margin-top:30px;">Protégé par <strong>HCS-U7</strong></p></div></div>';
  }

  /**
   * Protection principale
   */
  async function protect() {
    // Vérifier si déjà validé dans cette session
    if (sessionValidated) {
      return;
    }

    try {
      // 1. Collecter l'empreinte
      const fingerprint = collectFingerprint();
      
      // 2. Analyser les signaux de bot
      const botSignals = analyzeBotSignals(fingerprint);

      if (CONFIG.debug) {
        console.log('[HCS-U7] Bot score:', botSignals.score);
        console.log('[HCS-U7] Signals:', botSignals.signals);
      }

      // 3. Si suspect, afficher un challenge
      let challenge = null;
      if (botSignals.suspicious) {
        challenge = await showChallenge();
        
        if (!challenge.success) {
          blockAccess('Challenge échoué');
          return;
        }
      }

      // 4. Valider avec le backend
      const validation = await validateWithBackend(fingerprint, botSignals, challenge);

      if (CONFIG.debug) {
        console.log('[HCS-U7] Validation:', validation);
      }

      // 5. Décision finale
      if (validation.action === 'block') {
        blockAccess(validation.reason || 'Bot détecté');
        return;
      }

      // 6. Accès autorisé
      sessionValidated = true;
      sessionToken = validation.sessionToken;

      if (CONFIG.debug) {
        console.log('[HCS-U7] Access granted');
      }

    } catch (error) {
      console.error('[HCS-U7] Protection error:', error);
      // Fail-open en cas d'erreur critique
    }
  }

  /**
   * Initialisation
   */
  function init() {
    if (CONFIG.debug) {
      console.log('[HCS-U7] Widget v' + CONFIG.version + ' initialized');
      console.log('[HCS-U7] Tenant ID:', TENANT_ID);
    }

    // Lancer la protection
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', protect);
    } else {
      protect();
    }
  }

  // Démarrer
  init();

  // Exposer l'API publique
  window.HCS = {
    version: CONFIG.version,
    validate: protect,
    isValidated: function() { return sessionValidated; },
  };

})();
