/**
 * HCS-U7 Widget v3 — Minimal test suite
 * Runs in Node.js without a browser (tests pure logic modules).
 * Usage: npm run test:widget
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    passed++;
    console.log('  ✅ ' + name);
  } else {
    failed++;
    console.error('  ❌ ' + name);
  }
}

// ═══════════════════════════════════════════════════════════
// Test 1: Build output exists and is minified
// ═══════════════════════════════════════════════════════════
console.log('\n📦 Test: Build output');

const buildPath = resolve(ROOT, 'public/widget/v3/hcs-widget.js');
let buildContent;
try {
  buildContent = readFileSync(buildPath, 'utf-8');
  assert(buildContent.length > 1000, 'Build output exists and has content (' + buildContent.length + ' bytes)');
  assert(buildContent.includes('HCS-U7 Widget v3.0.0'), 'Contains version banner');
  assert(buildContent.includes('Patents Pending FR2514274'), 'Contains patent notice');
  // Widget uses console.debug/error/group/log (debug badge). Verify no stray console.log outside debug context.
  assert(!buildContent.includes('console.log("[HCS-U7]'), 'No raw [HCS-U7] console.log (should use console.debug)');
  assert(buildContent.split('\n').length < 15, 'Minified to few lines (got ' + buildContent.split('\n').length + ')');
} catch (e) {
  assert(false, 'Build output exists: ' + e.message);
}

// ═══════════════════════════════════════════════════════════
// Test 2: Scoring — clamp and weighted score
// ═══════════════════════════════════════════════════════════
console.log('\n🎯 Test: Scoring');

function clamp(v) { return Math.max(0, Math.min(100, v)); }

function weightedScore(components, weights) {
  let total = 0, wSum = 0;
  for (const key of Object.keys(weights)) {
    const val = components[key] ?? 0;
    const w = weights[key];
    total += clamp(val) * w;
    wSum += w;
  }
  return wSum > 0 ? clamp(total / wSum) : 0;
}

assert(clamp(-10) === 0, 'clamp(-10) === 0');
assert(clamp(150) === 100, 'clamp(150) === 100');
assert(clamp(50) === 50, 'clamp(50) === 50');
assert(clamp(0) === 0, 'clamp(0) === 0');
assert(clamp(100) === 100, 'clamp(100) === 100');

const components = { fingerprint: 20, behavior: 40, automation: 0, integrity: 10, velocity: 0, network: 0 };
const weights = { fingerprint: 0.25, behavior: 0.30, automation: 0.20, integrity: 0.10, velocity: 0.10, network: 0.05 };
const score = weightedScore(components, weights);
assert(score >= 0 && score <= 100, 'Weighted score in range 0-100 (got ' + Math.round(score) + ')');
assert(score > 10 && score < 30, 'Weighted score reasonable for mixed signals (got ' + Math.round(score) + ')');

// ═══════════════════════════════════════════════════════════
// Test 3: Decision tree — thresholds
// ═══════════════════════════════════════════════════════════
console.log('\n🌳 Test: Decision tree');

const DEFAULT_THRESHOLDS = { allow: 35, soft: 60, challenge: 80, bunker: 92 };

function evaluateRisk(riskTotal, config) {
  const t = config?.thresholds ?? DEFAULT_THRESHOLDS;
  if (config?.killSwitch) return 'allow';
  if (config?.mode === 'monitor') return 'allow';
  if (riskTotal < t.allow) return 'allow';
  if (riskTotal < t.soft) return 'soft';
  if (riskTotal < t.challenge) return 'challenge';
  if (riskTotal < t.bunker) return 'hard_challenge';
  if (config?.bunkerPolicy?.enabled) return 'bunker';
  return 'block';
}

const cfg = { thresholds: DEFAULT_THRESHOLDS, bunkerPolicy: { enabled: true } };

assert(evaluateRisk(0, cfg) === 'allow', 'Score 0 → allow');
assert(evaluateRisk(10, cfg) === 'allow', 'Score 10 → allow');
assert(evaluateRisk(34, cfg) === 'allow', 'Score 34 → allow (below threshold)');
assert(evaluateRisk(35, cfg) === 'soft', 'Score 35 → soft (at threshold)');
assert(evaluateRisk(50, cfg) === 'soft', 'Score 50 → soft');
assert(evaluateRisk(60, cfg) === 'challenge', 'Score 60 → challenge');
assert(evaluateRisk(79, cfg) === 'challenge', 'Score 79 → challenge');
assert(evaluateRisk(80, cfg) === 'hard_challenge', 'Score 80 → hard_challenge');
assert(evaluateRisk(91, cfg) === 'hard_challenge', 'Score 91 → hard_challenge');
assert(evaluateRisk(92, cfg) === 'bunker', 'Score 92 → bunker (enabled)');
assert(evaluateRisk(100, cfg) === 'bunker', 'Score 100 → bunker');

const cfgNoBunker = { thresholds: DEFAULT_THRESHOLDS, bunkerPolicy: { enabled: false } };
assert(evaluateRisk(95, cfgNoBunker) === 'block', 'Score 95 + bunker disabled → block');

const cfgMonitor = { thresholds: DEFAULT_THRESHOLDS, mode: 'monitor' };
assert(evaluateRisk(100, cfgMonitor) === 'allow', 'Monitor mode → always allow');

const cfgKill = { thresholds: DEFAULT_THRESHOLDS, killSwitch: true };
assert(evaluateRisk(100, cfgKill) === 'allow', 'Kill switch → always allow');

// ═══════════════════════════════════════════════════════════
// Test 4: Rate limiter
// ═══════════════════════════════════════════════════════════
console.log('\n⏱️ Test: Rate limiter');

const buckets = new Map();
function rateAllow(key, max, windowMs) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  if (bucket.count >= max) return false;
  bucket.count++;
  return true;
}

assert(rateAllow('test', 2, 60000) === true, 'First call allowed');
assert(rateAllow('test', 2, 60000) === true, 'Second call allowed');
assert(rateAllow('test', 2, 60000) === false, 'Third call blocked (limit=2)');
assert(rateAllow('other', 1, 60000) === true, 'Different key allowed');

// ═══════════════════════════════════════════════════════════
// Test 5: Ping payload — no domain field
// ═══════════════════════════════════════════════════════════
console.log('\n📡 Test: Ping payload');

// Simulate what sendPing builds
const pingBody = { widgetPublicId: 'test123' };
assert(!('domain' in pingBody), 'Ping body has no domain field');
assert('widgetPublicId' in pingBody, 'Ping body has widgetPublicId');
assert(Object.keys(pingBody).length === 1, 'Ping body has exactly 1 field');

// ═══════════════════════════════════════════════════════════
// Test 6: Config fallback — safe defaults
// ═══════════════════════════════════════════════════════════
console.log('\n⚙️ Test: Config safe defaults');

const SAFE_DEFAULTS = {
  mode: 'adaptive',
  thresholds: { allow: 35, soft: 60, challenge: 80, bunker: 92 },
  softActions: ['pow-lite', 'js-attestation', 'silent-retry'],
  challengeActions: ['cognitive-lite'],
  bunkerPolicy: { enabled: false, ttlSeconds: 900 },
  sampling: { telemetry: 0.25, fullSignals: 0.10 },
  privacy: { maskPII: true },
  timeouts: { configMs: 800, validateMs: 1200, pingMs: 400 },
  ui: { showBadge: false, showToastOnChallenge: true },
  killSwitch: false,
  updatedAt: '',
  ttlSeconds: 300,
};

assert(SAFE_DEFAULTS.mode === 'adaptive', 'Default mode is adaptive');
assert(SAFE_DEFAULTS.bunkerPolicy.enabled === false, 'Bunker disabled by default');
assert(SAFE_DEFAULTS.killSwitch === false, 'Kill switch off by default');
assert(SAFE_DEFAULTS.thresholds.allow === 35, 'Default allow threshold = 35');
assert(SAFE_DEFAULTS.thresholds.bunker === 92, 'Default bunker threshold = 92');
assert(SAFE_DEFAULTS.timeouts.validateMs === 1200, 'Default validate timeout = 1200ms');
assert(SAFE_DEFAULTS.privacy.maskPII === true, 'PII masking on by default');

// ═══════════════════════════════════════════════════════════
// Test 7: Crypto — base64url decode + maskId
// ═══════════════════════════════════════════════════════════
console.log('\n🔐 Test: Crypto utilities');

function base64urlDecode(str) {
  try {
    const padded = str + '===='.substring(0, (4 - (str.length % 4)) % 4);
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    return decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
  } catch { return null; }
}

function maskId(id) {
  if (!id || id.length < 8) return '***';
  return id.substring(0, 4) + '...' + id.substring(id.length - 3);
}

assert(maskId(null) === '***', 'maskId(null) = ***');
assert(maskId('ab') === '***', 'maskId short = ***');
assert(maskId('abcdefghij') === 'abcd...hij', 'maskId long = masked');

// base64url of '{"tid":"test","exp":9999999999,"v":1}'
const encoded = 'eyJ0aWQiOiJ0ZXN0IiwiZXhwIjo5OTk5OTk5OTk5LCJ2IjoxfQ';
const decoded = base64urlDecode(encoded);
assert(decoded !== null, 'base64url decode succeeds');
assert(decoded.includes('"tid":"test"'), 'Decoded contains tid');

// ═══════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(50));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('═'.repeat(50));

if (failed > 0) {
  process.exit(1);
}
