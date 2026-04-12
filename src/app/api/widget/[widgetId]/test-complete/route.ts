/**
 * POST /api/widget/[widgetId]/test-complete
 *
 * Called by the widget frontend after each individual test completes.
 * Accepts raw test events (timing arrays, correctness counts) and returns
 * a server-signed test token that cryptographically binds the raw events
 * to this widgetId. The token must be included in the /verify request.
 *
 * SECURITY: No score is accepted from the client. Scores are derived
 * server-side during verification from the raw events embedded in the token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { padResponseTime } from '@/lib/timing-safe';
import { issueTestToken, type RawTestEvents } from '@/lib/test-token';
import { isAllowedTestType } from '@/lib/score-engine';

const MAX_RT_ENTRIES = 200;
const MAX_TRIAL_EVENTS = 200;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ widgetId: string }> },
) {
  const startTime = Date.now();
  try {
    const { widgetId } = await params;

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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Request body must be a JSON object' },
        { status: 400 },
      );
    }

    const { testType, rawEvents } = body as Record<string, unknown>;

    if (typeof testType !== 'string' || !isAllowedTestType(testType)) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Invalid or unsupported testType' },
        { status: 422 },
      );
    }

    if (!rawEvents || typeof rawEvents !== 'object' || Array.isArray(rawEvents)) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'rawEvents must be a JSON object' },
        { status: 422 },
      );
    }

    const raw = rawEvents as Record<string, unknown>;
    const sanitized: RawTestEvents = {};

    if (Array.isArray(raw.reactionTimes)) {
      sanitized.reactionTimes = (raw.reactionTimes as unknown[])
        .slice(0, MAX_RT_ENTRIES)
        .filter(
          (v): v is number =>
            typeof v === 'number' && isFinite(v) && v >= 0 && v <= 60000,
        );
    }

    if (typeof raw.errors === 'number' && isFinite(raw.errors) && raw.errors >= 0) {
      sanitized.errors = Math.floor(raw.errors);
    }

    if (typeof raw.correctCount === 'number' && isFinite(raw.correctCount) && raw.correctCount >= 0) {
      sanitized.correctCount = Math.floor(raw.correctCount);
    }

    if (typeof raw.totalCount === 'number' && isFinite(raw.totalCount) && raw.totalCount >= 0) {
      sanitized.totalCount = Math.floor(raw.totalCount);
    }

    if (Array.isArray(raw.trialEvents)) {
      sanitized.trialEvents = (raw.trialEvents as unknown[])
        .slice(0, MAX_TRIAL_EVENTS)
        .filter((e): e is Record<string, unknown> => {
          if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
          const ev = e as Record<string, unknown>;
          return typeof ev.t === 'number' && typeof ev.correct === 'boolean';
        })
        .map((e) => ({
          t: Number(e.t),
          correct: Boolean(e.correct),
          ...(typeof e.rt === 'number' && isFinite(e.rt) ? { rt: e.rt } : {}),
        }));
    }

    let testToken: string;
    try {
      testToken = issueTestToken(testType, widgetId, sanitized);
    } catch {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Service configuration error' },
        { status: 503 },
      );
    }

    await padResponseTime(startTime);
    return NextResponse.json({ success: true, testToken });
  } catch {
    await padResponseTime(startTime);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
