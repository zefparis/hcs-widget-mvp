/**
 * Server-side test token issuance and verification.
 *
 * Tokens are HMAC-SHA256 signed, stateless (no Redis required), and
 * embed raw test events so the verify route can recompute scores
 * without trusting any client-provided value.
 *
 * Format: base64url(JSON payload) + "." + HMAC-SHA256 hex
 * TTL   : 15 minutes
 * Secret: HCS_TEST_TOKEN_SECRET (server-only env var)
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_TOKEN_BODY_BYTES = 16384;

export interface RawTestEvents {
  reactionTimes?: number[];
  errors?: number;
  correctCount?: number;
  totalCount?: number;
  trialEvents?: Array<{ t: number; correct: boolean; rt?: number }>;
}

export interface TestTokenPayload {
  testType: string;
  widgetId: string;
  rawEvents: RawTestEvents;
  iat: number;
  exp: number;
  nonce: string;
}

function getSecret(): string {
  const secret = process.env.HCS_TEST_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('HCS_TEST_TOKEN_SECRET is not configured or is too short (min 32 chars)');
  }
  return secret;
}

function toBase64Url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}

function fromBase64Url(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('hex');
}

function safeTimingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    const aBuf = Buffer.from(a, 'hex');
    const bBuf = Buffer.from(b, 'hex');
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

/**
 * Issue a server-signed test token embedding raw events.
 * Called by the test-complete endpoint after the frontend finishes a test.
 * Throws if HCS_TEST_TOKEN_SECRET is not configured.
 */
export function issueTestToken(
  testType: string,
  widgetId: string,
  rawEvents: RawTestEvents,
): string {
  const secret = getSecret();
  const now = Date.now();

  const payload: TestTokenPayload = {
    testType,
    widgetId,
    rawEvents,
    iat: now,
    exp: now + TOKEN_TTL_MS,
    nonce: randomBytes(16).toString('hex'),
  };

  const jsonPayload = JSON.stringify(payload);
  if (Buffer.byteLength(jsonPayload, 'utf8') > MAX_TOKEN_BODY_BYTES) {
    throw new Error('Token payload exceeds size limit');
  }

  const encodedPayload = toBase64Url(jsonPayload);
  const sig = sign(encodedPayload, secret);
  return `${encodedPayload}.${sig}`;
}

/**
 * Verify a test token.
 * Returns the decoded payload, or null if the token is invalid, expired,
 * or bound to a different widgetId.
 * Never throws — always returns null on any error.
 */
export function verifyTestToken(
  token: string,
  expectedWidgetId: string,
): TestTokenPayload | null {
  try {
    const secret = getSecret();

    const dotIndex = token.lastIndexOf('.');
    if (dotIndex === -1 || dotIndex === 0 || dotIndex === token.length - 1) return null;

    const encodedPayload = token.slice(0, dotIndex);
    const sig = token.slice(dotIndex + 1);

    if (!safeTimingSafeEqual(sig, sign(encodedPayload, secret))) return null;

    const jsonPayload = fromBase64Url(encodedPayload);
    const payload = JSON.parse(jsonPayload) as TestTokenPayload;

    if (typeof payload !== 'object' || payload === null) return null;
    if (Date.now() > payload.exp) return null;
    if (payload.widgetId !== expectedWidgetId) return null;
    if (typeof payload.testType !== 'string') return null;

    return payload;
  } catch {
    return null;
  }
}
