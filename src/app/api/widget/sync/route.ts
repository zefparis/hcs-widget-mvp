import { NextRequest, NextResponse } from 'next/server';

const DASHBOARD_API_KEY = process.env.DASHBOARD_API_KEY || 'hcs_dashboard_secret_key_2026';

interface WidgetSyncRequest {
  action: 'sync';
  widget: {
    id: string;
    name: string;
    tenantId: string;
    siteUrl: string;
    mode: 'basic' | 'standard' | 'fort_knox';
    threshold: number;
    tests: Array<{
      type: string;
      enabled: boolean;
      trials?: number;
      difficulty?: 'easy' | 'medium' | 'hard';
    }>;
    theme?: 'light' | 'dark' | 'auto';
    language?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('X-HCS-Dashboard-Key');
    
    if (!apiKey || apiKey !== DASHBOARD_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body: WidgetSyncRequest = await req.json();

    if (body.action !== 'sync') {
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
    }

    if (!body.widget || !body.widget.id) {
      return NextResponse.json(
        { success: false, error: 'Widget ID required' },
        { status: 400 }
      );
    }

    console.log(`📥 Received widget sync: ${body.widget.id} (${body.widget.name})`);

    const widgetConfig = mapDashboardToWidget(body.widget);

    const backendUrl = process.env.HCS_BACKEND_URL || 'https://hcs-u7-backend.onrender.com';
    const backendApiKey = process.env.HCS_BACKEND_API_KEY || 'hcs_backend_secret_key_2026';
    
    try {
      const response = await fetch(`${backendUrl}/api/widgets/${body.widget.id}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-HCS-Origin': 'widget-mvp',
          'X-HCS-API-Key': backendApiKey,
        },
        body: JSON.stringify(widgetConfig),
      });

      if (!response.ok) {
        console.warn('⚠️ Backend sync failed, widget will use local config');
      } else {
        console.log('✅ Widget synced to backend');
      }
    } catch (error) {
      console.warn('⚠️ Backend unreachable, widget will use local config');
    }

    const embedCode = generateEmbedCode(body.widget.id, body.widget.tenantId);

    console.log(`✅ Widget ${body.widget.id} synchronized successfully`);

    return NextResponse.json({
      success: true,
      widgetId: body.widget.id,
      message: 'Widget synchronized successfully',
      embedCode,
      config: widgetConfig,
    });

  } catch (error) {
    console.error('❌ Widget sync error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

function mapDashboardToWidget(dashboardWidget: any) {
  const modeConfig: Record<string, { threshold: number; defaultDifficulty: 'easy' | 'medium' | 'hard' }> = {
    basic: { threshold: 50, defaultDifficulty: 'easy' as const },
    standard: { threshold: 65, defaultDifficulty: 'medium' as const },
    fort_knox: { threshold: 75, defaultDifficulty: 'hard' as const },
  };

  // Mapping des noms de tests du dashboard vers les types du widget
  const testNameMapping: Record<string, string> = {
    'Test de Stroop': 'stroop',
    'stroop': 'stroop',
    'RAN Vocal': 'ran_vocal',
    'ran_vocal': 'ran_vocal',
    'Biométrie Vocale': 'voice',
    'voice': 'voice',
    'Empan Mnésique': 'digit_span',
    'digit_span': 'digit_span',
    'Temps de Réaction': 'reaction_time',
    'reaction_time': 'reaction_time',
    'Reconnaissance de Motifs': 'pattern',
    'pattern': 'pattern',
  };

  const config = modeConfig[dashboardWidget.mode] || modeConfig.standard;

  return {
    id: dashboardWidget.id,
    name: dashboardWidget.name,
    siteUrl: dashboardWidget.siteUrl,
    tenantId: dashboardWidget.tenantId,
    threshold: dashboardWidget.threshold || config.threshold,
    testsConfig: dashboardWidget.tests.map((test: any) => {
      const mappedType = testNameMapping[test.type] || test.type;
      return {
        testType: mappedType,
        enabled: test.enabled,
        trials: test.trials || 5,
        difficulty: test.difficulty || config.defaultDifficulty,
        timeLimit: test.timeLimit,
      };
    }),
    theme: dashboardWidget.theme || 'light',
    language: dashboardWidget.language || 'fr',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function generateEmbedCode(widgetId: string, tenantId: string) {
  return `<!-- HCS-U7 Anti-Bot Widget -->
<script src="https://hcs-widget-mvp.vercel.app/widget/v1/captcha.js"></script>
<div id="hcs-captcha" 
     data-hcs-widget-id="${widgetId}"
     data-hcs-callback="onHCSSuccess">
</div>

<script>
function onHCSSuccess(token, score) {
  console.log('✅ Verification success:', { token, score });
  
  fetch('https://hcs-u7-backend.onrender.com/hcs/verify-and-redirect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      token: token,
      tenantId: '${tenantId}',
      appId: 'your_app_id'
    })
  })
    .then(r => r.json())
    .then(data => {
      if (data && data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    })
    .catch(err => console.error('Verification failed:', err));
}
</script>`;
}
