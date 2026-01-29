import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ widgetId: string }> }
) {
  try {
    const { widgetId } = await params;
    
    const backendUrl = process.env.HCS_BACKEND_URL || 'https://hcs-u7-backend.onrender.com';
    const defaultTenantId =
      process.env.HCS_DEFAULT_TENANT_ID ||
      process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID ||
      'cmku6oui4000a04jofxudcigo';

    // Appel au backend HCS-U7 réel
    const response = await fetch(
      `${backendUrl}/api/widgets/${widgetId}/public-config`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-HCS-Origin': 'widget-mvp',
        },
        cache: 'no-store',
      }
    );

    if (response.ok) {
      const data = await response.json();
      const widget = data.widget || data;
      return NextResponse.json({
        success: true,
        widget: {
          ...widget,
          tenantId: widget.tenantId || defaultTenantId,
        },
      });
    }

    // Fallback si le backend ne répond pas correctement
    if (response.status === 404) {
      return NextResponse.json(
        { success: false, error: 'Widget not found' },
        { status: 404 }
      );
    }

    // Si erreur backend, utiliser config de fallback pour le dev
    console.warn(`Backend returned ${response.status}, using fallback config`);
    const fallbackWidget = {
      id: widgetId,
      name: 'HCS Widget',
      siteUrl: req.headers.get('origin') || 'http://localhost:3000',
      tenantId: defaultTenantId,
      testsConfig: [
        { testType: 'stroop', enabled: true, trials: 5 },
        { testType: 'reaction_time', enabled: true, trials: 3 },
        { testType: 'digit_span', enabled: true, trials: 5 },
      ],
      theme: 'light',
      language: 'fr',
    };

    return NextResponse.json({
      success: true,
      widget: fallbackWidget,
      _fallback: true,
    });

  } catch (error) {
    console.error('Error fetching widget config:', error);
    
    // Fallback en cas d'erreur réseau
    const { widgetId } = await params;
    const defaultTenantId =
      process.env.HCS_DEFAULT_TENANT_ID ||
      process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID ||
      'cmku6oui4000a04jofxudcigo';
    const fallbackWidget = {
      id: widgetId,
      name: 'HCS Widget (Offline)',
      tenantId: defaultTenantId,
      testsConfig: [
        { testType: 'stroop', enabled: true, trials: 5 },
        { testType: 'reaction_time', enabled: true, trials: 3 },
        { testType: 'digit_span', enabled: true, trials: 5 },
      ],
      theme: 'light',
      language: 'fr',
    };

    return NextResponse.json({
      success: true,
      widget: fallbackWidget,
      _fallback: true,
      _error: String(error),
    });
  }
}
