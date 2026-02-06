# HCS-U7 Widget Anti-Bot — Architecture Post-MVP

> **Version**: 2.0.0  
> **Date**: 2026-02-06  
> **Auteur**: IA SOLUTION / Benjamin BARRERE  
> **Patent Pending**: FR2514274

---

## Table des Matières

1. [Architecture Globale](#1-architecture-globale)
2. [Module 1 — Sécurisation Tenant (HMAC + Expiration)](#2-module-1--sécurisation-tenant)
3. [Module 2 — Bouton "Copier le Script" (UX Dashboard)](#3-module-2--bouton-copier-le-script)
4. [Module 3 — Auto-détection CSP / Adblock](#4-module-3--auto-détection-csp--adblock)
5. [Module 4 — Mode Debug Client](#5-module-4--mode-debug-client)
6. [Schémas de Flow](#6-schémas-de-flow)
7. [Checklist Production](#7-checklist-production)

---

## 1. Architecture Globale

### Avant (MVP)
```
Client site → <script> window.HCS_TENANT_ID = "uuid-brut" → widget.js → POST /widget/validate (tenantId en clair)
```

**Problèmes** :
- Tenant ID brut exposé dans le HTML source → n'importe qui peut le copier
- Aucune expiration → token valide indéfiniment
- Pas de lien cryptographique entre le tenant et le domaine autorisé
- Aucun diagnostic client (CSP, adblock)
- Debug impossible sans redeploy

### Après (Post-MVP)
```
Dashboard → génère token signé HMAC → client copie <script data-tenant="token"> 
→ widget.js lit data-tenant → valide structure + expiration côté client 
→ POST /widget/validate (token signé) → backend vérifie HMAC + expiration + domaine
```

### Principes Non-Négociables
- ❌ Aucun secret côté client (HMAC secret = backend only)
- ❌ Aucun framework requis
- ❌ Aucune variable globale obligatoire
- ✅ Un seul `<script>` avec `data-tenant`
- ✅ Compatible SPA / SSR / no-code / CDN cache
- ✅ Fail-open si API indisponible
- ✅ Backward-compatible avec `window.HCS_TENANT_ID` (migration douce)

---

## 2. Module 1 — Sécurisation Tenant

### Format du Token Signé

```
base64url({
  "tid": "tenant-uuid",        // Tenant ID
  "exp": 1738900000,           // Expiration Unix timestamp (24h)
  "dom": "*.example.com",      // Domaine(s) autorisé(s) — optionnel
  "v": 2,                      // Version du format
  "iat": 1738813600            // Issued at
}).base64url(HMAC-SHA256(payload, SECRET))
```

**Exemple concret** :
```
eyJ0aWQiOiJjbHh5ejEyMzQiLCJleHAiOjE3Mzg5MDAwMDAsImRvbSI6IiouZXhhbXBsZS5jb20iLCJ2IjoyLCJpYXQiOjE3Mzg4MTM2MDB9.dGhpc19pc19hX2htYWNfc2lnbmF0dXJl
```

**Pourquoi ce format** :
- Pas un JWT complet (pas besoin de header `alg`) → plus léger
- Base64url = safe pour attribut HTML, pas de `+/=`
- Signature non vérifiable côté client (pas de secret exposé)
- Le client vérifie uniquement `exp` (anti-replay basique)
- Le backend vérifie HMAC + exp + domaine (autorité complète)

### Flow de Validation

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Dashboard   │────▶│  Backend API  │────▶│  Token signé    │
│  "Copier"    │     │  POST /token  │     │  (HMAC-SHA256)  │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                   │
                                                   ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Visiteur    │────▶│  Widget JS   │────▶│  Vérifie exp    │
│  charge page │     │  lit token   │     │  (client-side)  │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                   │
                                                   ▼
                    ┌──────────────┐     ┌─────────────────┐
                    │  Backend API  │◀───│  POST /validate  │
                    │  vérifie HMAC│     │  token complet   │
                    │  + exp + dom │     │                  │
                    └──────────────┘     └─────────────────┘
```

### Gestion du Refresh
- **Token TTL** : 24 heures (configurable par plan)
- **Dashboard** : affiche un warning si le token expire dans < 2h
- **Widget** : si token expiré côté client → tente quand même (backend décide)
- **Backend** : si token expiré < 1h → accepte avec flag `token_near_expiry`
- **Backend** : si token expiré > 1h → rejette avec `token_expired`
- **Auto-refresh** : le dashboard peut régénérer automatiquement via cron

### Impact Performance
- **Parsing token** : ~0.1ms (base64 decode + JSON parse)
- **Vérification exp** : ~0.01ms (comparaison timestamp)
- **HMAC côté backend** : ~0.5ms (crypto.createHmac)
- **Overhead total** : < 1ms par requête
- **CDN compatible** : le token est dans l'attribut HTML, pas dans un header dynamique

### Backward Compatibility
```javascript
// Le widget supporte les deux modes :
// Mode v2 (recommandé) : <script src="..." data-tenant="TOKEN_SIGNE">
// Mode v1 (legacy)     : window.HCS_TENANT_ID = "uuid"; <script src="...">
```

---

## 3. Module 2 — Bouton "Copier le Script"

### Règles de Génération Backend

**Endpoint** : `POST /api/tenant/widget-token`
- Auth : JWT session (dashboard)
- Input : `{ ttl?: number }` (défaut 86400 = 24h)
- Output : `{ token: string, expiresAt: string, snippet: string }`

Le backend :
1. Récupère le tenantId depuis le JWT session
2. Récupère les domaines configurés (optionnel)
3. Génère le payload `{ tid, exp, dom, v, iat }`
4. Signe avec HMAC-SHA256 (secret = `WIDGET_HMAC_SECRET` env var)
5. Retourne le token + snippet HTML prêt à copier

### Structure HTML Générée

```html
<script src="https://widget.hcs-u7.online/v1/hcs-widget.js" 
        data-tenant="eyJ0aWQiOi..." 
        async></script>
```

**Une seule ligne.** Pas de variable globale. Pas de config. Pas de jargon.

### Logique Frontend (Dashboard)

```
[Bouton "Copier le script"]
    │
    ├─ onClick → POST /api/tenant/widget-token
    │             │
    │             ├─ Success → clipboard.writeText(snippet)
    │             │             → Toast "✅ Script copié !"
    │             │             → Badge "Expire dans 24h"
    │             │
    │             └─ Error → Afficher snippet en fallback manuel
    │                        → "Sélectionnez et copiez manuellement"
    │
    └─ Paramètres optionnels (collapsible) :
         ├─ Mode debug : checkbox → ajoute data-debug="true"
         ├─ Environnement : select → data-env="staging|production"
         └─ Locale : select → data-locale="fr|en"
```

### Zéro Jargon
- ❌ "Token HMAC signé avec expiration"
- ✅ "Votre script de protection personnalisé"
- ❌ "data-tenant attribute"
- ✅ "Collez ce code dans votre site"

---

## 4. Module 3 — Auto-détection CSP / Adblock

### Techniques JS Utilisées

#### Détection CSP
```javascript
// 1. Test connect-src : fetch vers l'API
fetch(API_URL + '/ping', { mode: 'cors' })
  .then(() => ({ csp_connect: 'ok' }))
  .catch(e => {
    if (e.message.includes('CSP') || e.message.includes('Content Security Policy')) {
      return { csp_connect: 'blocked' };
    }
    return { csp_connect: 'error' };
  });

// 2. Test script-src : vérifier que le widget lui-même a chargé
// Si ce code s'exécute, script-src est OK → implicite

// 3. Test style injection : créer un <style> inline
try {
  const s = document.createElement('style');
  s.textContent = '.hcs-test{}';
  document.head.appendChild(s);
  s.remove();
  // style-src OK
} catch { /* style-src blocked */ }
```

#### Détection Adblock / Privacy Shield
```javascript
// 1. Bait element (technique classique fiable)
const bait = document.createElement('div');
bait.className = 'ad-banner ad-wrapper adsbygoogle';
bait.style.cssText = 'position:absolute;top:-999px;width:1px;height:1px;';
document.body.appendChild(bait);
setTimeout(() => {
  const blocked = bait.offsetHeight === 0 || 
                  getComputedStyle(bait).display === 'none';
  bait.remove();
  // Report: adblock_detected: blocked
}, 100);

// 2. Fetch bait URL (détecte les bloqueurs réseau)
fetch('/ads/pixel.gif', { mode: 'no-cors' })
  .then(() => ({ network_adblock: false }))
  .catch(() => ({ network_adblock: true }));
```

### Signaux Fiables vs Faux Positifs

| Signal | Fiabilité | Faux Positif Possible |
|--------|-----------|----------------------|
| CSP connect-src bloqué | ✅ Haute | Non |
| CSP style-src bloqué | ✅ Haute | Non |
| Bait div hidden | ⚠️ Moyenne | Extensions CSS custom |
| Fetch /ads/ bloqué | ✅ Haute | Proxy d'entreprise |
| navigator.brave | ✅ Haute | Non |

### Stratégie de Reporting
- **Non-bloquant** : le widget fonctionne même si CSP/adblock détecté
- **Report silencieux** : `POST /widget/diagnostics` (fire-and-forget)
- **Mode debug uniquement** : affiche les warnings dans la console
- **Dashboard** : agrège les diagnostics pour alerter le client
- **Aucun impact UX** : le visiteur final ne voit jamais rien

---

## 5. Module 4 — Mode Debug Client

### Activation

```html
<!-- Via attribut script -->
<script src="..." data-tenant="..." data-debug="true" async></script>

<!-- OU via flag dashboard (injecté dans le token) -->
<!-- Le token contient "dbg": true -->
```

### Surface d'API Exposée

```javascript
window.__HCS_DEBUG__ = {
  version: '2.0.0',
  tenantId: 'clxyz1234',          // Masqué partiellement : 'clxy...234'
  tokenValid: true,
  tokenExpires: '2026-02-07T10:00:00Z',
  
  // Diagnostics
  diagnostics: {
    csp: { connect: 'ok', style: 'ok' },
    adblock: { detected: false },
    apiReachable: true,
    latency: 45,                   // ms
  },
  
  // Dernier résultat de validation
  lastValidation: {
    score: 12,
    action: 'allow',
    signals: [],
    timestamp: 1738900000,
  },
  
  // Méthodes
  revalidate: () => {},            // Force une revalidation
  getFingerprint: () => {},        // Retourne le fingerprint actuel
  getLogs: () => [],               // Retourne les logs de session
};
```

### Badge Discret

En mode debug, un petit badge semi-transparent apparaît en bas à droite :
```
┌──────────────────┐
│ 🛡️ HCS Debug    │
│ Score: 12 ✅     │
└──────────────────┘
```
- Taille : 120x40px
- Opacité : 0.7
- Draggable
- Click → ouvre console.group avec détails

### Protections Contre Abus
- `data-debug="true"` est **ignoré** si le token ne contient pas `"dbg": true`
- Le dashboard contrôle qui peut activer le debug
- `window.__HCS_DEBUG__` n'expose jamais :
  - Le secret HMAC
  - Le token complet
  - Les données d'autres tenants
  - Les algorithmes de scoring détaillés
- Le tenantId est toujours masqué partiellement
- En production sans debug, `window.__HCS_DEBUG__` n'existe pas du tout

---

## 6. Schémas de Flow

### Flow Complet v2

```
                    ┌─────────────────────────────────────────────┐
                    │              DASHBOARD CLIENT                │
                    │                                             │
                    │  [Copier le script] ──▶ POST /widget/token  │
                    │       │                      │              │
                    │       │                 HMAC-SHA256          │
                    │       │                      │              │
                    │       ▼                      ▼              │
                    │  clipboard ◀── <script data-tenant="TOKEN"> │
                    └─────────────────────────────────────────────┘
                                        │
                                        │ Client colle dans son site
                                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                     SITE CLIENT (visiteur)                        │
│                                                                  │
│  1. <script> charge → widget.js                                  │
│  2. Lit data-tenant → parse token                                │
│  3. Vérifie exp côté client (anti-replay basique)                │
│  4. Collecte fingerprint + bot signals                           │
│  5. Auto-détecte CSP / Adblock                                  │
│  6. Si debug → expose window.__HCS_DEBUG__                       │
│  7. POST /widget/validate { token, fingerprint, signals }        │
│                     │                                            │
└─────────────────────┼────────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                     BACKEND API                                   │
│                                                                  │
│  1. Vérifie HMAC signature (crypto.timingSafeEqual)              │
│  2. Vérifie expiration (avec grace period 1h)                    │
│  3. Vérifie domaine si configuré (Origin/Referer)                │
│  4. Calcule score final (fingerprint + signals + challenge)      │
│  5. Log événement + incrément usage                              │
│  6. Retourne { action, score, sessionToken }                     │
│                                                                  │
│  Actions: allow (score<30) | challenge (30-70) | block (>70)     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. Checklist Production

### Sécurité
- [ ] `WIDGET_HMAC_SECRET` en variable d'environnement (min 32 bytes)
- [ ] HMAC vérifié avec `crypto.timingSafeEqual` (anti timing attack)
- [ ] Token expiration vérifiée côté backend (source of truth)
- [ ] Grace period configurable (défaut 1h)
- [ ] Domaine vérifié via Origin + Referer headers
- [ ] Rate limiting sur `/widget/token` (10 req/min/tenant)
- [ ] Rate limiting sur `/widget/validate` (100 req/min/tenant)
- [ ] Aucun secret dans le code client
- [ ] `window.__HCS_DEBUG__` absent en production sans flag

### Performance
- [ ] Token parsing < 1ms
- [ ] HMAC verification < 1ms
- [ ] Widget total overhead < 50ms
- [ ] CDN-compatible (token dans attribut HTML statique)
- [ ] Fail-open si API timeout > 3s

### UX
- [ ] Un seul `<script>` à copier
- [ ] Bouton "Copier" avec feedback toast
- [ ] Fallback copie manuelle si clipboard API indisponible
- [ ] Zéro jargon technique dans le dashboard
- [ ] Badge debug discret et draggable
- [ ] Backward-compatible avec `window.HCS_TENANT_ID`

### Monitoring
- [ ] Diagnostics CSP/Adblock agrégés dans le dashboard
- [ ] Alertes si > 20% des visiteurs ont CSP bloquant
- [ ] Métriques de tokens expirés vs renouvelés
- [ ] Logs de validation avec score distribution

---

## Décisions Techniques Justifiées

| Décision | Justification |
|----------|--------------|
| HMAC-SHA256 au lieu de JWT | Plus léger, pas besoin de header `alg`, pas de lib JWT côté client |
| Token dans `data-tenant` au lieu de variable globale | Un seul élément HTML, pas de pollution du scope global |
| Expiration 24h | Équilibre entre sécurité et UX (pas de refresh trop fréquent) |
| Grace period 1h | Évite les faux rejets pour les pages ouvertes longtemps |
| Fail-open | Priorité à la disponibilité du site client |
| Bait div pour adblock | Technique la plus fiable, peu de faux positifs |
| Debug contrôlé par token | Empêche l'activation non autorisée du debug |
| `timingSafeEqual` pour HMAC | Prévient les timing attacks sur la signature |
