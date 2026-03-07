import { NextRequest, NextResponse } from 'next/server';
import { padResponseTime } from '@/lib/timing-safe';

interface TestResult {
  testType: string;
  score: number;
  duration: number;
  data: unknown;
}

interface VerifyRequest {
  results: TestResult[];
  deviceFingerprint: string;
  userAgent: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ widgetId: string }> }
) {
  const startTime = Date.now();
  try {
    const { widgetId } = await params;

    // Validate widgetId
    if (!widgetId || widgetId.length > 255) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Invalid widget ID' },
        { status: 400 }
      );
    }

    // Validate Content-Type
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Content-Type must be application/json' },
        { status: 415 }
      );
    }

    // Parse JSON body safely
    let body: VerifyRequest;
    try {
      body = await req.json();
    } catch {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body || typeof body !== 'object') {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Request body must be a JSON object' },
        { status: 400 }
      );
    }

    const { results, deviceFingerprint, userAgent } = body;

    // Validate results array
    if (!Array.isArray(results)) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'results must be a non-null array' },
        { status: 422 }
      );
    }

    if (results.length === 0 || results.length > 100) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'results must contain between 1 and 100 items' },
        { status: 422 }
      );
    }

    // Validate deviceFingerprint and userAgent
    if (typeof deviceFingerprint !== 'string' || deviceFingerprint.length === 0 || deviceFingerprint.length > 1024) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'deviceFingerprint must be a non-empty string (max 1024 chars)' },
        { status: 422 }
      );
    }

    if (typeof userAgent !== 'string' || userAgent.length === 0 || userAgent.length > 1024) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'userAgent must be a non-empty string (max 1024 chars)' },
        { status: 422 }
      );
    }

    // Validate and sanitize each result
    for (const r of results) {
      if (!r || typeof r !== 'object') {
        await padResponseTime(startTime);
        return NextResponse.json(
          { success: false, error: 'Each result must be a valid object' },
          { status: 422 }
        );
      }
      if (typeof r.testType !== 'string' || r.testType.length === 0 || r.testType.length > 100) {
        await padResponseTime(startTime);
        return NextResponse.json(
          { success: false, error: 'Each result must have a valid testType string' },
          { status: 422 }
        );
      }
      if (typeof r.score !== 'number' || !isFinite(r.score) || r.score < 0 || r.score > 100) {
        await padResponseTime(startTime);
        return NextResponse.json(
          { success: false, error: 'Each result score must be a number between 0 and 100' },
          { status: 422 }
        );
      }
      if (typeof r.duration !== 'number' || !isFinite(r.duration) || r.duration < 0 || r.duration > 300000) {
        await padResponseTime(startTime);
        return NextResponse.json(
          { success: false, error: 'Each result duration must be a number between 0 and 300000' },
          { status: 422 }
        );
      }
    }
    
    console.log('[Backend] Received verification request for widget:', widgetId);
    console.log('[Backend] Results:', JSON.stringify(results, null, 2));

    const sanitizedResults = results.map(r => ({
      testType: r.testType.slice(0, 100),
      score: Math.min(100, Math.max(0, r.score)),
      duration: Math.min(300000, Math.max(0, r.duration)),
    }));

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                     req.headers.get('x-real-ip') || 
                     'unknown';

    const backendUrl = process.env.HCS_BACKEND_URL;
    const apiKey = process.env.HCS_BACKEND_API_KEY;

    if (!backendUrl || !apiKey) {
      console.error('[VERIFY] Missing HCS_BACKEND_URL or HCS_BACKEND_API_KEY');
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Service configuration error' },
        { status: 503 }
      );
    }
    console.log('[Backend] Calling external backend:', `${backendUrl}/api/widgets/${widgetId}/verify`);

    // Appel au backend HCS-U7 réel
    const response = await fetch(
      `${backendUrl}/api/widgets/${widgetId}/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-HCS-Origin': 'widget-mvp',
          'X-HCS-API-Key': apiKey,
          'X-Forwarded-For': clientIp,
          'User-Agent': userAgent,
          'X-HCS-Client-UA': userAgent,
        },
        body: JSON.stringify({
          results: sanitizedResults,
          deviceFingerprint,
          userAgent,
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      console.log('[Backend] External backend response:', data);
      await padResponseTime(startTime);
      return NextResponse.json({
        success: data.success,
        token: data.token,
        score: data.score,
        metadata: data.metadata,
      });
    }

    const errorBody = await response.text();
    console.warn('[Backend] External backend returned non-OK', response.status, errorBody);

    await padResponseTime(startTime);
    return NextResponse.json(
      {
        success: false,
        error: 'External backend verification failed',
      },
      { status: 502 }
    );

  } catch (error) {
    console.error('Error verifying widget:', error);
    await padResponseTime(startTime);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
