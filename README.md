# HCS-U7 Widget v3 — Enterprise Adaptive Engine

**Risk-based, remote config, progressive escalation.**
Zero friction for normal humans. Escalation only on anomaly.

Patents Pending FR2514274 | FR2514546
© 2025-2026 Benjamin BARRERE / IA SOLUTION

---

## Quick Start

### Integration Snippet (v3)

```html
<script
  src="https://widget.hcs-u7.online/v3/hcs-widget.js"
  data-widget="YOUR_WIDGET_PUBLIC_ID"
  async>
</script>
```

Get your `widgetPublicId` from the HCS-U7 Dashboard → Integration page.

### Backwards Compatible

The widget also supports legacy integration modes:

```html
<!-- v2 signed token -->
<script src=".../v3/hcs-widget.js" data-tenant="SIGNED_TOKEN" async></script>

<!-- v1 legacy -->
<script>window.HCS_TENANT_ID = "YOUR_TENANT_ID";</script>
<script src=".../v3/hcs-widget.js" async></script>
```

### Optional Attributes

| Attribute | Description |
|-----------|-------------|
| `data-widget` | Widget public ID (recommended) |
| `data-tenant` | Signed token or legacy tenant ID |
| `data-debug` | `"true"` to enable debug mode |
| `data-env` | Environment override (`production`, `staging`) |
| `data-api` | Custom API URL override |

---

## How It Works

### Default UX = Invisible

Normal humans **never see anything**. The widget silently:
1. Collects behavioral biometrics (mouse, keyboard, scroll, touch, timing)
2. Fingerprints the browser (canvas, WebGL, navigator properties)
3. Computes a risk score (0-100)
4. Validates with the backend
5. Decides: allow, mitigate, or escalate

### Progressive Escalation

| Risk Score | Decision | User Experience |
|-----------|----------|-----------------|
| 0 – 34 | **ALLOW** | Invisible — nothing happens |
| 35 – 59 | **SOFT** | Invisible — PoW-lite, JS attestation, silent retry |
| 60 – 79 | **CHALLENGE** | Minimal slider challenge |
| 80 – 91 | **HARD_CHALLENGE** | Strict slider challenge |
| 92+ | **BUNKER** | Full verification gate (if enabled) |
| 92+ | **BLOCK** | Access blocked (if bunker disabled) |

Thresholds are configurable per-tenant via remote config.

### Risk Score Breakdown

The risk score is a weighted combination of:

| Component | Weight | What it measures |
|-----------|--------|-----------------|
| **Fingerprint** | 25% | WebDriver, headless, plugins, canvas, WebGL |
| **Behavior** | 30% | Mouse curvature, keystroke timing, scroll patterns, entropy |
| **Automation** | 20% | WebDriver flag, suspicious user agent |
| **Integrity** | 10% | Storage, cookies, CSP |
| **Velocity** | 10% | Actions too fast, rapid requests |
| **Network** | 5% | Server-side enrichment (VPN, proxy, reputation) |

---

## Modes

| Mode | Behavior |
|------|----------|
| **monitor** | Observe only, never block. Good for initial deployment. |
| **adaptive** | Default. Progressive escalation based on risk score. |
| **enforce** | Strict. Lower thresholds, faster escalation. |

Set via remote config (`GET /api/widgets/config?widgetPublicId=...`).

### Kill Switch

If `killSwitch: true` in remote config, the widget enters monitor-only mode regardless of risk score. No blocking, no challenges.

### Fail-Safe

If the backend API is unreachable or times out:
- Widget enters **degraded mode** (monitor-only)
- No blocking, no challenges
- Logs `"api_unreachable"` internally
- Site is **never broken**

---

## Remote Config

The widget fetches config from:
```
GET /api/widgets/config?widgetPublicId=...
```

