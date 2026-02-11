/**
 * HCS-U7 Protection Widget v2.0.0
 * Copyright (c) 2025 Benjamin BARRERE / IA SOLUTION
 * Patent Pending FR2514274
 * 
 * Widget autonome de protection anti-bot
 * - Token signé HMAC (data-tenant) + backward compat (window.HCS_TENANT_ID)
 * - Auto-détection CSP / Adblock
 * - Mode debug safe & isolé
 * - Aucune modification DNS requise
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  var CONFIG = {
    apiUrl: 'https://api.hcs-u7.online',
    version: '2.1.0',
    debug: false,
    env: 'production',
    token: null,
    tenantId: null,
    tokenPayload: null,
    widgetPublicId: null,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TOKEN PARSING (Module 1)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Base64url decode (no dependencies)
   */
  function base64urlDecode(str) {
    try {
      var padded = str + '===='.substring(0, (4 - (str.length % 4)) % 4);
      var base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
      return decodeURIComponent(
        atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join('')
      );
    } catch (e) {
      return null;
    }
  }

  /**
   * Parse a signed widget token (payload.signature format)
   * Client-side: only checks structure and expiration (no HMAC verification)
   * Server-side: full HMAC verification happens on /widget/validate
   */
  function parseToken(token) {
    if (!token || typeof token !== 'string') return null;

    var parts = token.split('.');
    if (parts.length !== 2) return null;

    var decoded = base64urlDecode(parts[0]);
    if (!decoded) return null;

    try {
      var payload = JSON.parse(decoded);
      if (!payload.tid || !payload.exp || !payload.v) return null;
      return payload;
    } catch (e) {
      return null;
    }
  }

  /**
   * Check if token is expired (client-side basic check)
   * Returns: 'valid' | 'grace' | 'expired'
   */
  function checkTokenExpiry(payload) {
    if (!payload || !payload.exp) return 'expired';
    var now = Math.floor(Date.now() / 1000);
    if (payload.exp >= now) return 'valid';
    // Grace period: 1 hour
    if (now - payload.exp <= 3600) return 'grace';
    return 'expired';
  }

  /**
   * Check if a value looks like a legacy raw tenant ID (UUID/CUID)
   */
  function isLegacyTenantId(value) {
    if (!value || typeof value !== 'string') return false;
    if (value.includes('.')) return false;
    // UUID format
    if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(value)) return true;
    // CUID format
    if (/^c[a-z0-9]{20,30}$/.test(value)) return true;
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION — Read config from script tag or globals
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Find the current script tag and extract data attributes
   */
  function initConfig() {
    // Find our script tag
    var scripts = document.querySelectorAll('script[data-widget], script[data-tenant], script[src*="hcs-widget"]');
    var scriptTag = null;

    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].getAttribute('data-widget') ||
          scripts[i].getAttribute('data-tenant') || 
          (scripts[i].src && scripts[i].src.indexOf('hcs-widget') !== -1)) {
        scriptTag = scripts[i];
        break;
      }
    }

    // Mode 0: data-widget attribute (v2.1 enterprise — widgetPublicId)
    if (scriptTag && scriptTag.getAttribute('data-widget')) {
      CONFIG.widgetPublicId = scriptTag.getAttribute('data-widget');
      // data-tenant is optional alongside data-widget
      if (scriptTag.getAttribute('data-tenant')) {
        var tv = scriptTag.getAttribute('data-tenant');
        if (isLegacyTenantId(tv)) {
          CONFIG.tenantId = tv;
        } else {
          var p = parseToken(tv);
          if (p) { CONFIG.token = tv; CONFIG.tokenPayload = p; CONFIG.tenantId = p.tid; }
        }
      }
      debugLog('init', 'Widget public ID from data-widget');
    }
    // Mode 1: data-tenant attribute (v2 recommended)
    else if (scriptTag && scriptTag.getAttribute('data-tenant')) {
      var tokenValue = scriptTag.getAttribute('data-tenant');

      if (isLegacyTenantId(tokenValue)) {
        // Legacy: raw tenant ID passed as data-tenant
        CONFIG.tenantId = tokenValue;
        CONFIG.token = null;
        debugLog('init', 'Legacy tenant ID from data-tenant');
      } else {
        // v2: signed token
        var payload = parseToken(tokenValue);
        if (payload) {
          CONFIG.token = tokenValue;
          CONFIG.tokenPayload = payload;
          CONFIG.tenantId = payload.tid;
          if (payload.dbg) CONFIG.debug = true;
          if (payload.env) CONFIG.env = payload.env;
          debugLog('init', 'Signed token parsed, tenant: ' + maskId(payload.tid));
        } else {
          logError('Invalid data-tenant token format');
          return false;
        }
      }
    }
    // Mode 2: window.HCS_TENANT_ID (v1 legacy)
    else if (window.HCS_TENANT_ID) {
      CONFIG.tenantId = window.HCS_TENANT_ID;
      CONFIG.token = null;
      debugLog('init', 'Legacy window.HCS_TENANT_ID mode');
    }
    // No config found
    else {
      logError('Missing data-tenant attribute or window.HCS_TENANT_ID');
      return false;
    }

    // Read optional data attributes
    if (scriptTag) {
      if (scriptTag.getAttribute('data-debug') === 'true') {
        CONFIG.debug = true;
      }
      if (scriptTag.getAttribute('data-env')) {
        CONFIG.env = scriptTag.getAttribute('data-env');
      }
    }

    // Check token expiry (client-side)
    if (CONFIG.tokenPayload) {
      var expiry = checkTokenExpiry(CONFIG.tokenPayload);
      if (expiry === 'expired') {
        debugLog('token', 'Token expired — will attempt validation anyway (backend decides)');
      } else if (expiry === 'grace') {
        debugLog('token', 'Token in grace period — renewal recommended');
      }
    }

    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINGERPRINTING
  // ═══════════════════════════════════════════════════════════════════════════

  function collectFingerprint() {
    var nav = navigator;
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

  function analyzeBotSignals(fingerprint) {
    var signals = [];
    var score = 0;

    if (fingerprint.webdriver) { signals.push('webdriver_detected'); score += 50; }
    if (fingerprint.plugins === 0) { signals.push('no_plugins'); score += 20; }

    var suspiciousUA = ['headless', 'phantom', 'selenium', 'puppeteer', 'bot', 'crawler', 'spider'];
    var uaLower = fingerprint.userAgent.toLowerCase();
    if (suspiciousUA.some(function(ua) { return uaLower.indexOf(ua) !== -1; })) {
      signals.push('suspicious_user_agent'); score += 40;
    }

    if (fingerprint.languages.length === 0) { signals.push('no_languages'); score += 15; }
    if (fingerprint.hardwareConcurrency === 0 || fingerprint.hardwareConcurrency > 32) {
      signals.push('abnormal_hardware'); score += 10;
    }
    if (!fingerprint.canvas || fingerprint.canvas.length < 10) { signals.push('invalid_canvas'); score += 25; }
    if (!fingerprint.webgl || fingerprint.webgl.length < 10) { signals.push('invalid_webgl'); score += 20; }
    if (!fingerprint.cookieEnabled) { signals.push('cookies_disabled'); score += 10; }
    if (fingerprint.timezone === 'UTC' || fingerprint.timezoneOffset === 0) {
      signals.push('utc_timezone'); score += 5;
    }

    score = Math.min(100, score);
    return { score: score, signals: signals, suspicious: score >= 50 };
  }

  function getCanvasFingerprint() {
    try {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      if (!ctx) return '';
      canvas.width = 200; canvas.height = 50;
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('HCS-U7', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('HCS-U7', 4, 17);
      return hashString(canvas.toDataURL());
    } catch (e) { return ''; }
  }

  function getWebGLFingerprint() {
    try {
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return '';
      var debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) return '';
      var vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      var renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      return hashString(vendor + '~' + renderer);
    } catch (e) { return ''; }
  }

  function hashString(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BEHAVIORAL SIGNAL COLLECTOR (Module 2B) — Anti proxy+human-like-timing
  // Collects mouse dynamics, keystroke biometrics, scroll patterns, touch,
  // and micro-timing entropy that bots cannot simulate even with proxies.
  // ═══════════════════════════════════════════════════════════════════════════

  var behaviorCollector = {
    startTime: Date.now(),
    firstInteractionTime: null,
    lastActivityTime: Date.now(),
    idleGapCount: 0,
    MAX_SAMPLES: 500,

    // Mouse tracking
    mousePoints: [],
    mouseVelocities: [],
    mouseAccelerations: [],
    mouseCurvatures: [],
    clickCount: 0,

    // Keystroke tracking
    keyDownTimes: {},
    keystrokeIntervals: [],
    keystrokeDwells: [],
    flightTimes: [],
    lastKeyUpTime: 0,
    keystrokeCount: 0,

    // Scroll tracking
    scrollCount: 0,
    scrollVelocities: [],
    lastScrollY: 0,
    lastScrollTime: 0,
    scrollDirectionChanges: 0,
    lastScrollDirection: 0,

    // Touch tracking
    touchCount: 0,
    touchPressures: [],
    touchRadii: [],

    // Form tracking
    copyPasteCount: 0,

    // Micro-timing for entropy analysis
    microTimings: [],

    // ── Helpers ──
    _mean: function(arr) {
      if (arr.length === 0) return 0;
      var sum = 0;
      for (var i = 0; i < arr.length; i++) sum += arr[i];
      return sum / arr.length;
    },

    _std: function(arr) {
      if (arr.length < 2) return 0;
      var m = this._mean(arr);
      var variance = 0;
      for (var i = 0; i < arr.length; i++) variance += (arr[i] - m) * (arr[i] - m);
      return Math.sqrt(variance / (arr.length - 1));
    },

    _computeCurvature: function(p1, p2, p3) {
      var ax = p2.x - p1.x, ay = p2.y - p1.y;
      var bx = p3.x - p2.x, by = p3.y - p2.y;
      var cross = Math.abs(ax * by - ay * bx);
      var a = Math.sqrt(ax * ax + ay * ay);
      var b = Math.sqrt(bx * bx + by * by);
      var cx = p3.x - p1.x, cy = p3.y - p1.y;
      var c = Math.sqrt(cx * cx + cy * cy);
      var denom = a * b * c;
      return denom === 0 ? 0 : (2 * cross) / denom;
    },

    _computeTimingEntropy: function(timings) {
      if (timings.length < 5) return 0.5;
      var intervals = [];
      for (var i = 1; i < timings.length; i++) intervals.push(timings[i] - timings[i - 1]);
      var numBins = 20;
      var minVal = Infinity, maxVal = -Infinity;
      for (var j = 0; j < intervals.length; j++) {
        if (intervals[j] < minVal) minVal = intervals[j];
        if (intervals[j] > maxVal) maxVal = intervals[j];
      }
      var range = maxVal - minVal;
      if (range === 0) return 0;
      var bins = [];
      for (var k = 0; k < numBins; k++) bins.push(0);
      for (var l = 0; l < intervals.length; l++) {
        var idx = Math.min(Math.floor(((intervals[l] - minVal) / range) * numBins), numBins - 1);
        bins[idx]++;
      }
      var entropy = 0;
      var total = intervals.length;
      for (var m = 0; m < bins.length; m++) {
        if (bins[m] > 0) {
          var p = bins[m] / total;
          entropy -= p * Math.log2(p);
        }
      }
      var maxEntropy = Math.log2(numBins);
      return maxEntropy > 0 ? entropy / maxEntropy : 0;
    },

    _computeSkewness: function(arr) {
      if (arr.length < 3) return 0;
      var m = this._mean(arr), s = this._std(arr);
      if (s === 0) return 0;
      var n = arr.length, sum = 0;
      for (var i = 0; i < n; i++) sum += Math.pow((arr[i] - m) / s, 3);
      return (n / ((n - 1) * (n - 2))) * sum;
    },

    _computeKurtosis: function(arr) {
      if (arr.length < 4) return 3;
      var m = this._mean(arr), s = this._std(arr);
      if (s === 0) return 0;
      var n = arr.length, sum = 0;
      for (var i = 0; i < n; i++) sum += Math.pow((arr[i] - m) / s, 4);
      return (sum / n) - 3;
    },

    _isLinearMovement: function() {
      if (this.mousePoints.length < 10) return false;
      var pts = this.mousePoints.slice(-50);
      var linear = 0, total = 0;
      for (var i = 2; i < pts.length; i++) {
        var curv = this._computeCurvature(pts[i - 2], pts[i - 1], pts[i]);
        total++;
        if (curv < 0.001) linear++;
      }
      return total > 0 && (linear / total) > 0.8;
    },

    _computeMicroTimingEntropy: function() {
      if (this.microTimings.length < 10) return 0.5;
      var intervals = [];
      for (var i = 1; i < this.microTimings.length; i++) {
        intervals.push(this.microTimings[i] - this.microTimings[i - 1]);
      }
      // Autocorrelation check
      var autocorr = 0;
      if (intervals.length > 2) {
        var m = this._mean(intervals), s = this._std(intervals);
        if (s > 0) {
          var sum = 0;
          for (var j = 1; j < intervals.length; j++) {
            sum += ((intervals[j] - m) / s) * ((intervals[j - 1] - m) / s);
          }
          autocorr = sum / (intervals.length - 1);
        }
      }
      var entropy = this._computeTimingEntropy(this.microTimings);
      // High entropy + low autocorrelation = artificial randomness
      if (entropy > 0.85 && Math.abs(autocorr) < 0.1) return 0.9;
      if (entropy < 0.15) return 0.1;
      return entropy;
    },

    // ── Activity tracker ──
    _recordActivity: function() {
      var now = Date.now();
      if (this.firstInteractionTime === null) this.firstInteractionTime = now;
      if (now - this.lastActivityTime > 3000) this.idleGapCount++;
      this.lastActivityTime = now;
      if (this.microTimings.length < this.MAX_SAMPLES) this.microTimings.push(now);
    },

    // ── Event handlers ──
    onMouseMove: function(e) {
      this._recordActivity();
      var point = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (this.mousePoints.length > 0) {
        var prev = this.mousePoints[this.mousePoints.length - 1];
        var dt = point.t - prev.t;
        if (dt > 0) {
          var dx = point.x - prev.x, dy = point.y - prev.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          var velocity = dist / dt;
          if (this.mouseVelocities.length < this.MAX_SAMPLES) this.mouseVelocities.push(velocity);
          if (this.mouseVelocities.length >= 2) {
            var prevV = this.mouseVelocities[this.mouseVelocities.length - 2];
            if (this.mouseAccelerations.length < this.MAX_SAMPLES) {
              this.mouseAccelerations.push((velocity - prevV) / dt);
            }
          }
          if (this.mousePoints.length >= 2) {
            var prev2 = this.mousePoints[this.mousePoints.length - 2];
            if (this.mouseCurvatures.length < this.MAX_SAMPLES) {
              this.mouseCurvatures.push(this._computeCurvature(prev2, prev, point));
            }
          }
        }
      }
      if (this.mousePoints.length < this.MAX_SAMPLES) {
        this.mousePoints.push(point);
      } else {
        this.mousePoints[this.mousePoints.length - 1] = point;
      }
    },

    onClick: function() { this._recordActivity(); this.clickCount++; },

    onKeyDown: function(e) {
      this._recordActivity();
      if (['Shift', 'Control', 'Alt', 'Meta'].indexOf(e.key) !== -1) return;
      var now = performance.now();
      if (this.lastKeyUpTime > 0) {
        var flight = now - this.lastKeyUpTime;
        if (flight > 0 && flight < 5000 && this.flightTimes.length < this.MAX_SAMPLES) {
          this.flightTimes.push(flight);
        }
      }
      var keys = Object.keys(this.keyDownTimes);
      if (keys.length > 0 && this.keystrokeIntervals.length < this.MAX_SAMPLES) {
        var lastDown = 0;
        for (var i = 0; i < keys.length; i++) {
          if (this.keyDownTimes[keys[i]] > lastDown) lastDown = this.keyDownTimes[keys[i]];
        }
        var interval = now - lastDown;
        if (interval > 0 && interval < 5000) this.keystrokeIntervals.push(interval);
      }
      this.keyDownTimes[e.code] = now;
      this.keystrokeCount++;
    },

    onKeyUp: function(e) {
      if (['Shift', 'Control', 'Alt', 'Meta'].indexOf(e.key) !== -1) return;
      var now = performance.now();
      var downTime = this.keyDownTimes[e.code];
      if (downTime !== undefined) {
        var dwell = now - downTime;
        if (dwell > 0 && dwell < 2000 && this.keystrokeDwells.length < this.MAX_SAMPLES) {
          this.keystrokeDwells.push(dwell);
        }
        delete this.keyDownTimes[e.code];
      }
      this.lastKeyUpTime = now;
    },

    onScroll: function() {
      this._recordActivity();
      this.scrollCount++;
      var now = performance.now();
      var scrollY = window.scrollY || document.documentElement.scrollTop;
      var dt = now - this.lastScrollTime;
      if (dt > 0 && this.lastScrollTime > 0) {
        var dy = scrollY - this.lastScrollY;
        if (this.scrollVelocities.length < this.MAX_SAMPLES) {
          this.scrollVelocities.push(Math.abs(dy) / dt);
        }
        var dir = dy > 0 ? 1 : dy < 0 ? -1 : 0;
        if (dir !== 0 && dir !== this.lastScrollDirection && this.lastScrollDirection !== 0) {
          this.scrollDirectionChanges++;
        }
        if (dir !== 0) this.lastScrollDirection = dir;
      }
      this.lastScrollY = scrollY;
      this.lastScrollTime = now;
    },

    onTouchStart: function(e) {
      this._recordActivity();
      this.touchCount++;
      for (var i = 0; i < e.touches.length; i++) {
        var touch = e.touches[i];
        if (touch.force !== undefined && touch.force > 0) this.touchPressures.push(touch.force);
        if (touch.radiusX !== undefined) this.touchRadii.push((touch.radiusX + touch.radiusY) / 2);
      }
    },

    onCopyPaste: function() { this._recordActivity(); this.copyPasteCount++; },

    // ── Collect final signals ──
    getSignals: function() {
      var now = Date.now();
      var sessionDuration = (now - this.startTime) / 1000;
      var microIntervals = [];
      for (var i = 1; i < this.microTimings.length; i++) {
        microIntervals.push(this.microTimings[i] - this.microTimings[i - 1]);
      }
      return {
        keystrokeIntervalAvg: this._mean(this.keystrokeIntervals),
        keystrokeIntervalStd: this._std(this.keystrokeIntervals),
        keystrokeDwellAvg: this._mean(this.keystrokeDwells),
        keystrokeDwellStd: this._std(this.keystrokeDwells),
        keystrokes: this.keystrokeCount,
        flightTimeAvg: this._mean(this.flightTimes),
        flightTimeStd: this._std(this.flightTimes),
        mouseVelocityAvg: this._mean(this.mouseVelocities),
        mouseVelocityStd: this._std(this.mouseVelocities),
        mouseAccelerationAvg: this._mean(this.mouseAccelerations),
        mouseAccelerationStd: this._std(this.mouseAccelerations),
        mouseCurvatureAvg: this._mean(this.mouseCurvatures),
        mouseMovements: this.mousePoints.length,
        mouseClicks: this.clickCount,
        noMouseMovement: this.mousePoints.length === 0,
        linearMovement: this._isLinearMovement(),
        scrollEvents: this.scrollCount,
        scrollVelocityAvg: this._mean(this.scrollVelocities),
        scrollDirectionChanges: this.scrollDirectionChanges,
        touchEvents: this.touchCount,
        touchPressureAvg: this._mean(this.touchPressures),
        touchRadiusAvg: this._mean(this.touchRadii),
        timeToFirstInteraction: this.firstInteractionTime
          ? (this.firstInteractionTime - this.startTime) / 1000 : sessionDuration,
        sessionDuration: sessionDuration,
        idleGaps: this.idleGapCount,
        timingEntropy: this._computeTimingEntropy(this.microTimings),
        instantFormFill: false,
        copyPasteEvents: this.copyPasteCount,
        unusualSpeed: false,
        pageViews: 1,
        microTimingEntropy: this._computeMicroTimingEntropy(),
        timingDistributionSkewness: this._computeSkewness(microIntervals),
        timingDistributionKurtosis: this._computeKurtosis(microIntervals),
      };
    },

    // ── Attach listeners ──
    init: function() {
      var self = this;
      var opts = { passive: true };
      document.addEventListener('mousemove', function(e) { self.onMouseMove(e); }, opts);
      document.addEventListener('click', function() { self.onClick(); }, opts);
      document.addEventListener('keydown', function(e) { self.onKeyDown(e); }, opts);
      document.addEventListener('keyup', function(e) { self.onKeyUp(e); }, opts);
      document.addEventListener('scroll', function() { self.onScroll(); }, { passive: true, capture: true });
      document.addEventListener('touchstart', function(e) { self.onTouchStart(e); }, opts);
      document.addEventListener('touchmove', function() { self._recordActivity(); }, opts);
      document.addEventListener('copy', function() { self.onCopyPaste(); }, opts);
      document.addEventListener('paste', function() { self.onCopyPaste(); }, opts);
    },
  };

  // Start collecting immediately
  behaviorCollector.init();

  // ═══════════════════════════════════════════════════════════════════════════
  // CSP / ADBLOCK DETECTION (Module 3)
  // ═══════════════════════════════════════════════════════════════════════════

  var diagnostics = {
    csp: { connect: 'unknown', style: 'unknown' },
    adblock: { detected: false, method: null },
    apiReachable: false,
    latency: -1,
    brave: false,
  };

  /**
   * Test CSP connect-src by pinging the API
   */
  function detectCSPConnect() {
    return new Promise(function(resolve) {
      var start = Date.now();
      fetch(CONFIG.apiUrl + '/health', { mode: 'cors', method: 'GET' })
        .then(function(res) {
          diagnostics.csp.connect = 'ok';
          diagnostics.apiReachable = true;
          diagnostics.latency = Date.now() - start;
          resolve('ok');
        })
        .catch(function(e) {
          var msg = (e.message || '').toLowerCase();
          if (msg.indexOf('csp') !== -1 || msg.indexOf('content security policy') !== -1 ||
              msg.indexOf('blocked') !== -1) {
            diagnostics.csp.connect = 'blocked';
          } else {
            diagnostics.csp.connect = 'error';
          }
          diagnostics.apiReachable = false;
          resolve(diagnostics.csp.connect);
        });
    });
  }

  /**
   * Test CSP style-src by injecting a test style
   */
  function detectCSPStyle() {
    try {
      var s = document.createElement('style');
      s.textContent = '.hcs-csp-test{display:none}';
      document.head.appendChild(s);
      s.remove();
      diagnostics.csp.style = 'ok';
    } catch (e) {
      diagnostics.csp.style = 'blocked';
    }
  }

  /**
   * Detect adblock / privacy shields using bait element
   */
  function detectAdblock() {
    return new Promise(function(resolve) {
      var bait = document.createElement('div');
      bait.className = 'ad-banner ad-wrapper adsbygoogle';
      bait.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      bait.innerHTML = '&nbsp;';
      document.body.appendChild(bait);

      setTimeout(function() {
        try {
          var blocked = bait.offsetHeight === 0 ||
                        bait.offsetWidth === 0 ||
                        getComputedStyle(bait).display === 'none' ||
                        getComputedStyle(bait).visibility === 'hidden';
          if (blocked) {
            diagnostics.adblock.detected = true;
            diagnostics.adblock.method = 'bait_element';
          }
        } catch (e) {
          // Can't check — assume no adblock
        }
        try { bait.remove(); } catch (e) {}

        // Check Brave browser
        if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
          diagnostics.brave = true;
        }

        resolve(diagnostics.adblock.detected);
      }, 150);
    });
  }

  /**
   * Run all diagnostics (non-blocking)
   */
  function runDiagnostics() {
    detectCSPStyle();
    return Promise.all([
      detectCSPConnect(),
      detectAdblock(),
    ]).then(function() {
      debugLog('diagnostics', diagnostics);
      // Report diagnostics to backend (fire-and-forget)
      reportDiagnostics();
    }).catch(function() {
      // Silent fail — diagnostics are non-critical
    });
  }

  /**
   * Report diagnostics to backend (non-blocking)
   */
  function reportDiagnostics() {
    if (!diagnostics.apiReachable) return; // Can't report if API unreachable

    try {
      var body = {
        tenantId: CONFIG.tenantId,
        token: CONFIG.token,
        diagnostics: diagnostics,
        url: window.location.href,
        timestamp: Date.now(),
      };

      fetch(CONFIG.apiUrl + '/widget/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-HCS-Widget-Version': CONFIG.version },
        body: JSON.stringify({
          tenantId: CONFIG.tenantId,
          token: CONFIG.token,
          eventType: 'diagnostics',
          data: diagnostics,
          timestamp: Date.now(),
          url: window.location.href,
        }),
      }).catch(function() { /* silent */ });
    } catch (e) { /* silent */ }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHALLENGE ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  function showChallenge() {
    return new Promise(function(resolve) {
      var overlay = document.createElement('div');
      overlay.id = 'hcs-challenge-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999999;';

      var container = document.createElement('div');
      container.style.cssText = 'background:white;border-radius:12px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);max-width:500px;width:90%;padding:30px;text-align:center;';

      container.innerHTML = '<h3 style="margin:0 0 20px 0;color:#1e293b;">Vérification Humaine</h3><p style="margin:0 0 20px 0;color:#64748b;">Déplacez le curseur jusqu\'à 50</p><input type="range" min="0" max="100" value="0" id="hcs-slider" style="width:100%;margin:20px 0;"/><div id="hcs-value" style="font-size:24px;font-weight:bold;color:#3b82f6;">0</div><button id="hcs-submit" style="margin-top:20px;padding:10px 30px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-size:16px;">Valider</button>';

      overlay.appendChild(container);
      document.body.appendChild(overlay);

      var slider = document.getElementById('hcs-slider');
      var valueDisplay = document.getElementById('hcs-value');
      var submitBtn = document.getElementById('hcs-submit');
      var startTime = Date.now();

      slider.addEventListener('input', function() { valueDisplay.textContent = slider.value; });

      submitBtn.addEventListener('click', function() {
        var value = parseInt(slider.value);
        var success = Math.abs(value - 50) <= 5;
        var duration = Date.now() - startTime;
        overlay.remove();
        resolve({ type: 'slider', success: success, duration: duration, data: { value: value, target: 50 } });
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API COMMUNICATION
  // ═══════════════════════════════════════════════════════════════════════════

  var sessionValidated = false;
  var sessionToken = null;
  var lastValidation = null;

  /**
   * Validate with backend — sends signed token (v2) or raw tenantId (legacy)
   */
  function validateWithBackend(fingerprint, botSignals, challenge) {
    return new Promise(function(resolve) {
      var requestBody = {
        fingerprint: fingerprint,
        botSignals: botSignals,
        behavior: behaviorCollector.getSignals(),
        challenge: challenge || null,
        url: window.location.href,
        referrer: document.referrer,
      };

      // v2: send signed token; legacy: send raw tenantId
      if (CONFIG.token) {
        requestBody.token = CONFIG.token;
      } else {
        requestBody.tenantId = CONFIG.tenantId;
      }

      fetch(CONFIG.apiUrl + '/widget/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-HCS-Widget-Version': CONFIG.version,
        },
        body: JSON.stringify(requestBody),
      })
      .then(function(response) {
        if (!response.ok) throw new Error('API error: ' + response.status);
        return response.json();
      })
      .then(function(data) {
        lastValidation = {
          score: data.score,
          action: data.action,
          signals: botSignals.signals,
          timestamp: Date.now(),
        };
        resolve(data);
      })
      .catch(function(error) {
        debugLog('api', 'Validation error: ' + error.message);
        // Fail-open
        lastValidation = { score: 0, action: 'allow', signals: [], timestamp: Date.now() };
        resolve({ valid: true, score: 0, action: 'allow', reason: 'api_error' });
      });
    });
  }

  /**
   * Block access
   */
  function blockAccess(reason) {
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif;';
    var inner = document.createElement('div');
    inner.style.cssText = 'text-align:center;max-width:500px;padding:40px;';
    var icon = document.createElement('div');
    icon.style.cssText = 'font-size:64px;margin-bottom:20px;';
    icon.textContent = '\uD83D\uDEE1\uFE0F';
    var h1 = document.createElement('h1');
    h1.style.cssText = 'color:#1e293b;margin:0 0 10px 0;';
    h1.textContent = 'Acc\u00e8s Bloqu\u00e9';
    var p1 = document.createElement('p');
    p1.style.cssText = 'color:#64748b;margin:0 0 20px 0;';
    p1.textContent = 'Votre acc\u00e8s a \u00e9t\u00e9 bloqu\u00e9 par HCS-U7 Protection.';
    var p2 = document.createElement('p');
    p2.style.cssText = 'color:#94a3b8;font-size:14px;';
    p2.textContent = 'Raison: ' + (typeof reason === 'string' ? reason : 'Unknown');
    var p3 = document.createElement('p');
    p3.style.cssText = 'color:#94a3b8;font-size:12px;margin-top:30px;';
    p3.textContent = 'Prot\u00e9g\u00e9 par HCS-U7';
    inner.appendChild(icon);
    inner.appendChild(h1);
    inner.appendChild(p1);
    inner.appendChild(p2);
    inner.appendChild(p3);
    wrapper.appendChild(inner);
    document.body.innerHTML = '';
    document.body.appendChild(wrapper);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEBUG MODE (Module 4)
  // ═══════════════════════════════════════════════════════════════════════════

  var debugLogs = [];

  function debugLog(category, data) {
    if (!CONFIG.debug) return;
    var entry = { t: Date.now(), cat: category, data: data };
    debugLogs.push(entry);
    if (debugLogs.length > 200) debugLogs.shift();
    console.debug('[HCS-U7][' + category + ']', data);
  }

  function logError(msg) {
    console.error('[HCS-U7] ' + msg);
  }

  function maskId(id) {
    if (!id || id.length < 8) return '***';
    return id.substring(0, 4) + '...' + id.substring(id.length - 3);
  }

  /**
   * Expose debug API on window.__HCS_DEBUG__
   * Only if debug mode is enabled AND authorized by token
   */
  function setupDebugAPI() {
    if (!CONFIG.debug) return;

    // Only allow debug if token explicitly allows it, or if using legacy mode with data-debug
    var debugAllowed = (CONFIG.tokenPayload && CONFIG.tokenPayload.dbg) || !CONFIG.token;
    if (!debugAllowed) {
      debugLog('debug', 'Debug mode requested but not authorized by token');
      CONFIG.debug = false;
      return;
    }

    var tokenExpiry = CONFIG.tokenPayload ? checkTokenExpiry(CONFIG.tokenPayload) : 'n/a';

    window.__HCS_DEBUG__ = {
      version: CONFIG.version,
      tenantId: maskId(CONFIG.tenantId),
      tokenValid: CONFIG.token ? (tokenExpiry === 'valid' || tokenExpiry === 'grace') : 'legacy',
      tokenExpires: CONFIG.tokenPayload ? new Date(CONFIG.tokenPayload.exp * 1000).toISOString() : null,
      env: CONFIG.env,

      diagnostics: diagnostics,

      get lastValidation() { return lastValidation; },

      revalidate: function() {
        debugLog('debug', 'Manual revalidation triggered');
        return protect();
      },

      getFingerprint: function() {
        return collectFingerprint();
      },

      getBehavior: function() {
        return behaviorCollector.getSignals();
      },

      getLogs: function() {
        return debugLogs.slice();
      },

      getDiagnostics: function() {
        return JSON.parse(JSON.stringify(diagnostics));
      },
    };

    // Show debug badge
    showDebugBadge();
    debugLog('debug', 'Debug API exposed on window.__HCS_DEBUG__');
  }

  /**
   * Show a small, semi-transparent debug badge in the bottom-right corner
   */
  function showDebugBadge() {
    if (!CONFIG.debug) return;

    var badge = document.createElement('div');
    badge.id = 'hcs-debug-badge';
    badge.style.cssText = 'position:fixed;bottom:10px;right:10px;background:rgba(30,41,59,0.8);color:#e2e8f0;padding:6px 12px;border-radius:8px;font-family:system-ui,-apple-system,sans-serif;font-size:11px;z-index:999998;cursor:move;user-select:none;backdrop-filter:blur(4px);border:1px solid rgba(148,163,184,0.2);';
    badge.innerHTML = '🛡️ <span style="font-weight:600;">HCS Debug</span> <span id="hcs-debug-score" style="margin-left:4px;">...</span>';

    // Make draggable
    var isDragging = false;
    var offsetX = 0, offsetY = 0;

    badge.addEventListener('mousedown', function(e) {
      isDragging = true;
      offsetX = e.clientX - badge.getBoundingClientRect().left;
      offsetY = e.clientY - badge.getBoundingClientRect().top;
      badge.style.transition = 'none';
    });

    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      badge.style.left = (e.clientX - offsetX) + 'px';
      badge.style.top = (e.clientY - offsetY) + 'px';
      badge.style.right = 'auto';
      badge.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', function() { isDragging = false; });

    // Click to show details in console
    badge.addEventListener('click', function() {
      if (isDragging) return;
      console.group('[HCS-U7] Debug Details');
      console.log('Version:', CONFIG.version);
      console.log('Tenant:', maskId(CONFIG.tenantId));
      console.log('Token valid:', CONFIG.token ? checkTokenExpiry(CONFIG.tokenPayload) : 'legacy');
      console.log('Diagnostics:', diagnostics);
      console.log('Last validation:', lastValidation);
      console.log('Logs:', debugLogs.length, 'entries');
      console.groupEnd();
    });

    // Append when body is ready
    if (document.body) {
      document.body.appendChild(badge);
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        document.body.appendChild(badge);
      });
    }
  }

  /**
   * Update debug badge with score
   */
  function updateDebugBadge(score, action) {
    if (!CONFIG.debug) return;
    var scoreEl = document.getElementById('hcs-debug-score');
    if (!scoreEl) return;

    var color = action === 'allow' ? '#4ade80' : action === 'challenge' ? '#fbbf24' : '#f87171';
    var icon = action === 'allow' ? '✅' : action === 'challenge' ? '⚠️' : '❌';
    scoreEl.innerHTML = icon + ' <span style="color:' + color + ';">' + score + '</span>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN PROTECTION FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  function protect() {
    if (sessionValidated) {
      debugLog('protect', 'Already validated this session');
      return Promise.resolve();
    }

    return new Promise(function(resolve) {
      try {
        // 1. Collect fingerprint
        var fingerprint = collectFingerprint();

        // 2. Analyze bot signals
        var botSignals = analyzeBotSignals(fingerprint);
        debugLog('protect', 'Bot score: ' + botSignals.score + ', signals: ' + botSignals.signals.join(', '));

        // 3. If suspicious, show challenge
        var challengePromise;
        if (botSignals.suspicious) {
          debugLog('protect', 'Suspicious — showing challenge');
          challengePromise = showChallenge();
        } else {
          challengePromise = Promise.resolve(null);
        }

        challengePromise.then(function(challenge) {
          if (challenge && !challenge.success) {
            blockAccess('Challenge échoué');
            resolve();
            return;
          }

          // 4. Validate with backend
          validateWithBackend(fingerprint, botSignals, challenge).then(function(validation) {
            debugLog('protect', 'Validation result: ' + validation.action + ' (score: ' + validation.score + ')');

            // 5. Update debug badge
            updateDebugBadge(validation.score, validation.action);

            // 6. Decision
            if (validation.action === 'block') {
              blockAccess(validation.reason || 'Bot détecté');
              resolve();
              return;
            }

            // 7. Access granted
            sessionValidated = true;
            sessionToken = validation.sessionToken;
            debugLog('protect', 'Access granted');
            resolve();
          });
        });

      } catch (error) {
        logError('Protection error: ' + error.message);
        // Fail-open
        resolve();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    // 1. Parse config from script tag / globals
    if (!initConfig()) {
      // Invalid config — fail silently (don't break the client's site)
      return;
    }

    debugLog('init', 'Widget v' + CONFIG.version + ' initializing');
    debugLog('init', 'Tenant: ' + maskId(CONFIG.tenantId) + ', Mode: ' + (CONFIG.token ? 'signed_token' : 'legacy'));

    // 2. Setup debug API (if authorized)
    setupDebugAPI();

    // 3. Send widget ping (non-blocking, silent)
    sendWidgetPing();

    // 4. Run diagnostics (non-blocking, parallel with protection)
    var diagPromise = runDiagnostics();

    // 5. Start protection
    var protectFn = function() {
      protect().catch(function(e) {
        logError('Protection failed: ' + e.message);
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', protectFn);
    } else {
      protectFn();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WIDGET PING (Module 6) — Silent heartbeat to backend
  // ═══════════════════════════════════════════════════════════════════════════

  function sendWidgetPing() {
    if (!CONFIG.widgetPublicId) return;
    try {
      fetch(CONFIG.apiUrl + '/api/widgets/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widgetPublicId: CONFIG.widgetPublicId,
        }),
      }).catch(function() { /* silent */ });
    } catch (e) { /* silent */ }
  }

  // Start
  init();

  // Expose minimal public API
  window.HCS = {
    version: CONFIG.version,
    validate: protect,
    isValidated: function() { return sessionValidated; },
  };

})();
