import { NextRequest, NextResponse } from 'next/server';

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
  try {
    const { widgetId } = await params;
    const body: VerifyRequest = await req.json();
    const { results, deviceFingerprint, userAgent } = body;
    
    console.log('[Backend] Received verification request for widget:', widgetId);
    console.log('[Backend] Results:', JSON.stringify(results, null, 2));

    const sanitizedResults = (results || []).map(r => ({
      testType: r.testType,
      score: r.score,
      duration: r.duration,
    }));

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                     req.headers.get('x-real-ip') || 
                     'unknown';

    const backendUrl = process.env.HCS_BACKEND_URL || 'https://hcs-u7-backend.onrender.com';
    console.log('[Backend] Calling external backend:', `${backendUrl}/api/widgets/${widgetId}/verify`);

    // Appel au backend HCS-U7 réel
    const response = await fetch(
      `${backendUrl}/api/widgets/${widgetId}/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-HCS-Origin': 'widget-mvp',
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
      return NextResponse.json({
        success: data.success,
        token: data.token,
        score: data.score,
        metadata: data.metadata,
      });
    }

    const errorBody = await response.text();
    console.warn('[Backend] External backend returned non-OK', response.status, errorBody);

    return NextResponse.json(
      {
        success: false,
        error: 'External backend verification failed',
        backendStatus: response.status,
        backendBody: errorBody,
      },
      { status: 502 }
    );

  } catch (error) {
    console.error('Error verifying widget:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', _error: String(error) },
      { status: 500 }
    );
  }
}