Response shape:
```json
{
  "mode": "adaptive",
  "thresholds": { "allow": 35, "soft": 60, "challenge": 80, "bunker": 92 },
  "softActions": ["pow-lite", "js-attestation", "silent-retry"],
  "challengeActions": ["cognitive-lite"],
  "bunkerPolicy": { "enabled": false, "ttlSeconds": 900 },
  "sampling": { "telemetry": 0.25, "fullSignals": 0.10 },
  "privacy": { "maskPII": true },
  "timeouts": { "configMs": 800, "validateMs": 1200, "pingMs": 400 },
  "ui": { "showBadge": false, "showToastOnChallenge": true },
  "killSwitch": false,
  "ttlSeconds": 300
}
```

Config is cached in memory + localStorage with TTL. On failure, safe defaults are used.

---

## Public API

### `window.HCS_STATUS` (read-only)

```js
{
  ready: true,
  lastDecision: "allow",
  lastSeen: 1707600000000,
  version: "3.0.0",
  degraded: false
}
```

### `window.__HCS_DEBUG__` (debug mode only)

Only exposed if `data-debug="true"` and authorized by token:

```js
__HCS_DEBUG__.getFingerprint()  // Current browser fingerprint
__HCS_DEBUG__.getBehavior()     // Behavioral signals snapshot
__HCS_DEBUG__.getLogs()         // Debug log entries
__HCS_DEBUG__.getRisk()         // Last risk breakdown
__HCS_DEBUG__.getDecision()     // Last decision
__HCS_DEBUG__.getConfig()       // Remote config
__HCS_DEBUG__.isDegraded()      // API reachability
```

No methods that allow forcing revalidation from attacker console.

---

## Development

### Build the widget

```bash
npm run build:widget        # Build once → public/widget/v3/hcs-widget.js
npm run build:widget:watch  # Watch mode for development
```

### Run tests

```bash
npm run test:widget         # 45 tests (scoring, decision tree, config, crypto, etc.)
```

### Project structure

```
src/widget-v3/
  index.ts                  # Entry point + boot sequence
  core/
    init.ts                 # Config parsing from script tag / globals
    state.ts                # Global state (single source of truth)
    env.ts                  # Environment detection
    logger.ts               # Debug logger
    dom.ts                  # Safe DOM utilities (textContent only)
  telemetry/
    behavior.ts             # Behavioral biometrics collector
    fingerprint.ts          # Browser fingerprinting
    signals.ts              # Signal analysis (bot detection)
  risk/
    risk-engine.ts          # Risk assessment engine
    scoring.ts              # Weighted scoring + EMA smoothing
    thresholds.ts           # Default thresholds
  policy/
    remote-config.ts        # Remote config fetch + cache + fallback
    rules.ts                # Decision tree (risk → action mapping)
    decision.ts             # Decision orchestrator
  actions/
    allow.ts                # Allow (invisible)
    soft.ts                 # Soft mitigations (PoW-lite, JS attestation)
    challenge.ts            # Slider challenges
    bunker.ts               # Bunker mode (incident isolation)
    block.ts                # Block page
  api/
    client.ts               # HTTP client with timeouts
    ping.ts                 # Widget heartbeat ping
    validate.ts             # Backend validation
  ui/
    badge.ts                # Debug badge
    modal.ts                # Modal overlay
    toast.ts                # Toast notifications
  utils/
    crypto.ts               # Hashing, base64url, ID masking
    time.ts                 # Time utilities, jitter
    rate-limit.ts           # Client-side rate limiter
```

### Build output

```
public/widget/v3/hcs-widget.js   # ~28KB minified IIFE, no sourcemap
```

---

## Security Rules

- **No secrets in widget** — only public tokens signed server-side
- **No innerHTML** — all UI via `textContent` and DOM API
- **Fail-safe** — API down → monitor-only, never blocks
- **Rate limited** — ping: 1/30s, validate: per-session
- **Ping hardened** — no `domain` in body, backend reads `Origin`/`Referer`
- **Debug gated** — `__HCS_DEBUG__` only if token authorizes it
