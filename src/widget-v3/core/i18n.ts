/**
 * HCS-U7 Widget v3 — Internationalization (FR/EN)
 * Detects browser language and provides translated strings.
 * Default: English. French if navigator.language starts with 'fr'.
 */

type Lang = 'fr' | 'en';

const translations = {
  en: {
    // Challenge
    challengeTitle: 'Human Verification',
    challengeInstruction: 'Move the slider to ',
    challengeValidate: 'Validate',
    challengeBranding: 'Protected by HCS-U7',

    // Block
    blockTitle: 'Access Blocked',
    blockMessage: 'Your access has been blocked by HCS-U7 Protection.',
    blockReason: 'Reason: ',
    blockBranding: 'Protected by HCS-U7',

    // Bunker
    bunkerTitle: 'Security Verification Required',
    bunkerDescription: 'Enhanced security is active. Please complete the verification to continue.',
    bunkerInstruction: 'Move the slider precisely to ',
    bunkerVerify: 'Verify',
    bunkerRetry: 'Incorrect. Try again — move to ',
    bunkerBranding: 'Protected by HCS-U7 Bunker Mode',
  },
  fr: {
    // Challenge
    challengeTitle: 'Vérification humaine',
    challengeInstruction: 'Déplacez le curseur sur ',
    challengeValidate: 'Valider',
    challengeBranding: 'Protégé par HCS-U7',

    // Block
    blockTitle: 'Accès bloqué',
    blockMessage: 'Votre accès a été bloqué par la protection HCS-U7.',
    blockReason: 'Raison : ',
    blockBranding: 'Protégé par HCS-U7',

    // Bunker
    bunkerTitle: 'Vérification de sécurité requise',
    bunkerDescription: 'La sécurité renforcée est active. Veuillez compléter la vérification pour continuer.',
    bunkerInstruction: 'Déplacez le curseur précisément sur ',
    bunkerVerify: 'Vérifier',
    bunkerRetry: 'Incorrect. Réessayez — déplacez sur ',
    bunkerBranding: 'Protégé par HCS-U7 Mode Bunker',
  },
} as const;

export type I18nKey = keyof typeof translations.en;

let detectedLang: Lang | null = null;

/** Detect browser language. Returns 'fr' or 'en'. */
function detectLang(): Lang {
  if (detectedLang) return detectedLang;
  try {
    const nav = navigator.language || (navigator as any).userLanguage || 'en';
    detectedLang = nav.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  } catch {
    detectedLang = 'en';
  }
  return detectedLang;
}

/** Get a translated string by key. */
export function t(key: I18nKey): string {
  const lang = detectLang();
  return translations[lang][key] || translations.en[key] || key;
}
