/**
 * POST /api/widget/[widgetId]/verify
 *
 * SECURITY: Client-provided scores are rejected entirely.
 * Each result MUST include a server-issued testToken obtained from
 * /api/widget/[widgetId]/test-complete. The token is HMAC-verified and
 * the score is recomputed server-side from the raw events embedded in it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { padResponseTime } from '@/lib/timing-safe';
import { verifyTestToken } from '@/lib/test-token';
import { computeScore } from '@/lib/score-engine';

interface TestResult {
  testType: string;
  testToken: string;
  duration: number;
}

interface VerifyRequest {
  results: TestResult[];
  deviceFingerprint: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ widgetId: string }> },
) {
  const startTime = Date.now();
  try {
    const { widgetId } = await params;

    // Validate widgetId — enforce charset allowlist (fixes M-2)
    if (!widgetId || widgetId.length > 255 || /[^a-zA-Z0-9\-_]/.test(widgetId)) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Invalid widget ID' },
        { status: 400 },
      );
    }

    if (!req.headers.get('content-type')?.includes('application/json')) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Content-Type must be application/json' },
        { status: 415 },
      );
    }

    let body: VerifyRequest;
    try {
      body = await req.json();
    } catch {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    if (!body || typeof body !== 'object') {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Request body must be a JSON object' },
        { status: 400 },
      );
    }

    const { results, deviceFingerprint } = body;

    if (!Array.isArray(results)) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'results must be a non-null array' },
        { status: 422 },
      );
    }

    if (results.length === 0 || results.length > 10) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'results must contain between 1 and 10 items' },
        { status: 422 },
      );
    }

    if (
      typeof deviceFingerprint !== 'string' ||
      deviceFingerprint.length === 0 ||
      deviceFingerprint.length > 1024
    ) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'deviceFingerprint must be a non-empty string (max 1024 chars)' },
        { status: 422 },
      );
    }

    // Validate each result, verify its token, and compute score server-side
    const computedResults: Array<{ testType: string; score: number; duration: number }> = [];

    for (const r of results) {
      if (!r || typeof r !== 'object') {
        await padResponseTime(startTime);
        return NextResponse.json(
          { success: false, error: 'Each result must be a valid object' },
          { status: 422 },
        );
      }

      if (typeof r.testType !== 'string' || r.testType.length === 0 || r.testType.length > 100) {
        await padResponseTime(startTime);
        return NextResponse.json(
          { success: false, error: 'Each result must have a valid testType string' },
          { status: 422 },
        );
      }

      // SECURITY: testToken is required — no score is accepted from the client
      if (typeof r.testToken !== 'string' || r.testToken.length === 0 || r.testToken.length > 8192) {
        await padResponseTime(startTime);
        return NextResponse.json(
          { success: false, error: 'Each result must include a server-issued testToken' },
          { status: 422 },
        );
      }

      if (
        typeof r.duration !== 'number' ||
        !isFinite(r.duration) ||
        r.duration < 0 ||
        r.duration > 300000
      ) {
        await padResponseTime(startTime);
        return NextResponse.json(
          { success: false, error: 'Each result duration must be a number between 0 and 300000' },
          { status: 422 },
        );
      }

      // SECURITY: Verify HMAC signature, expiry, and widgetId binding
      const tokenPayload = verifyTestToken(r.testToken, widgetId);
      if (!tokenPayload) {
        await padResponseTime(startTime);
        return NextResponse.json(
          { success: false, error: 'Invalid or expired test token' },
          { status: 403 },
        );
      }

      // SECURITY: Verify testType matches what was recorded at test-complete time
      if (tokenPayload.testType !== r.testType) {
        await padResponseTime(startTime);
        return NextResponse.json(
          { success: false, error: 'Test token type mismatch' },
          { status: 403 },
        );
      }

      // SECURITY: Compute score server-side from raw events embedded in the signed token.
      // The client never touches the score value.
      const score = computeScore(tokenPayload.testType, tokenPayload.rawEvents);

      computedResults.push({
        testType: r.testType.slice(0, 100),
        score,
        duration: Math.min(300000, Math.max(0, r.duration)),
      });
    }

    const backendUrl = process.env.HCS_BACKEND_URL;
    const apiKey = process.env.HCS_BACKEND_API_KEY;

    if (!backendUrl || !apiKey) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Service configuration error' },
        { status: 503 },
      );
    }

    const clientIp =
      req.headers.get('x-real-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0] ||
      'unknown';

    // Use the real request User-Agent, not a client-supplied body field (fixes M-1)
    const serverUserAgent = req.headers.get('user-agent') || 'unknown';

    const response = await fetch(`${backendUrl}/api/widgets/${widgetId}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HCS-Origin': 'widget-mvp',
        'X-HCS-API-Key': apiKey,
        'X-Forwarded-For': clientIp,
        'User-Agent': serverUserAgent,
        'X-HCS-Client-UA': serverUserAgent,
      },
      body: JSON.stringify({
        results: computedResults,
        deviceFingerprint,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      await padResponseTime(startTime);
      return NextResponse.json({
        success: data.success,
        token: data.token,
        score: data.score,
        metadata: data.metadata,
      });
    }

    await padResponseTime(startTime);
    return NextResponse.json(
      { success: false, error: 'External backend verification failed' },
      { status: 502 },
    );
  } catch {
    await padResponseTime(startTime);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
