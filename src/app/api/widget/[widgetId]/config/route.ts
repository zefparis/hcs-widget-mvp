import { NextRequest, NextResponse } from 'next/server';
import { padResponseTime } from '@/lib/timing-safe';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ widgetId: string }> }
) {
  const startTime = Date.now();
  try {
    const { widgetId } = await params;

    // Validate widgetId
    if (!widgetId || widgetId.length > 255 || /[^a-zA-Z0-9\-_]/.test(widgetId)) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Invalid widget ID' },
        { status: 400 }
      );
    }
    
    const backendUrl = process.env.HCS_BACKEND_URL;
    const apiKey = process.env.HCS_WIDGET_API_KEY;

    if (!backendUrl || !apiKey) {
      console.error('[CONFIG] Missing HCS_BACKEND_URL or HCS_WIDGET_API_KEY');
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Service configuration error' },
        { status: 503 }
      );
    }
    // SECURITY: Only use the server-only env var — never NEXT_PUBLIC_* or hardcoded literals
    const defaultTenantId = process.env.HCS_DEFAULT_TENANT_ID;

    // Appel au backend HCS-U7 réel
    const response = await fetch(
      `${backendUrl}/api/widgets/${widgetId}/public-config`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-HCS-Origin': 'widget-mvp',
          'X-HCS-API-Key': apiKey,
        },
        cache: 'no-store',
      }
    );

    if (response.ok) {
      const data = await response.json();
      const widget = data.widget || data;

      // Resolve tenantId — prefer backend value; fall back only to server-only env var
      const tenantId = widget.tenantId || defaultTenantId;
      if (!tenantId) {
        console.error('[CONFIG] Widget has no tenantId and HCS_DEFAULT_TENANT_ID is not set');
        await padResponseTime(startTime);
        return NextResponse.json(
          { success: false, error: 'Service configuration error' },
          { status: 500 },
        );
      }

      await padResponseTime(startTime);
      return NextResponse.json({
        success: true,
        widget: { ...widget, tenantId },
      });
    }

    if (response.status === 404) {
      await padResponseTime(startTime);
      return NextResponse.json(
        { success: false, error: 'Widget not found' },
        { status: 404 },
      );
    }

    // Backend error — do not return a permissive fallback config
    console.error(`[CONFIG] Backend returned ${response.status} for widget ${widgetId}`);
    await padResponseTime(startTime);
    return NextResponse.json(
      { success: false, error: 'Service temporarily unavailable' },
      { status: 503 },
    );

  } catch (error) {
    console.error('[CONFIG] Network error fetching widget config:', error);
    await padResponseTime(startTime);
    return NextResponse.json(
      { success: false, error: 'Service temporarily unavailable' },
      { status: 503 },
    );
  }
}
