'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Widget, TestResult } from '@/types/widgets';
import { StroopTestWidget } from './tests/StroopTestWidget';
import { ReactionTimeTestWidget } from './tests/ReactionTimeTestWidget';
import { DigitSpanTestWidget } from './tests/DigitSpanTestWidget';
import { RANVocalTestWidget } from './tests/RANVocalTestWidget';
import { VoiceTestWidget } from './tests/VoiceTestWidget';
import { PatternTestWidget } from './tests/PatternTestWidget';
import { Loader2, Shield, CheckCircle, XCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { detectDevTools } from '@/lib/devtools-detection';

interface Props {
  widgetId: string;
}

export function WidgetRunner({ widgetId }: Props) {
  const [config, setConfig] = useState<Widget | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [verifySuccess, setVerifySuccess] = useState<{
    score: number;
    redirectUrl: string;
    sessionToken?: string;
  } | null>(null);
  const [finalResult, setFinalResult] = useState<{
    success: boolean;
    score: number;
    token?: string;
    error?: string;
    backendStatus?: number;
    backendBody?: string;
  } | null>(null);
  const [devToolsDetected, setDevToolsDetected] = useState(false);
  const [showCloseFallback, setShowCloseFallback] = useState(false);

  const postToHosts = (payload: unknown) => {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
      }
    } catch {
      // ignore
    }
    try {
      if (window.opener && window.opener !== window) {
        window.opener.postMessage(payload, '*');
      }
    } catch {
      // ignore
    }
  };

  // Détection DevTools en production
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      const cleanup = detectDevTools(() => {
        setDevToolsDetected(true);
        // Alerte silencieuse au backend
        fetch(`/api/widget/${widgetId}/alert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'devtools_detected', timestamp: Date.now() }),
        }).catch(() => {});
      });
      return cleanup;
    }
  }, [widgetId]);

  useEffect(() => {
    fetchConfig();
  }, [widgetId]);

  // Notification au parent après vérification réussie
  useEffect(() => {
    if (finalResult && finalResult.success) {
      postToHosts({
        type: 'HCS_CLOSE_WIDGET',
        success: true,
        widgetId,
      });

      const closeTimer = setTimeout(() => {
        // Mode popup (ouvert via window.open)
        try {
          window.close();
        } catch {
          // ignore
        }

        // Mode page/onglet (pas d'iframe, pas d'opener) : revenir au formulaire
        if (window.parent === window && !window.opener) {
          try {
            if (document.referrer) {
              window.location.href = document.referrer;
              return;
            }
            window.history.back();
            return;
          } catch {
            // ignore
          }
        }

        setShowCloseFallback(true);
      }, 1200);

      return () => clearTimeout(closeTimer);
    }
  }, [finalResult]);

  const fetchConfig = async () => {
    try {
      const response = await fetch(`/api/widget/${widgetId}/config`);
      const data = await response.json();
      
      if (data.success) {
        setConfig(data.widget);
      } else {
        console.error('Widget not found');
      }
    } catch (error) {
      console.error('Error fetching widget config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestComplete = (result: TestResult) => {
    const newResults = [...testResults, result];
    setTestResults(newResults);

    const enabledTests = config?.testsConfig.filter(t => t.enabled) || [];
    
    if (currentTestIndex + 1 < enabledTests.length) {
      setCurrentTestIndex(currentTestIndex + 1);
    } else {
      verifyResults(newResults);
    }
  };

  const handleGoBack = () => {
    if (currentTestIndex > 0) {
      setCurrentTestIndex(currentTestIndex - 1);
      setTestResults(testResults.slice(0, -1));
    }
  };

  const verifyResults = async (results: TestResult[]) => {
    setVerifying(true);

    try {
      const response = await fetch(`/api/widget/${widgetId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results,
          deviceFingerprint: getDeviceFingerprint(),
          userAgent: navigator.userAgent,
        }),
      });

      let verifyData: any = null;
      try {
        verifyData = await response.json();
      } catch {
        verifyData = null;
      }

      if (!verifyData || !verifyData.success) {
        setFinalResult({
          success: false,
          score: (verifyData && verifyData.score) || 0,
          error: (verifyData && verifyData.error) || 'Verification failed',
          backendStatus: verifyData && verifyData.backendStatus,
          backendBody: verifyData && verifyData.backendBody,
        });

        postToHosts({
          type: 'HCS_VERIFICATION_FAILED',
          error: (verifyData && verifyData.error) || 'Verification failed',
          score: verifyData && verifyData.score,
          widgetId,
          backendStatus: verifyData && verifyData.backendStatus,
          backendBody: verifyData && verifyData.backendBody,
        });
        return;
      }

      postToHosts({
        type: 'HCS_VERIFICATION_SUCCESS',
        token: verifyData.token,
        score: verifyData.score,
        widgetId,
        metadata: verifyData.metadata,
      });

      const redirectApiBase =
        process.env.NEXT_PUBLIC_HCS_BACKEND_URL ||
        'https://hcs-u7-backend.onrender.com';
      const defaultTenantId =
        process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID ||
        'cmku6oui4000a04jofxudcigo';

      const redirectResponse = await fetch(`${redirectApiBase}/hcs/verify-and-redirect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: verifyData.token,
          tenantId: config?.tenantId || defaultTenantId,
          appId: getAppIdFromUrl() || 'default',
        }),
      });

      let redirectData: any = null;
      try {
        redirectData = await redirectResponse.json();
      } catch {
        redirectData = null;
      }

      if (!redirectResponse.ok || !redirectData || !redirectData.success || !redirectData.redirectUrl) {
        setFinalResult({
          success: false,
          score: verifyData.score || 0,
          error: (redirectData && redirectData.error) || 'Redirect failed',
          backendStatus: redirectResponse.status,
          backendBody: redirectData ? JSON.stringify(redirectData) : undefined,
        });

        postToHosts({
          type: 'HCS_VERIFICATION_FAILED',
          error: (redirectData && redirectData.error) || 'Redirect failed',
          score: verifyData.score,
          widgetId,
          backendStatus: redirectResponse.status,
          backendBody: redirectData ? JSON.stringify(redirectData) : undefined,
        });
        return;
      }

      setVerifySuccess({
        score: verifyData.score,
        redirectUrl: redirectData.redirectUrl,
        sessionToken: redirectData.sessionToken,
      });

      postToHosts({
        type: 'HCS_VERIFICATION_REDIRECT',
        redirectUrl: redirectData.redirectUrl,
        sessionToken: redirectData.sessionToken,
        widgetId,
      });

      setTimeout(() => {
        try {
          if (window.top) {
            window.top.location.href = redirectData.redirectUrl;
            return;
          }
        } catch {
          // ignore
        }
        window.location.href = redirectData.redirectUrl;
      }, 2000);
    } catch (error) {
      console.error('Verification error:', error);
      setFinalResult({ success: false, score: 0, error: 'Internal error' });

      postToHosts({
        type: 'HCS_VERIFICATION_ERROR',
        error: 'Internal error',
        widgetId,
      });
    } finally {
      setVerifying(false);
    }
  };

  const getAppIdFromUrl = (): string | null => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('appId');
    } catch {
      return null;
    }
  };

  const getDeviceFingerprint = () => {
    return btoa(navigator.userAgent + navigator.language + screen.width + screen.height);
  };

  // Blocage si DevTools détecté
  if (devToolsDetected) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-orange-500" />
          <p className="text-orange-600 font-semibold">Vérification interrompue</p>
          <p className="text-zinc-500 text-sm mt-2">
            Outils de développement détectés. Veuillez les fermer et rafraîchir la page.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-zinc-600">Chargement...</p>
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="py-12 text-center">
          <XCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
          <p className="text-red-600 font-medium">Widget introuvable</p>
          <p className="text-zinc-500 text-sm mt-2">Vérifiez l'ID du widget</p>
        </CardContent>
      </Card>
    );
  }

  if (verifying) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-zinc-600">Vérification en cours...</p>
        </CardContent>
      </Card>
    );
  }

  if (verifySuccess) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="py-12 text-center">
          <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
          <p className="text-green-600 font-semibold text-xl">Vérification réussie !</p>
          <p className="text-zinc-500 mt-2">Score: {verifySuccess.score}/100</p>
          <div className="mt-6 bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">Redirection vers l'application...</p>
            <div className="mt-3 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          </div>
          <p className="text-xs text-zinc-500 mt-6">
            Si la redirection ne fonctionne pas,{' '}
            <a href={verifySuccess.redirectUrl} className="text-blue-600 hover:underline">
              cliquez ici
            </a>
          </p>
        </CardContent>
      </Card>
    );
  }

  if (finalResult) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="py-12 text-center">
          {finalResult.success ? (
            <>
              <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
              <p className="text-green-600 font-semibold text-xl">Vérification réussie !</p>
              <p className="text-zinc-500 mt-2">Score: {finalResult.score}/100</p>
              <p className="text-zinc-400 text-sm mt-4">Vous pouvez maintenant continuer</p>
              {finalResult.token && (
                <p className="text-xs text-zinc-400 mt-2 font-mono">Token: {finalResult.token.substring(0, 20)}...</p>
              )}
              {showCloseFallback && (
                <div className="mt-6 flex justify-center">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      try {
                        window.close();
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    Fermer
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <XCircle className="h-16 w-16 mx-auto mb-4 text-red-500" />
              <p className="text-red-600 font-semibold text-xl">Vérification échouée</p>
              <p className="text-zinc-500 mt-2">Score: {finalResult.score}/100</p>
              {finalResult.error && (
                <p className="text-zinc-400 text-sm mt-4">{finalResult.error}</p>
              )}
              {(finalResult.backendStatus || finalResult.backendBody) && (
                <div className="mt-4 text-left text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-900/40 rounded-md p-3 font-mono whitespace-pre-wrap wrap-break-word">
                  {finalResult.backendStatus ? `Status: ${finalResult.backendStatus}\n` : ''}
                  {finalResult.backendBody ? String(finalResult.backendBody).slice(0, 500) : ''}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  const enabledTests = config.testsConfig.filter(t => t.enabled);
  const currentTest = enabledTests[currentTestIndex];

  if (!currentTest) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="py-12 text-center">
          <p className="text-zinc-600">Aucun test configuré</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Vérification Humaine
          </span>
          <span className="text-sm font-normal text-zinc-500">
            Test {currentTestIndex + 1}/{enabledTests.length}
          </span>
        </CardTitle>
        
        <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2 mt-4">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentTestIndex + 1) / enabledTests.length) * 100}%` }}
          />
        </div>

        {currentTestIndex > 0 && (
          <div className="mt-4">
            <Button
              onClick={handleGoBack}
              variant="ghost"
              size="sm"
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {currentTest.testType === 'stroop' && (
          <StroopTestWidget
            config={currentTest}
            onComplete={(data) =>
              handleTestComplete({
                testType: 'stroop',
                score: data.score,
                duration: data.duration,
                data,
              })
            }
          />
        )}

        {currentTest.testType === 'digit_span' && (
          <DigitSpanTestWidget
            config={currentTest}
            onComplete={(data) =>
              handleTestComplete({
                testType: 'digit_span',
                score: data.score,
                duration: data.duration,
                data,
              })
            }
          />
        )}

        {currentTest.testType === 'reaction_time' && (
          <ReactionTimeTestWidget
            config={currentTest}
            onComplete={(data) =>
              handleTestComplete({
                testType: 'reaction_time',
                score: data.score,
                duration: data.duration,
                data,
              })
            }
          />
        )}

        {currentTest.testType === 'ran_vocal' && (
          <RANVocalTestWidget
            config={currentTest}
            onComplete={(data) =>
              handleTestComplete({
                testType: 'ran_vocal',
                score: data.score,
                duration: data.duration,
                data,
              })
            }
          />
        )}

        {currentTest.testType === 'voice' && (
          <VoiceTestWidget
            config={currentTest}
            onComplete={(data) =>
              handleTestComplete({
                testType: 'voice',
                score: data.score,
                duration: data.duration,
                data,
              })
            }
          />
        )}

        {currentTest.testType === 'pattern' && (
          <PatternTestWidget
            config={currentTest}
            onComplete={(data) =>
              handleTestComplete({
                testType: 'pattern',
                score: data.score,
                duration: data.duration,
                data,
              })
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

