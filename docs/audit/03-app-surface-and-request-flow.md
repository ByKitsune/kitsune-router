# 03 — Next.js app surface & request flow

> **Kitsune Router archive:** dated ZenRouter audit evidence; original names, paths, hashes and results remain historical, not current verification. See [current docs](../INSTALLATION.md) and [migration](../MIGRATION.md).

Audit date 2026-10-13 · commit `2c61f4f1` (`master`) · version **0.9.7** · static reading only (no deps installed, no build, no tests).

Scope of this document:

- `src/app/**` — every page route and every API route handler
- `custom-server.js` — the custom server wrapper (client IP derivation)
- `src/proxy.js`, `src/dashboardGuard.js`, `src/instrumentation.js`, `src/mitm/`
- `src/sse/**` — the app-side glue between route handlers and `open-sse/`
- `next.config.mjs` rewrites/headers
- `src/store/**`, `src/i18n/**`, root `i18n/`

Companion docs: [../ARCHITECTURE.md](../ARCHITECTURE.md) (system diagrams),
[../../open-sse/AGENTS.md](../../open-sse/AGENTS.md) (engine conventions),
[04-security-audit.md](04-security-audit.md) (deep security pass).

---

## 1. Complete route inventory

### 1.1 Totals

| Surface | Count |
|---|---|
| API route files (`src/app/api/**/route.js`) | **157** |
| ‑ of which `/api/v1/**` | 21 |
| ‑ of which `/api/v1beta/**` | 2 |
| Page files (`src/app/**/page.js`) | **28** |
| Layouts | 2 (`src/app/layout.js`, `src/app/(dashboard)/layout.js`) |
| `middleware.js` / `middleware.ts` | **none** (deprecated in Next 16 — see §4.3) |
| `src/proxy.js` (Next 16 proxy convention) | yes, 1 file |

All 157 API routes are Next.js *route handlers*. There is no `route.js` outside `src/app/api/`.

### 1.2 `/api/v1/**` — OpenAI / Anthropic / Gemini compatibility surface

Public-prefix guarded at the edge (`src/dashboardGuard.js:37`), then app-key authenticated inside the handler when `requireApiKey` is on (default `true`, `src/lib/db/repos/settingsRepo.js:109`).

| Route path | Methods | Purpose | Auth |
|---|---|---|---|
| `/v1` → `/api/v1` | GET, OPTIONS | Re-export of `./models/route` — static model list | API key (when enabled) |
| `/v1/chat/completions` | POST, OPTIONS | **Primary** OpenAI Chat Completions → `handleChat()` | API key (when enabled) |
| `/v1/api/chat` | POST, OPTIONS | Ollama-compatible alias, response reshaped by `transformToOllama` | API key via `handleChat` |
| `/v1/responses` | POST, OPTIONS | OpenAI Responses API (Codex). Also exported as `sanitizeErrorResponse` | API key |
| `/v1/responses/compact` | POST, OPTIONS | Same pipeline with `body._compact = true` | API key |
| `/v1/messages` | POST, OPTIONS | Anthropic Messages API | API key |
| `/v1/messages/count_tokens` | POST, OPTIONS | Anthropic token counting (local char heuristic) | API key |
| `/v1/models` | GET, OPTIONS | OpenAI model list (LLM only), 30s in-process cache + `Cache-Control: public, max-age=30` | API key |
| `/v1/models/[...model]` | GET, OPTIONS | Kind-filtered list (`/v1/models/image`, `tts`, `stt`, `embedding`, `video`, `music`, `image-to-text`, `web`) | API key |
| `/v1/models/info` | GET, OPTIONS | Rich per-model info incl. the endpoint for its `kind` | API key |
| `/v1/embeddings` | POST, OPTIONS | Embeddings → `src/sse/handlers/embeddings.js` | API key |
| `/v1/images/generations` | POST, OPTIONS | Image generation → `src/sse/handlers/imageGeneration.js` | API key |
| `/v1/audio/speech` | POST, OPTIONS | TTS → `src/sse/handlers/tts.js` | API key |
| `/v1/audio/transcriptions` | POST, OPTIONS | STT → `src/sse/handlers/stt.js` (`maxDuration = 300`) | API key |
| `/v1/audio/voices` | GET, OPTIONS | Voice catalog; server-side fetch to own `/api/media-providers/tts/**` | **key decides nothing** — see risk R7 |
| `/v1/videos/generations` | POST, OPTIONS | xAI Grok Imagine async create | API key |
| `/v1/videos/edits` | POST, OPTIONS | async video edit | API key |
| `/v1/videos/extensions` | POST, OPTIONS | async video extension | API key |
| `/v1/videos/[id]` | GET, OPTIONS | poll async video job | API key |
| `/v1/search` | POST, OPTIONS | Web search → `src/sse/handlers/search.js` | API key |
| `/v1/web/fetch` | POST, OPTIONS | URL fetch → `src/sse/handlers/fetch.js` | API key |

All `/api/v1/**` handlers export a permissive `OPTIONS` (`Access-Control-Allow-Origin: *`,
`Allow-Headers: *`); the proxy lets `OPTIONS` through unconditionally
(`src/dashboardGuard.js:253`).

### 1.3 `/api/v1beta/**` — Gemini-compatible surface

| Route path | Methods | Purpose | Auth |
|---|---|---|---|
| `/v1beta/models` → `/api/v1beta/models` | GET, OPTIONS | Gemini `ListModels` shape built from `PROVIDER_MODELS`; forces `inputTokenLimit: 128000`, `outputTokenLimit: 8192` regardless of the real model | **none** (ungated, see R7) |
| `/v1beta/models/[...path]` | POST, OPTIONS | Gemini `generateContent` / `streamGenerateContent`. Convention: `models/{model}:generateContent`, `models/{provider}/{model}:streamGenerateContent`. Streaming decided by the URL action suffix. OpenAI SSE → Gemini SSE conversion in-route. Gemini-native TTS models are proxied straight to `generativelanguage.googleapis.com` with local credentials and their own key check (`validateGeminiNativeClientKey`) | API key for the translation path; native-TTS path checks separately |

### 1.4 Auth routes (`/api/auth/**`)

| Route path | Methods | Purpose | Auth (proxy) |
|---|---|---|---|
| `/api/auth/login` | POST | Password login, bcrypt or `INITIAL_PASSWORD`, progressive IP lockout, SSO-mode refusal | Public allow-list |
| `/api/auth/logout` | POST | Clears `auth_token` cookie | Public allow-list |
| `/api/auth/status` | GET | Auth mode, SSO configured, session display name/email | Public allow-list |
| `/api/auth/change-password` | POST | Password change (separate from `PATCH /api/settings` `newPassword`) | Deny-by-default → JWT/CLI token |
| `/api/auth/reset-password` | POST | Clears the stored password hash (back to default) | **LOCAL_ONLY** (`dashboardGuard.js:85`) |
| `/api/auth/oidc/start` | GET | Begin OIDC authorization-code + PKCE flow | Public allow-list (`/api/auth/oidc`) |
| `/api/auth/oidc/callback` | GET | Code exchange, session cookie | Public allow-list |
| `/api/auth/oidc/test` | POST | Discovery + client-secret probe | Public allow-list prefix, but the handler re-checks `requireLogin`/JWT itself (`auth/oidc/test/route.js:10-20`) |
| `/api/auth/saml/start` | GET | SAML AuthnRequest (one-use signed correlation) | Public allow-list |
| `/api/auth/saml/acs` | POST | SAML assertion consumer | Public allow-list |
| `/api/auth/saml/metadata` | GET | SP metadata XML | Public allow-list |
| `/api/auth/saml/test` | POST | IdP metadata probe; handler re-checks auth | Public allow-list prefix |

### 1.5 Dashboard / admin routes

**Always protected** (`ALWAYS_PROTECTED`, `dashboardGuard.js:40-48`) — JWT or CLI token required even when `requireLogin=false`:

| Route path | Methods | Purpose | Auth |
|---|---|---|---|
| `/api/shutdown` | POST | Dev-only `process.exit`; 403 in production; needs `SHUTDOWN_SECRET` bearer | ALWAYS + secret |
| `/api/version/shutdown` | POST | Kills app processes for manual update, then exits | ALWAYS |
| `/api/version/update` | POST | In-place update | ALWAYS |
| `/api/settings/database` | GET, POST | Full DB export/import | ALWAYS + **dual auth** (JWT *and* API key/CLI token, *plus* password re-auth in handler) |
| `/api/oauth/cursor/auto-import` | GET | Reads local Cursor install | ALWAYS + LOCAL_ONLY |
| `/api/oauth/kiro/auto-import` | GET | Reads local Kiro install | ALWAYS + LOCAL_ONLY |
| `/api/oauth/zed/auto-import` | GET | Reads local Zed install | ALWAYS + LOCAL_ONLY |

**Local-only** (`LOCAL_ONLY_PATHS`, `dashboardGuard.js:72-93`) — needs CLI token, or loopback browser + auth. These spawn processes, write the hosts file, or touch host secrets:

`/api/cli-tools/cowork-settings`, `/api/cli-tools/antigravity-mitm`, `/api/mcp`, `/api/tunnel/{tailscale-install,tailscale-enable,tailscale-disable,tailscale-check,enable,disable}`,
`/api/oauth/{cursor,kiro,zed}/auto-import`, `/api/auth/reset-password`,
`/api/headroom/{start,stop,proxy}`, `/api/pxpipe/{install,start,restart,stop}`.

**Deny-by-default `/api/*`** (everything else requires JWT, CLI token, or `requireLogin=false`):

| Family | Routes |
|---|---|
| Settings | `/api/settings` GET,PATCH · `/api/settings/proxy-test` POST · `/api/settings/require-login` GET *(public allow-list)* |
| Keys | `/api/keys` GET,POST · `/api/keys/[id]` GET,PUT,DELETE |
| Providers | `/api/providers` GET,POST · `/api/providers/[id]` GET,PUT,DELETE · `/api/providers/[id]/{models,test,test-models}` · `/api/providers/{client,validate,suggested-models,test-batch,kilo/free-models}` |
| Provider nodes | `/api/provider-nodes` GET,POST · `/api/provider-nodes/[id]` PUT,DELETE · `/api/provider-nodes/validate` POST |
| Combos | `/api/combos` GET,POST · `/api/combos/[id]` GET,PUT,DELETE |
| Models | `/api/models` GET,PUT · `/api/models/{alias,availability,disabled,custom,catalog-sync,test}` |
| OAuth | `/api/oauth/[provider]/[action]` GET,POST (the generic driver) + 15 provider-specific import/cookie/pat/bulk-import routes (codex ×2, cursor ×2, gitlab, grok-cli, iflow, kiro ×6, zed ×2) |
| Pricing | `/api/pricing` GET,PATCH,DELETE (PATCH doubles as "reset") |
| Usage | `/api/usage/{chart,stats,history,logs,providers,request-logs,request-details,stream}` GET · `/api/usage/[connectionId]` GET · `/api/usage/[connectionId]/codex-reset-credits` GET,POST |
| CLI tools | `/api/cli-tools/all-statuses` GET · 17 `*-settings` routes (GET/POST/DELETE, `opencode` also PATCH) · `/api/cli-tools/cowork-mcp-tools` POST · `/api/cli-tools/cowork-mcp-registry` GET · `/api/cli-tools/antigravity-mitm` GET,POST,DELETE,PATCH · `.../antigravity-mitm/alias` GET,PUT |
| Proxy pools | `/api/proxy-pools` GET,POST · `/api/proxy-pools/[id]` GET,PUT,DELETE · `/api/proxy-pools/[id]/test` POST · `/api/proxy-pools/{vercel,cloudflare,deno}-deploy` POST |
| Tunnel | `/api/tunnel/status` GET + 6 mutating routes |
| Translator (debug) | `/api/translator/{load,save,send,translate}` · `/api/translator/console-logs` GET,DELETE · `/api/translator/console-logs/stream` GET (SSE) |
| Media providers | `/api/media-providers/tts/voices` GET · `/api/media-providers/tts/{minimax,elevenlabs,inworld,deepgram}/voices` GET |
| MCP | `/api/mcp/[plugin]/sse` GET (SSE) · `/api/mcp/[plugin]/message` POST — both LOCAL_ONLY **and** an explicit `hasValidCliToken` check inside the handler |
| PXPIPE / Headroom | `/api/pxpipe/{install,health,restart,status,stats,start,stop,logs}` · `/api/headroom/{start,stop,restart,status,extras}` · `/api/headroom/proxy/[...path]` (catch-all reverse proxy, GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS) |
| Misc | `/api/combos`, `/api/tags` GET,OPTIONS *(public allow-list gap, see R7)*, `/api/version` GET *(public)* |

**Public allow-list** (`PUBLIC_API_PATHS`, `dashboardGuard.js:23-34`) — no proxy auth:
`/api/health` (GET/OPTIONS), `/api/init` (GET, returns a static "Initialized"), `/api/locale` (POST),
`/api/auth/{login,logout,status,oidc,saml}`, `/api/version`, `/api/settings/require-login`.

---

## 2. Request lifecycle for a chat completion

```
client
  └─ POST /v1/chat/completions            (next.config.mjs:128 rewrite → /api/v1/chat/completions)
       └─ src/app/api/v1/chat/completions/route.js   OPTIONS / POST
            └─ handleChat(request)             src/sse/handlers/chat.js:36
                 └─ getModelInfo / getComboModels      src/sse/services/model.js
                 └─ handleComboChat                open-sse/services/combo.js:556
                      └─ handleSingleModelChat      src/sse/handlers/chat.js:194
                           └─ getProviderCredentials   src/sse/services/auth.js:80
                           └─ checkAndRefreshToken     src/sse/services/tokenRefresh.js
                           └─ handleChatCore        open-sse/handlers/chatCore.js:73
                                └─ executor.execute()  open-sse/executors/*
                                └─ translateResponse → SSE back to client
```

### 2.1 Entry: route handler

`src/app/api/v1/chat/completions/route.js` does only three things: lazily `initTranslators()`
once per process, answer `OPTIONS` with permissive CORS, and delegate `POST` to `handleChat`.
The same shape is used by every `/api/v1/**` route.

`handleChat` (`src/sse/handlers/chat.js:36-43`) wraps `handleChatInternal` in a bare
`try { } catch { }` and converts **any** thrown error into `502 "Chat request failed"` — so an
internal crash never leaks a stack trace to the caller, but it also destroys the cause
(only `serverRequestId` correlates it, via `correlateResponse`).

### 2.2 Pre-routing normalisation (`chat.js:45-119`)

1. `request.json()`; invalid JSON → 400 `"Invalid JSON body"`.
2. Build `clientRawRequest` (endpoint, body, headers, `serverRequestId`) for request logging.
3. OpenAI spec default: `stream: false` when the endpoint is `/chat/completions` and the body
   omits `stream` (`chat.js:66-71`) — this is what makes omitted `stream` behave correctly.
4. `stripModelContextMarker()` removes a Claude Code `[1m]` suffix so combo lookup and
   `provider/model` parsing still work (`chat.js:77-83`).
5. API-key gate (`chat.js:97-109`): only enforced when `isApiKeyRequired(settings)` — i.e. the
   `requireApiKey` setting **or** the `REQUIRE_API_KEY=true` env bridge
   (`src/lib/db/repos/settingsRepo.js:197-200`; env can only turn it *on*).
6. `handleBypassRequest()` swallows Claude Code naming/warmup probes **before** combo rotation
   so they don't consume rotation slots (`chat.js:116-119`).
7. `detectRequiredCapabilities(body)` scans the *whole* history (tool results, earlier turns)
   for vision/PDF/audio/video blocks.

### 2.3 Combo expansion

`getComboModels(modelStr)` returns `null` unless the name has no `/` **and** matches a combo row
(`src/sse/services/model.js:85-94`). When it is a combo:

- **Strategy resolution**: `settings.comboStrategies[name].fallbackStrategy` → else
  `settings.comboStrategy` → else `"fallback"` (`chat.js:126-129`).
- **Capacity adapter**: `augmentModelsWithCapacityAdapter(comboModels, requiredCapabilities,
  settings)` appends media-capable fallback models; models the adapter added are stripped of
  media again before they are tried (`withCapacityAdapterStripping`, `chat.js:130-131,158-161`).
- **`fusion` strategy** → `handleFusionChat` (`combo.js:973`): fan out the prompt to every panel
  model in parallel, then ask a judge model to synthesise. Panel calls have `tools`/`tool_choice`
  removed from the logged body; media blocks are stripped from the judge prompt; 0 panel answers
  → 503, exactly 1 → return it directly.
- **`fallback` / `round-robin`** → `handleComboChat`.
- A **single model** can still enter `handleComboChat` when the capacity adapter added a model
  (`chat.js:171-186`), with `comboStrategy = getActiveAdapterStrategy(...)`.
- `handleSingleModelChat` re-checks combo-ness when `getModelInfo` yields `provider: null`
  (`chat.js:198-247`), which catches combo names that arrive through a secondary path.

#### `handleComboChat` — model fallback (`open-sse/services/combo.js:556-678`)

```
rotatedModels = getRotatedModels(models, comboName, comboStrategy, stickyLimit)   // :344
if (requiredCapabilities) rotatedModels = reorderByCapabilities(...)              // :102, auto-switch
for each model:
    modelBody = structuredClone(body)          // :584 — in-place translator mutations must not
                                               //        corrupt the next candidate (#3619)
    result = await handleSingleModel(modelBody, modelStr)
    if result.ok:
        peek = await peekStreamForContent(result)   // :469 — empty-stream guard (#3463)
        if peek.hasContent -> return
        else cancel body, continue to next model
    else:
        {shouldFallback, cooldownMs} = checkFallbackError(result.status, errorText)
        if !shouldFallback -> return result  (fatal for the whole combo)
        if 502/503/504 and cooldownMs <= 5000 -> await sleep(cooldownMs)   // :638-642
        record lastError / lastStatus / lastResponse; continue
all failed -> 503 (or "no credentials" → 503), Retry-After = earliest retryAfter
```

Key properties:

- **`structuredClone` per attempt** is the isolation boundary; without it a translator that
  mutates the body would poison later members.
- **`peekStreamForContent`** (default 45s, capped byte buffer) buffers SSE frames until it sees
  real content (`delta.content`, reasoning, tool_calls, usage, Gemini `parts`, Claude
  `content_block_start`/`tool_use`, `.delta` events…). A 2xx with no content frames is treated
  as failure and the next model is tried.
- **Rotation state is in-process only** (`comboRotationState` Map, `combo.js:351-370`): sticky
  `comboStickyRoundRobinLimit` requests per member, then advance. `resetComboRotation()` is called
  from the settings/combos routes. A restart resets rotation to member 0.
- **`autoSwitch`** floats models that satisfy the request's required capabilities to the front
  even under `round-robin` (`combo.js:560-570`).
- The final error status is `lastStatus` (default 503); the code comments explain the deliberate
  choice of 503 over 406.

### 2.4 Multi-account selection & rotation (`src/sse/services/auth.js`)

`getProviderCredentials(provider, excludeConnectionIds, model, { sessionKey })`:

1. **Per-provider mutex** (`auth.js:20-26`) — a chain per provider id, *not* a global lock
   (upstream had a global one; Zen deliberately diverges, #3629).
2. **No-auth free providers** short-circuit to a synthetic `{ id: "noauth", accessToken: "public" }`
   connection with an optional proxy pool chosen by the provider's `rotateStrategy`
   (`auth.js:99-124`).
3. Filter `availableConnections` by: not excluded, `!isModelLockActive(c, model)`, and (for
   Antigravity) live quota cache `remainingPercentage > 0` (`auth.js:139-152`).
4. If nothing is available, return `{ allRateLimited: true, retryAfter, retryAfterHuman, lastError }`
   built from the earliest `modelLock_*` expiry, or `null` if there is no lock at all.
5. **Quota-aware ordering** (default **on**, `quotaAwareSelection: true`): for `claude`/`codex`
   (`quotaAwareProviders` default), fetch usage through a TTL'd snapshot cache
   (`quotaCacheTtlMs`, default 45 000 ms; stale-OK 300 000 ms — `src/sse/services/quotaAwareSelection.js`),
   drop connections whose *blocking* quota is exhausted, and sort the rest by remaining
   fraction → backoff level → least-recently-used → id.
6. **Strategy** = `providerStrategies[provider].fallbackStrategy` → `settings.fallbackStrategy` → `"fill-first"`:
   - `fill-first` (default): `selectable[0]` (already quota-/priority-ordered).
   - `session-sticky`: djb2 hash of a session key → stable index, so a conversation keeps the same
     account and its prompt cache (#4297). No session key ⇒ index 0.
   - `round-robin`: honour `consecutiveUseCount < stickyRoundRobinLimit` (default 3) on the
     most-recently-used account, else take the least-recently-used and reset the counter.
   - `preferredConnectionId` pins an explicit account if it survived filtering.

Returned credential object includes `connectionId`, `connectionName`, tokens, `projectId`, the
resolved per-connection proxy config, and `_connection` (the raw row, so `clearAccountError` can
read every `modelLock_*` key).

### 2.5 The account loop in `handleSingleModelChat` (`chat.js:288-448`)

State: `excludeConnectionIds` (Set), `retriedConnectionIds` (Set), `lastError`, `lastStatus`,
`lastResponse`, `consecutiveSameErrors` / `MAX_CONSECUTIVE_SAME_ERRORS = 3`.

Each iteration:

1. **Client abort before dispatch** → 499 `"Client Closed Request"`.
2. `getProviderCredentials(...)`; if unavailable:
   - `allRateLimited` ⇒ **always 503** (never echo a stale 500 from the DB, #3712) with
     `Retry-After` from `unavailableResponse`.
   - no accounts at all and nothing excluded ⇒ 404 `No active credentials for provider: X`.
   - accounts exhausted during the loop ⇒ replay `lastResponse`, else
     `lastStatus || 503` with `lastError || "All accounts unavailable"`.
3. `checkAndRefreshToken()` (pre-emptive refresh).
4. Antigravity / Gemini-CLI cold project-id backfill (`chat.js:317-331`), persisted in the
   background.
5. `handleChatCore(...)` with body model forced to `${provider}/${model}`, plus every
   token-saver switch (`rtkEnabled`, `headroom*`, `caveman*`, `ponytail*`, `pxpipe*`),
   `providerThinking`, `sourceFormatOverride` from the endpoint, `clientSignal`, and the two
   callbacks `onCredentialsRefreshed` / `onRequestSuccess`.
6. Success ⇒ `onRequestSuccess` clears locks and Antigravity strikes, return the response.

**Failure classification** (in order — this is the retryable-vs-fatal decision tree):

| # | Condition | Classification | Action |
|---|---|---|---|
| a | `signal.aborted` or `error === "client_aborted"` or status `499` | **not an account fault** | return 499; never lock, never fall back |
| b | status ∈ {500,502,503,504} and this account has not had its free retry | retryable, account-local | `retriedConnectionIds.add()` and `continue` on the **same** account once (#4277) |
| c | Antigravity 409/429 | quota | refresh live quota via `handleAntigravityQuotaError` to get an exact `resetAt`, then force `shouldFallback = true` and keep the block in RAM only (no `modelLock_*` persisted) |
| d | otherwise | delegated | `markAccountUnavailable(connectionId, status, error, provider, model, resetsAtMs).shouldFallback` |
| e | `shouldFallback === true` | retryable | log `FALLBACK ⇄ ACC… → NEXT ACCOUNT`, exclude the connection, bump the identical-error counter |
| f | circuit breaker: the same status repeated ≥ 3 times across accounts for `400/402/403/5xx` | fatal | return that response immediately ("fast-failing") |
| g | `shouldFallback === false` | **fatal for this request** | return `result.response` as-is (no more accounts tried) |

`markAccountUnavailable` (`auth.js:381-434`) is where retryable/fatal is *decided*:

- `checkFallbackError(status, errorText, backoffLevel)` (`open-sse/services/accountFallback.js:119`)
  walks `ERROR_RULES` top-to-bottom (`open-sse/config/errorConfig.js:60-139`) — text rules first,
  then status rules:
  - 499 / "aborted" ⇒ never fall back.
  - a provider-reported reset time (`reset at <ts>`, `retry in N`, `Retry-After`) ⇒ fall back with
    that exact cooldown, capped at `MAX_RATE_LIMIT_COOLDOWN_MS` (6 h).
  - text hits: billing exhaustion (`insufficient balance`, `余额不足`, …) ⇒ 15 min **terminal**;
    `no credentials` ⇒ 2 min terminal; rate-limit/quota/capacity/overloaded ⇒ **exponential
    backoff** (`base 2 s × 2^(n-1)`, max 5 min, 15 levels); model-scoped permanent failures
    (`unentitled`, `model_not_found`, `unsupported model`, `retired`, `function_declarations`,
    `requested entity was not found`, `chatgpt account`, …) ⇒ **cooldown 0** — fall back to the next
    model/account *without* marking the credential unhealthy; permanent OAuth/org denials
    (`oauth_not_allowed`, `organization has disabled`) ⇒ 15 min terminal.
  - status hits: 401 ⇒ 2 min terminal, 402 ⇒ 15 min terminal, 403/404 ⇒ 2 min, 410 ⇒ 0, 429 ⇒ backoff.
  - **request-scoped 4xx** (400/405/406/408/409/413/415/422 …) that matched no rule ⇒
    `shouldFallback: false` — a malformed body must not cool down a healthy account.
  - anything else ⇒ transient 30 s cooldown.
- A `cooldownMs === 0` fallback short-circuits (`auth.js:411`): route around it without writing any
  health state.
- Antigravity keeps its provider-reported reset verbatim; everything else is clamped to 6 h.
- GitHub premium exhaustion (`status 402` + "additional usage limit for your plan") gets an
  **account-wide** lock until the 1st of next UTC month (`auth.js:45-50,392-395`).

**Quota / cooldown state — where it lives**

| State | Storage | Written by | Cleared by |
|---|---|---|---|
| `modelLock_<model>` / `modelLock___all` (ISO expiry) | `providerConnections` row, flat fields | `buildModelLockUpdate` via `markAccountUnavailable` | `clearAccountError` on a success for that model, or lazy expiry cleanup |
| `backoffLevel` | same row | `markAccountUnavailable` | `clearAccountError` when no active lock remains |
| `testStatus`, `lastError`, `errorCode`, `lastErrorAt` | same row | `markAccountUnavailable` | `clearAccountError` |
| Antigravity per-model quota percentages + strikes | **RAM only** (`handleAntigravityQuotaError` / `clearAntigravityStrikes`) | stream of 409/429 | 3-success strike reset; upstream-reported 0 % block kept |
| `claude`/`codex` usage snapshots | RAM, TTL 45 s, stale-OK 300 s | `createQuotaSnapshotCache.getOrFetch` | TTL |
| combo rotation index | RAM `comboRotationState` | `getRotatedModels` | `resetComboRotation` (settings/combos routes) |
| login failure buckets | RAM `attempts` map | `recordFail` | `recordSuccess`, 1 h window |

`clearAccountError` (`auth.js:445-484`) is deliberately conservative: it clears the *succeeded*
model's lock plus any already-expired locks, and only resets `testStatus`/`lastError`/`backoffLevel`
when **no** active lock remains.

### 2.6 `open-sse/handlers/chatCore.js` (557 lines)

`handleChatCore` (`chatCore.js:73`):

1. `sourceFormat = sourceFormatOverride || detectFormat(body)`.
2. Provider alias → model target format; `resolveTransport()` picks a matching upstream endpoint
   when the model declares support for the source format (zero translation) — otherwise a
   model-level `targetFormat` is used (`chatCore.js:92-119`).
3. Thinking override injection from `providerThinking` (`:125-135`).
4. Streaming decision: `providerRequiresStreaming || clientWantsStream`, then overridden for image
   models (Antigravity/Gemini), DeepSeek-TUI non-interactive, and `Accept: application/json`
   clients (`:137-164`).
5. **Native passthrough**: `isNativePassthrough(clientTool, provider)` skips all translation and
   only swaps model + auth (`:171-221`).
6. Otherwise: modality stripping → remote-image prefetch to base64 → `translateRequest(...)`
   (`:180-240`), then tool dedup and provider tool-schema normalisation.
7. **Token savers, fail-open, in order**: RTK tool_result compression → Headroom external proxy
   (with a "phantom savings" warning when the outbound JSON shrank <5 %) → Caveman →
   Ponytail → PXPIPE. Per-request opt-out via the `TOKEN_SAVER_HEADER`. Claude cache breakpoints
   are re-anchored on the *final* body (`:348-350`).
8. `executor.execute()` inside `try`; throw ⇒ 499 (abort) / 400 (`invalid_*_budget`) / **502**.
9. **401/403 handling** (`:459-502`): peek the body; a permanent org-policy denial
   (`isPermanentAuthDenial`) **skips refresh entirely** and falls through to the normal lock+fallback
   path; otherwise `refreshWithRetry(..., 3)` then one retry, with rotating refresh tokens mutated
   on the credentials object so attempt 2 doesn't reuse a consumed RT.
10. `!response.ok` ⇒ `parseUpstreamError` (bounded 8 KiB read, `Bearer …` redaction, 500-char clamp,
    `x-request-id` validation) → `createErrorResult(statusCode, errMsg, resetsAtMs)`.
11. Response fan-out: forced-SSE→JSON, non-streaming aggregation, or streaming with
    `createStreamController` (disconnect → abort upstream) and usage persistence.

---

## 3. Custom server (`custom-server.js`) — IP derivation

### 3.1 How the wrapper is installed

`custom-server.js:112-116` monkey-patches `http.createServer` **before** Next is loaded, finds the
request handler among the arguments, and wraps it:

```js
// custom-server.js:112
http.createServer = (...args) => {
  const handler = args.find((a) => typeof a === "function");
  const rest = args.filter((a) => typeof a !== "function");
  if (!handler) return origCreate(...args);
  const wrapped = (req, res) => { ... return handler(req, res); };
  const server = origCreate(...rest, wrapped);
```

When run directly (`custom-server.js:307-317`) it `require`s the standalone `server.js` next to it,
or falls back to `next start` in-process. **Both paths get the wrapper**, because the patch is
applied to the `http` module itself. Consequently `next start`/`next dev` *without* this file get
no peer token — and `src/lib/auth/trustedPeer.js:6-14` then treats every request as non-local.

### 3.2 The IP / forwarding-header logic — verbatim

```js
// custom-server.js:217-245
const socketIp = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
const xff = req.headers["x-forwarded-for"];
const xRealIp = req.headers["x-real-ip"];
const viaProxy = !!(xff || xRealIp);
const isLoopbackProxy = socketIp === "127.0.0.1" || socketIp === "::1" || socketIp === "::ffff:127.0.0.1";
// Trust forwarding headers only when the TCP peer is a local reverse proxy.
// Direct/public sockets remain keyed by the unspoofable peer address.
// Use the RIGHTMOST XFF hop: it is appended by the trusted loopback proxy
// itself, while leftmost entries (and a bare X-Real-IP with no XFF chain)
// are client-controlled — a tunnel client could otherwise rotate its
// rate-limit bucket at will and brute-force the login (9router #4286).
const xffHops = xff ? String(xff).split(",").map((h) => h.trim()).filter(Boolean) : [];
const proxyIp = xffHops.length > 0 ? xffHops[xffHops.length - 1] : (xRealIp || "");
const ip = isLoopbackProxy && proxyIp ? proxyIp : socketIp;
delete req.headers["x-zen-real-ip"];
delete req.headers["x-zen-real-ip"];
delete req.headers["x-forwarded-for"];
delete req.headers["x-zen-via-proxy"];
delete req.headers["x-zen-via-proxy"];
delete req.headers["x-zen-peer-token"];
delete req.headers["x-zen-peer-token"];
req.headers["x-zen-real-ip"] = ip;
req.headers["x-zen-real-ip"] = ip;
req.headers["x-zen-peer-token"] = PEER_TOKEN;
req.headers["x-zen-peer-token"] = PEER_TOKEN;
if (viaProxy) {
  req.headers["x-zen-via-proxy"] = "1";
  req.headers["x-zen-via-proxy"] = "1";
}
```

(The doubled `delete`/assignment pairs are a duplicated-block artefact — harmless, but a smell.)

**Precise trust rule.** Forwarding headers are honoured **only** when the TCP peer address is
exactly one of `127.0.0.1`, `::1`, `::ffff:127.0.0.1` **and** a forwarding value is present.
In that case the effective client IP is the **rightmost** `X-Forwarded-For` hop (falling back to
`X-Real-IP` only when there is no XFF chain at all). In every other case the effective IP is
`req.socket.remoteAddress`. When either forwarding header was present at all — loopback or not —
`x-zen-via-proxy: 1` is stamped.

Client-supplied `x-zen-real-ip`, `x-forwarded-for`, `x-zen-via-proxy` and `x-zen-peer-token` are
deleted first, so the downstream consumer sees only server-stamped values.

**Proving the stamp.** `custom-server.js:69-74`:

```js
// Per-process secret proving x-zen-real-ip was stamped below rather than sent by the client.
// A bare `next start` / `next dev` never loads this file, so it cannot produce a matching
// header even though the env var is inherited by child processes.
const PEER_TOKEN = crypto.randomBytes(24).toString("hex");
process.env.ZENROUTER_PEER_TOKEN = PEER_TOKEN;
process.env.NINEROUTER_PEER_TOKEN = PEER_TOKEN;
```

Consumers refuse to trust the headers without it:

- `src/lib/auth/trustedPeer.js:6-14` — `hasTrustedPeerHeaders()` compares
  `x-zen-peer-token` against `process.env.ZENROUTER_PEER_TOKEN || NINEROUTER_PEER_TOKEN`.
- `src/dashboardGuard.js:128-149` — `isLoopbackPeer()` / `isLocalRequest()` require the peer token,
  a loopback `x-zen-real-ip`, **no** `x-zen-via-proxy`, and (when present) a loopback `Origin`.
  The comment is explicit that the `Host` header is never used for the decision because it is
  spoofable.
- `src/lib/auth/loginLimiter.js:48-53` — `getClientIp()` uses `x-zen-real-ip` only with a valid peer
  token; the `TRUST_PROXY=true` escape hatch reads the **leftmost** XFF hop (documented as
  "a trusted reverse proxy that overwrites XFF").

### 3.3 Other things the wrapper does

| Lines | Behaviour | Note |
|---|---|---|
| 15-38 | Loads a `.env` next to the server, existing env always wins | needed because the standalone bundle ships no `.env` |
| 41-67 | Suppresses `ExperimentalWarning` for SOCKS5/SQLite | patches `process.emit` **and** `process.emitWarning` |
| 121-160 | `_next/static` URL normaliser — decodes only `%2F %2E %28 %29 %5B %5D %7B %7D` | guards `..` and `//` after decode; `%2F` decoding happens *before* the traversal check, with a bracket-only fallback |
| 162-209 | `TCP_NODELAY`, keep-alive, socket-error logging, and a Bun `close`→`res.emit("close")` bridge (#3559) | the bridge is what aborts upstream work when a Bun client hangs up |
| 211-215 | Comment: **do not** add `req.once("close", () => res.destroy())` | `IncomingMessage` emits `close` when the request body finishes, which would kill pending POSTs |
| 250-254 | `keepAliveTimeout = 65 s`, `headersTimeout = 66 s` | fixes idle "error sending request" (#3709) |
| 255-257 | Background token refresh lazily imported on `listening` | fails open when `src/` is absent from a published bundle |
| 258-303 | h2c upgrade downgrade: replays the HTTP/1.1 request through `wrapped` | validates `content-length` is a safe integer; bodies are buffered per `content-length` |

---

## 4. Guards: `dashboardGuard.js`, `proxy.js`, middleware

### 4.1 `src/proxy.js` — the Next 16 proxy convention (NOT middleware)

```js
// src/proxy.js
import { proxy as dashboardProxy } from "./dashboardGuard";

export default async function proxy(request) {
  return dashboardProxy(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
```

Next 16 **renamed `middleware.js` to `proxy.js`** (the installed docs confirm:
`…/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md` — "The `middleware.js`
file convention has been **deprecated** in Next.js 16 and renamed to `proxy.js`"), and the required
export is `proxy` or a default export. So the correct answer to "middleware.js location, if it
exists" is: **there is no `middleware.js`; the equivalent lives at `src/proxy.js`** (plus the
`proxy` logic in `src/dashboardGuard.js`).

Matcher: everything except `_next/static`, `_next/image` and `favicon.ico`. Note the matcher does
**not** exclude the rest of `public/` — tracked at R6.

### 4.2 `src/dashboardGuard.js` decision order

`proxy(request)` (`dashboardGuard.js:223-313`) evaluates, in order:

1. **LOCAL_ONLY** (`:227-231`) → `canAccessLocalOnlyRoute` = CLI token, or loopback browser + auth.
   Failure ⇒ `403 {"error":"Local only: CLI token required"}`.
2. **ALWAYS_PROTECTED** (`:235-246`):
   - `/api/settings/database*` is special-cased for **dual auth**: a valid JWT *and*
     (CLI token or valid API key), else `401 "dual authentication required"`. The handler then
     *additionally* re-verifies the dashboard password (`src/app/api/settings/database/route.js:34-40`).
   - everything else: CLI token or JWT, else `401`.
3. **PUBLIC LLM API** (`:248-256`): `OPTIONS` passes straight through (so CORS preflight for
   `Authorization`-bearing requests can complete); otherwise `canAccessPublicLlmApi` =
   local loopback browser | CLI token | valid API key; else
   `401 {"error":"API key required for remote API access"}`.
4. **`/api/*` deny-by-default** (`:259-264`): public allow-list, else CLI token or authenticated,
   else `401 {"error":"Unauthorized"}`.
5. **`/dashboard*`** (`:267-305`): read `requireLogin` (default `true`) and `tunnelDashboardAccess`
   (default `true`). If tunnel access is off and the request `Host` equals the configured tunnel or
   Tailscale hostname → redirect to `/login`. If `requireLogin` is false → pass. Otherwise a valid
   `auth_token` JWT passes, an invalid one redirects to `/login`, and no cookie redirects to `/login`.
6. `/` → redirect to `/dashboard`; anything else → `NextResponse.next()`.

### 4.3 What auth each surface requires — summary

| Surface | Unauthenticated local (loopback, no proxy headers) | Remote / tunnel |
|---|---|---|
| `/dashboard/**` | allowed only if `requireLogin=false`; else needs the `auth_token` cookie | JWT cookie; tunnel host blocked when `tunnelDashboardAccess=false` |
| `/api/auth/{login,status,logout,oidc,saml}`, `/api/health`, `/api/init`, `/api/locale`, `/api/version`, `/api/settings/require-login` | open | open |
| `/api/v1/**`, `/v1beta/**`, `/codex`, `/responses` | open unless `requireApiKey`; when on, an API key is required even locally | API key (or CLI token) at the proxy **and** in-handler |
| `/api/**` management | `requireLogin=false` bypasses; else JWT or CLI token | same — no loopback exemption (except LOCAL_ONLY, which demands *both* loopback and auth) |
| ALWAYS_PROTECTED | JWT or CLI token, regardless of `requireLogin` | same |
| LOCAL_ONLY | CLI token, or loopback+auth | CLI token only |
| `/api/settings/database` | JWT **and** API key/CLI token **and** password | same |

### 4.4 Session / secret material

- `auth_token` = HS256 JWT, `httpOnly`, `sameSite: "lax"`, `secure` when `x-forwarded-proto=https`
  or `AUTH_COOKIE_SECURE=true`, 24 h (`src/lib/auth/dashboardSession.js:124-133`).
- `JWT_SECRET` is **mandatory and ≥ 32 chars**; there is no fallback — `loadJwtSecret` throws
  (`dashboardSession.js:43-49`). Rotation via `JWT_SECRET_OLD` / `JWT_OLD_SECRET` /
  `JWT_SECRET_PREVIOUS`.
- `INITIAL_PASSWORD` defaults to the public `12345678`; placeholders are treated as unset.
  A remote login with the default password is **refused** and issued no cookie
  (`src/app/api/auth/login/route.js:76-96`) — closing a "authenticate → PATCH /api/settings →
  disable auth" chain.
- CLI token = `sha256(rawMachineId + "zen-cli-auth" + cliSecret)[0:16]`, where `cliSecret` is a
  persisted 32-byte random file with `mode 0600` (`src/shared/utils/machineId.js:38-50`).
- Login lockout: 5 fails → 30 s, then 2 m, 10 m, 30 m steps; in-memory; success clears.
- `API key` validation caches **only valid** keys (`src/lib/db/repos/apiKeysRepo.js:81-96`) so a
  flood of invalid keys cannot grow the cache.

---

## 5. Dashboard UI structure

### 5.1 Page routes

Route group `(dashboard)` is URL-transparent. 28 pages total.

| URL | File | Purpose |
|---|---|---|
| `/` | `src/app/page.js` | Server-side `redirect('/dashboard')` |
| `/dashboard` | `src/app/(dashboard)/dashboard/page.js` | **Landing tab.** Server component: `getMachineId()` → `EndpointPageClient` (same client as `/dashboard/endpoint`) |
| `/dashboard/endpoint` | `…/dashboard/endpoint/page.js` | Endpoint base URL + API keys + connect-CLI cards |
| `/dashboard/providers` | `…/dashboard/providers/page.js` | Provider/connection list |
| `/dashboard/providers/new` | `…/providers/new/page.js` | "Add New Provider" |
| `/dashboard/providers/[id]` | `…/providers/[id]/page.js` | Connection detail, models, cooldown timer, bulk import |
| `/dashboard/combos` | `…/dashboard/combos/page.js` | Combo + capacity-adapter editor |
| `/dashboard/usage` | `…/dashboard/usage/page.js` | Usage charts, table, request details, provider quotas |
| `/dashboard/quota` | `…/dashboard/quota/page.js` | Quota tracker |
| `/dashboard/token-saver` | `…/dashboard/token-saver/page.js` | RTK / Headroom / Caveman / Ponytail / PXPIPE switches |
| `/dashboard/cli-tools` | `…/cli-tools/page.js` | CLI tool cards + statuses |
| `/dashboard/cli-tools/[toolId]` | `…/cli-tools/[toolId]/page.js` | Per-tool config writer |
| `/dashboard/console-log` | `…/console-log/page.js` | Live console log (SSE) |
| `/dashboard/translator` | `…/translator/page.js` | "Translator Debug" — 7-step request/response inspection |
| `/dashboard/proxy-pools` | `…/proxy-pools/page.js` | "Proxy Pools" CRUD + deploy targets |
| `/dashboard/skills` | `…/skills/page.js` | Skills / MCP marketplace |
| `/dashboard/mitm` | `…/mitm/page.js` | MITM server + per-tool DNS control |
| `/dashboard/pxpipe` | `…/pxpipe/page.js` | PXPIPE service (hidden from the sidebar) |
| `/dashboard/basic-chat` | `…/basic-chat/page.js` | Basic chat playground (hidden from the sidebar) |
| `/dashboard/profile` | `…/profile/page.js` | Profile / password |
| `/dashboard/media-providers/[kind]` | `…/media-providers/[kind]/page.js` | Kind listing (`embedding`, `image`, `video`, `tts`, `stt`) |
| `/dashboard/media-providers/[kind]/[id]` | `…/[kind]/[id]/page.js` | Per-provider example cards |
| `/dashboard/media-providers/web` | `…/media-providers/web/page.js` | Combined Web Fetch & Search |
| `/dashboard/media-providers/combo/[id]` | `…/media-providers/combo/[id]/page.js` | Media combo detail |
| `/dashboard/settings/pricing` | `src/app/dashboard/settings/pricing/page.js` | **Outside** the dashboard group — no sidebar layout, back-navigates via router |
| `/login` | `src/app/login/page.js` | Password login + reset hint + lockout countdown |
| `/callback` | `src/app/callback/page.js` | OAuth/SAML callback landing (`useSearchParams`) |
| `/landing` | `src/app/landing/page.js` | Marketing landing (own `components/`) |

Note the split: **23** of the 24 `/dashboard/**` pages live under the `(dashboard)` group and inherit
`DashboardLayout`; `src/app/dashboard/settings/pricing/page.js` sits in a *real* `dashboard/`
directory (alongside the group) and therefore gets **no** sidebar layout. The remaining 4 pages are
top-level: `/` (`page.js`), `/login`, `/callback`, `/landing`.

### 5.2 Layout & sidebar

- `src/app/layout.js` — root: `Inter` font, `ThemeProvider`, `RuntimeI18nProvider`,
  two inline `<script>`s (pre-paint theme from `localStorage['theme']`; `fonts-loaded` class),
  `GoogleAnalytics gaId="G-LC959F603F"`, `initConsoleLogCapture()`, and
  `import "@/shared/services/bootstrap"` which auto-runs `initializeApp()`.
- `src/app/(dashboard)/layout.js` — just `DashboardLayout`.
- `src/shared/components/layouts/DashboardLayout.js` — client component; sidebar, header, toast
  host fed by `useNotificationStore`, `PasswordOnboardingModal`.
- `src/shared/components/Sidebar.js:20-40` — nav groups: main (Endpoint & Key, Providers,
  Combo & Vision Adapter, Usage, Quota Tracker, Token Saver, CLI Tools), debug (Console Log,
  Translator), system (Proxy Pools, Skills), plus a media-providers submenu built from
  `VISIBLE_MEDIA_KINDS = ["embedding","image","video","tts","stt"]` and the combined web item.
  `basic-chat` and `pxpipe` are present in the tree but commented out of the nav.

### 5.3 Component organisation

| Location | Contents |
|---|---|
| `src/shared/components/` | 45+ shared primitives and modals — `Modal`, `Drawer`, `Button`, `Input`, `Select`, `Toggle`, `Badge`, `Card`, `Tooltip`, `Pagination`, `SegmentedControl`, `Sidebar`, `Header`, `HeaderMenu`, `HeaderLanguage`, `LanguageSwitcher`, `ThemeToggle`, `ProviderIcon`, `OAuthModal`, `CursorAuthModal`, `KiroAuthModal` (+`KiroOAuthWrapper`, `KiroSocialOAuthModal`), `GitLabAuthModal`, `IFlowCookieModal`, `ZedAuthModal`, `ComboFormModal`, `EditConnectionModal`, `ManualConfigModal`, `McpMarketplaceModal`, `ModelSelectModal`, `PricingModal`, `PasswordOnboardingModal`, `RequestLogger`, `UsageStats`, `CapacityBadges`, `NoAuthProxyCard`, `ProviderInfoCard`, `Footer`, `index.js` barrel |
| `src/shared/components/layouts/` | `DashboardLayout.js`, `AuthLayout.js`, `index.js` |
| `src/app/(dashboard)/dashboard/cli-tools/components/` | `AntigravityToolCard`, `ClaudeToolCard`, `CodexToolCard`, `CopilotToolCard`, `ClineToolCard`, `CoworkToolCard`, `DeepSeekTuiToolCard`, `DroidToolCard`, `GrokBuildToolCard`, `HermesToolCard`, `JcodeToolCard`, `KiloToolCard`, `OpenClawToolCard`, `OpenCodeToolCard`, `DefaultToolCard`, `ToolSummaryCard`, `MitmServerCard`, `MitmToolCard`, `MitmLinkCard`, `ApiKeySelect`, `BaseUrlSelect`, `EndpointPresetControl`, plus `cliEndpointMatch.js`, `cliEndpointPresets.js`, `codexConfig.js` |
| `…/dashboard/providers/[id]/` | `ConnectionRow`, `ModelRow`, `CooldownTimer`, `AddApiKeyModal`, `AddCustomModelModal`, `BulkImportCodexModal`, `BulkImportGrokCliModal`, `CompatibleModelsSection`, `PassthroughModelsSection`, `EditCompatibleNodeModal` |
| `…/dashboard/providers/components/` | `ConnectionsCard`, `ModelsCard`, `AddCompatibleModal`, `ModelAvailabilityBadge` |
| `…/dashboard/usage/components/` | `OverviewCards`, `UsageChart`, `UsageTable`, `RequestDetailsTab`, `ProviderTopology`; `ProviderLimits/` = `ProviderLimitCard`, `QuotaProgressBar`, `QuotaTable`, `utils.js` |
| `…/dashboard/endpoint/components/` | `EndpointRow`, `SecurityWarning`, `StatusAlert`, `Tooltip` |
| `…/dashboard/media-providers/[kind]/[id]/components/` | `EmbeddingExampleCard`, `GenericExampleCard`, `SttExampleCard`, `TtsExampleCard`, `exampleShared.js` |
| `src/app/landing/components/` | `Navigation`, `HeroSection`, `FlowAnimation`, `HowItWorks`, `Features`, `GetStarted`, `Footer`, `AnimatedBackground` |

Each sizable page is a thin server/`page.js` wrapper delegating to a sibling `*PageClient.js` /
`*Client.js` (e.g. `EndpointPageClient`, `ConsoleLogClient`, `MitmPageClient`, `PxpipeClient`,
`TokenSaverClient`, `ToolDetailClient`, `CLIToolsPageClient`, `BasicChatPageClient`).

### 5.4 State management — zustand (`src/store/`)

| Store | File | State | Actions | Used by |
|---|---|---|---|---|
| Theme | `themeStore.js` | `theme` (`persist` key = `THEME_CONFIG.storageKey`) | `setTheme`, `toggleTheme`, `initTheme` (adds/removes the `dark` class) | `ThemeProvider`, `useTheme`, root layout's pre-paint script |
| Notifications | `notificationStore.js` | `notifications[]` (id, type, message, title, duration, dismissible) | `addNotification`, `removeNotification`, `clearAll`, `success`/`error`/`warning`/`info` (auto-dismiss timers) | `DashboardLayout`, providers pages, `ModelAvailabilityBadge`, proxy-pools |
| Header search | `headerSearchStore.js` | `query`, `placeholder`, `visible` | `setQuery`, `register(placeholder)`, `unregister` | `Header`, providers page |
| Settings | `settingsStore.js` | `settings`, `loading`, `error`, `lastFetched` | `fetchSettings({force})` with `CLIENT_STORE_TTL_MS` cache, `patchSettings`, `invalidate` | **currently unreferenced** — pages fetch `/api/settings` directly |
| Providers | `providerStore.js` | `providers[]`, `loading`, `error`, `lastFetched` | CRUD helpers + `fetchProviders({force})` | **currently unreferenced** |
| User | `userStore.js` | `user`, `loading`, `error` | `setUser`, `clearUser`, `setLoading`, `setError` | **currently unreferenced** |

`src/store/index.js` deliberately does **not** export `settingsStore`, `themeStore`,
`headerSearchStore` — those are imported by path. `notificationStore` is the only one exported
by name.

### 5.5 i18n

Two unrelated things share the name:

1. **Dashboard runtime i18n** (`src/i18n/`):
   - `config.js` — 35 locales (`en, vi, zh-CN, zh-TW, ja, pt-BR, pt-PT, ko, es, de, fr, he, ar, ru,
     pl, cs, nl, tr, uk, tl, id, km, th, hi, bn, ur, ro, sv, it, el, hu, fi, da, no, fa`),
     `DEFAULT_LOCALE="en"`, `LOCALE_COOKIE="locale"`, a hand-written `normalizeLocale` chain.
   - `runtime.js` — **DOM-rewriting translator**: `translate(text)` looks the *trimmed literal
     English string* up in `translationMap`; a `MutationObserver` walks every added text node and
     swaps `nodeValue`, remembering `_originalText`. Elements can opt out with `data-i18n-skip`;
     `script/style/code/pre/table/select/...` are skipped. `en` short-circuits to no-op.
   - `RuntimeI18nProvider.js` — calls `initRuntimeI18n()` on mount and `reloadTranslations()`
     (double `requestAnimationFrame`) on every pathname change.
   - Translations load from `fetch('/i18n/literals/<locale>.json')` →
     **`public/i18n/literals/*.json`**, 34 files (no `en.json`; English is the identity mapping).
   - `/api/locale` POST sets the cookie (`path=/`, 1 year) after `isSupportedLocale` validation.
   - Consequences: translations key on exact source strings, so any copy edit silently drops the
     translation; and the whole body is walked on every navigation.
2. **`/root/ZenRouter/i18n/*.md`** — 10 files (`README.es.md`, `README.fa_IR.md`, `README.fr.md`,
   `README.id-ID.md`, `README.ja-JP.md`, `README.pt-BR.md`, `README.ru.md`, `README.th.md`,
   `README.vi.md`, `README.zh-CN.md`). These are **translated copies of the repo README**, not UI
   translation resources. They are not imported by any code.

---

## 6. `src/mitm/` — what it is and whether it is on by default

### 6.1 Purpose

An on-host HTTPS **interception proxy** that lets ZenRouter serve Claude Code / Copilot / Kiro /
Cursor style traffic for CLI/IDE tools that cannot be pointed at a custom base URL — chiefly
Antigravity IDE, plus Copilot, Kiro and Cursor.

| File | Role |
|---|---|
| `manager.js` (32 KB) | Lifecycle: `startServer`/`stopServer`, PID+LOCK files, sudo/root privilege checks, port-443 busy detection, health polling, up to 5 restart attempts with delays `[5s,10s,20s,30s,60s]`, DNS restore, `getMitmStatus`, encrypted-sudo-password storage |
| `server.js` (16 KB) | The listener: `const LOCAL_PORT = 443` (`server.js:15`, `server.listen(LOCAL_PORT)` at `:398`); a `_mitm_health` endpoint (`:301`); leaf-certificate minting per host; per-tool handlers |
| `config.js` | Intercept targets, URL patterns, model synonym/pattern maps, no-map guard |
| `handlers/` | `antigravity.js`, `copilot.js`, `kiro.js`, `cursor.js`, `base.js` — per-tool request rewriting (e.g. model swap onto the router) |
| `cert/` | `rootCA.js` (forge-generated root CA), `generate.js`, `install.js` (OS trust-store install/uninstall) |
| `dns/` | `dnsConfig.js` — hosts-file entries per tool (`TOOL_HOSTS`), `execWithPassword`, sudo probing |
| `logger.js`, `paths.js`, `dbReader.js`, `winElevated.js`, `antigravityIdeVersion.js` | logging, `DATA_DIR`/`MITM_DIR` resolution, DB bridge for CJS, UAC elevation, IDE version override |

Intercepted hosts (`mitm/config.js:16-24`):
`daily-cloudcode-pa.googleapis.com`, `cloudcode-pa.googleapis.com`,
`api.individual.githubcopilot.com`, `q.us-east-1.amazonaws.com`,
`codewhisperer.us-east-1.amazonaws.com`, `runtime.us-east-1.kiro.dev`, `api2.cursor.sh`.

URL matching is path-based (`:generateContent`, `:streamGenerateContent`, `/chat/completions`,
`/v1/messages`, `/responses`, `/generateAssistantResponse`, `/BidiAppend`, `/RunSSE`, `/RunPoll`,
`/Run`) plus a Kiro header rule on `x-amz-target: KiroRuntimeService.GenerateAssistantResponse`
(`config.js:26-49`). A `MODEL_NO_MAP` guard keeps Antigravity's latency-critical tab-completion
(`/^tab[_-]/`) on the real upstream (`config.js:92-94`).

**Upstream TLS is verified.** `src/mitm/server.js:168`, `:201` and `:263` all pass
`rejectUnauthorized: true` (one for ALPN negotiation via a pinned IP + SNI, one for HTTP/2, one for
the HTTP/1.1 passthrough), and certificate/negotiation failure returns **502** without an insecure
retry. The only `rejectUnauthorized: false` in the whole repo is
`src/mitm/manager.js:356` — `https.get` to `127.0.0.1:<port>/_mitm_health`, the proxy's own
localhost health probe. `open-sse/utils/proxyFetch.js:365-369` merely *forwards* a caller-supplied
`rejectUnauthorized` option rather than forcing it off.

### 6.2 Is it enabled by default?

**No — MITM is off by default and requires explicit, privileged, one-time operator action.**

1. **The gate.** `src/shared/services/initializeApp.js:102-106`:

   ```js
   if (settings.mitmEnabled && process.env.ZENROUTER_DISABLE_MITM !== "1") {
     syncMitmAliasCache().catch(() => {});
     autoStartMitm(settings);
   }
   ```

   `autoStartMitm` re-checks at `:132` (`if (!settings.mitmEnabled) return;`), refuses to start
   without a saved sudo password on non-Windows (`:136-140`), and the restart scheduler re-checks
   again (`manager.js:432-436`).

2. **There is no `mitmEnabled` default.** `mitmEnabled` is **absent** from
   `DEFAULT_SETTINGS` (`src/lib/db/repos/settingsRepo.js:86-147`) and **absent** from
   `ALLOWED_SETTINGS_KEYS` (`:11-79`). It is written only by `saveMitmSettings(true, …)` at the end
   of a *successful* `startServer` (`manager.js:737`) and by `saveMitmSettings(false, null)` on stop
   (`manager.js:822`). On a fresh install the key does not exist ⇒ `settings.mitmEnabled` is
   `undefined` ⇒ falsy ⇒ no autostart. (Minor latent bug: because it is not in the DB whitelist,
   `saveMitmSettings` is a silent no-op against the SQLite layer — so today it is always
   `undefined`. See R2.)

3. **What does default to on is only the URL setting**: `mitmRouterBaseUrl: "http://localhost:20128"`
   (`settingsRepo.js:132`) and `dnsToolEnabled: {}` (nothing enabled).

4. **Manual start requires privileges**, in `src/app/api/cli-tools/antigravity-mitm/route.js`:
   `POST` demands an `apiKey` and, on Linux/macOS, a sudo password or existing root
   (`checkPrivilege`, `:60-65`), then calls `startServer(apiKey, pwd, forceKillPort443)`
   (`:125`). `PATCH` with `action: "trust-cert"` installs the root CA. The route is in
   `LOCAL_ONLY_PATHS` and behind deny-by-default auth.

5. **Runtime kill switch**: `ZENROUTER_DISABLE_MITM=1` prevents autostart.

### 6.3 Root CA and trust store

- Stored under `MITM_DIR = <DATA_DIR>/mitm` (`src/mitm/paths.js`), i.e.
  `rootCA.key` + `rootCA.crt`. `DATA_DIR` defaults to `~/.zenrouter` (or `%APPDATA%\zenrouter`).
- Generated/reused by `cert/rootCA.js` (`node-forge`); `generateRootCA()` regenerates when the cert
  is expired or within 30 days of expiry.
- **The private key is written with default permissions and no explicit mode**
  (`rootCA.js:88-89`: plain `fs.writeFileSync(ROOT_CA_KEY_PATH, privateKeyPem)`). Contrast with the
  CLI secret file, which is `mode: 0o600`. This is a real finding if `DATA_DIR` ever sits on a
  shared or world-readable path.
- Trust-store installation is **manual** (`trustCert` / `PATCH action:"trust-cert"` →
  `cert/install.js`): Linux `update-ca-certificates` / `update-ca-trust` anchors, macOS
  `System.keychain` + `security verify-cert`, Windows certificate store via
  `winElevated.runElevatedPowerShell` (UAC).
- `startServer` also sets `NODE_EXTRA_CA_CERTS` to the root CA for Node-based GUI apps
  (`launchctl setenv` on macOS, `setx` on Windows) — this mutates the user's environment.
- DNS: `dns/dnsConfig.js` writes hosts entries per tool; `restoreToolDNS` re-applies saved state at
  boot and `removeAllDNSEntriesSync` cleans on shutdown and on any failed start.

---

## 7. Risks and gotchas

Ordered roughly by severity. `R1`–`R4` are the ones I would fix first.

| # | Risk | Evidence |
|---|---|---|
| **R1** | **`/api/tags` serves the Ollama model catalogue to anyone, unauthenticated.** `PUBLIC_API_PATHS` (`dashboardGuard.js:23-34`) omits it, but the *intended* protection list `PROTECTED_API_PATHS` (`:51-69`) — which contains `/api/tags` — is **dead code, never referenced anywhere**. The route is only saved by the deny-by-default `/api/*` branch, which `requireLogin=false` bypasses. Net: with login disabled, `GET /api/tags` leaks the full model list to the network. Same reasoning applies to every route not in `PUBLIC_API_PATHS` whenever `requireLogin=false` — by design, but worth stating plainly. | `src/app/api/tags/route.js`, `src/dashboardGuard.js:51-69` (grep: only self-references) |
| **R2** | **`mitmEnabled` cannot be persisted.** `saveMitmSettings` calls `updateSettings({ mitmEnabled })`, but `mitmEnabled` is not in `ALLOWED_SETTINGS_KEYS` (`settingsRepo.js:11-79`) nor in `DEFAULT_SETTINGS` — the DB-layer whitelist silently drops it. Consequences: (a) MITM never auto-starts after a restart even though the UI says it was enabled; (b) the "MITM disabled, skipping restart" guard at `manager.js:432` can only ever see `undefined` and therefore never fires — the auto-restart loop relies entirely on the PID file. This is a behaviour bug with a security-adjacent edge (a restart path that was supposed to be gated by an operator setting isn't). | `src/mitm/manager.js:194-202`, `src/lib/db/repos/settingsRepo.js:11-79,86-147`, `src/shared/services/initializeApp.js:102` |
| **R3** | **`/codex/:path*` rewrite discards the sub-path.** `next.config.mjs:112-114` maps `source: "/codex/:path*"` → `destination: "/api/v1/responses"` — no `:path*` in the destination. Every `/codex/<anything>` funnels to the same handler with the suffix lost. If any client relies on a Codex sub-path (e.g. a `/codex/responses` style variant), it silently hits the wrong route rather than 404-ing. | `next.config.mjs:111-118` |
| **R4** | **SSRF-shaped surfaces on authenticated admin routes.** `POST /api/settings/proxy-test` (`src/lib/network/proxyTest.js`) accepts an arbitrary `testUrl` and performs a `HEAD` through an attacker-specified `ProxyAgent` — a JWT-holding operator (or anything that obtains one) gets an arbitrary outbound request primitive and can probe internal ranges. `POST /api/auth/oidc/test` accepts an arbitrary issuer URL, though it is mitigated by `fetchPublic` + `assertPublicUrlAsync` on the discovery document and every advertised endpoint (`src/lib/auth/oidc.js:87-127`). Both are behind auth; the proxy-test one has no allow-list at all. | `src/app/api/settings/proxy-test/route.js`, `src/lib/network/proxyTest.js`, `src/lib/auth/oidc.js` |
| **R5** | **XFF rightmost-hop trust assumes the loopback reverse proxy appends.** The stamping code (`custom-server.js:217-230`) is correct for nginx/Cloudflare-Tunnel-style proxies that append the peer. A reverse proxy configured to *forward* a client-supplied `X-Forwarded-For` verbatim hands the client the rightmost slot — and with it the login-lockout bucket (`loginLimiter.getClientIp`) and the rate-limit key. This is a residual, not a code bug; the mitigation is documentation + `TRUST_PROXY` discipline. Also: the `x-zen-via-proxy` stamp suppresses `isLocalRequest` for **any** request carrying a forwarding header, so a local process can demote itself to non-local (self-DoS only). | `custom-server.js:217-245`, `src/lib/auth/loginLimiter.js:48-60`, `src/dashboardGuard.js:135-149` |
| **R6** | **Proxy matcher does not exclude the rest of `public/`.** `src/proxy.js` excludes only `_next/static`, `_next/image`, `favicon.ico`. The Next 16 docs warn explicitly that without a negative match, "auth logic or redirects can unintentionally block CSS, JS, or images". Here the unmatched branch ends in `NextResponse.next()`, so assets aren't blocked — but every `public/` asset (including the 34 i18n JSON files) does pay a full proxy invocation that reads settings from the DB. Combined with the CSP header rules in `next.config.mjs:96-98`, worth confirming `public/` assets still get sane headers. | `src/proxy.js:7-9`, `next.config.mjs:96-98` |
| **R7** | **`/v1beta/models` GET and `/v1/audio/voices` GET perform work with no key check.** `/api/v1beta/models` returns the whole catalogue with a CORS `*` header and no `requireApiKey` check (unlike the chat path at `v1beta/models/[...path]`, which checks for the native-TTS route only). `/v1/audio/voices` proxies to the app's own `/api/media-providers/tts/**` using `origin`, and its handler never calls `isApiKeyRequired`. Low impact (catalogue + voice names) but inconsistent with the "API key required for remote API access" rule the proxy enforces for siblings. | `src/app/api/v1beta/models/route.js:20-56`, `src/app/api/v1/audio/voices/route.js:20-75` |
| **R8** | **Error-message leakage is systemic on admin routes.** 80 occurrences of `{ error: error.message }` / `{ error: err.message }` in `src/app/api/**/route.js`, including OAuth, proxy-pool deploy, pxpipe, translator and media-provider routes. Values include upstream URLs, network cause codes, and provider text. These are authenticated routes, so exposure is limited to a logged-in operator — but it is inconsistent with the care taken on the *public* path, where `sanitizeErrorResponse` (`src/sse/utils/requestCorrelation.js:22-39`) redacts `Bearer …`, strips control characters, clamps to 500 chars and validates `x-request-id`. | grep for `error: error.message` across `src/app/api` |
| **R9** | **`/api/headroom/proxy/[...path]` is an unrestricted reverse proxy** whose target comes from the `headroomUrl` **setting**, which `PATCH /api/settings` accepts (`settingsRepo.js:56`). It is LOCAL_ONLY + deny-by-default and it strips `cookie`/`authorization` for non-loopback targets — good — but an operator (or anyone who gets a JWT) can point it at any HTTP(S) origin and use the server as a relay. The scheme is validated (`http:`/`https:` only). | `src/app/api/headroom/proxy/[...path]/route.js:19-90` |
| **R10** | **MITM root CA private key is written without an explicit file mode.** `rootCA.js:88` uses a bare `fs.writeFileSync`, unlike the `mode: 0o600` used for `cli-secret`. Anyone with read access to `DATA_DIR/mitm` can mint trusted certificates for any host. | `src/mitm/cert/rootCA.js:80-92`, contrast `src/shared/utils/machineId.js:38-50` |
| **R11** | **`node-forge` 1.4.0 (CVE-2026-85393 / GHSA-86w9-cpqp-85rv) is a direct dependency** used by the MITM CA. Documented as scoped non-reachability in `ARCHITECTURE.md:172`, and that assessment looks right for this usage (generation/signing/PEM parsing, not RSA PKCS#1 v1.5 verification) — but the dependency stays high-severity in `npm audit` and is reachable code for anyone extending the MITM cert path. | `src/mitm/cert/rootCA.js`, `docs/ARCHITECTURE.md:172` |
| **R12** | **SSE handlers rely on `request.signal` abort, not `ReadableStream.cancel()`.** The code comments state this explicitly (`usage/stream`, `translator/console-logs/stream`, `mcp/[plugin]/sse`). That is correct for Next-on-Node, but it means any deployment that loses `request.signal` propagation (some serverless/edge shims) leaks process-wide emitter listeners and, for MCP, leaves a spawned stdio child alive for the server's lifetime. The `mcp/sse` handler's `release()` is the only thing that reaps the child. | `src/app/api/mcp/[plugin]/sse/route.js:26-32`, `src/app/api/usage/stream/route.js:14-16` |
| **R13** | **Login lockout is in-memory and per-process.** `loginLimiter.js` resets on restart and is not shared across workers; `auth_token` also has no server-side revocation list, so `logout` only clears the cookie. Combined with the default-password flow this is acceptable for a local tool, but it means "restart the container" is a lockout bypass. | `src/lib/auth/loginLimiter.js:1-2`, `src/app/api/auth/logout/route.js` |
| **R14** | **`/api/v1` root route is a duplicate of `/api/v1/models`** (`export { GET, OPTIONS } from "./models/route"`), and `ARCHITECTURE.md:623` still describes it as "a static model list" — stale doc. | `src/app/api/v1/route.js`, `docs/ARCHITECTURE.md:623` |
| **R15** | **Client-side i18n rewrites the DOM by matching exact English strings** and re-walks the whole body on every route change; `MutationObserver` processes every added node. Copy changes silently untranslate, and the cost scales with page size. Also, three of six zustand stores (`settingsStore`, `providerStore`, `userStore`) are dead code with zero references. | `src/i18n/runtime.js:36-42,124-150`, `src/store/*` (grep for consumers) |
| **R16** | **`custom-server.js` contains duplicated delete/assign pairs** (`:231-241`) and a duplicated `ExperimentalWarning` suppression block shared with `src/shared/services/bootstrap.js:4-28`. Harmless today, but it is the file where a merge mistake would be most costly. | `custom-server.js:231-245`, `src/shared/services/bootstrap.js` |

### What looks solid

- The `x-zen-real-ip` + per-process `PEER_TOKEN` design (`custom-server.js:69-74,217-245`) is the
  right shape: the header is provenance-proven, the `Host` header is explicitly *not* used for
  security decisions, and `x-zen-via-proxy` closes the "tunnel looks like loopback" hole.
- `JWT_SECRET` has no fallback and must be ≥ 32 chars (`dashboardSession.js:43-49`); the
  default-password remote-login refusal (`auth/login/route.js:76-96`) closes a real
  privilege-escalation chain, and the comment explains why no self-service remote password change
  is offered.
- `PATCH /api/settings` uses a two-layer whitelist plus an explicit protected-key strip
  (`settings/route.js:16-84,118-124`), and `updateSettings` at the DB layer also blocks
  `__proto__`/`constructor`/`prototype` (CWE-915).
- `markAccountUnavailable`'s "request-scoped 4xx must not cool down a healthy account" rule
  (`accountFallback.js:164-172`) and the cooldown-0 model-scoped rules (`errorConfig.js:76-114`)
  are exactly the right shape — account health is only touched for credential-level faults.
- MITM verifies upstream TLS on every path (`server.js:168,201,263`) and returns 502 instead of
  falling back to insecure.
- Public-path error sanitisation (`requestCorrelation.js`) redacts bearer tokens and validates
  request ids before they reach a client.

---

## Appendix A — family map (files per directory)

| Directory | Files |
|---|---|
| `api/auth` | 12 |
| `api/cli-tools` | 19 |
| `api/combos` | 2 |
| `api/headroom` | 6 |
| `api/health`, `api/init`, `api/locale`, `api/shutdown`, `api/tags`, `api/version` | 1 each (+`api/version` extras) |
| `api/keys` | 2 |
| `api/mcp` | 2 |
| `api/media-providers` | 5 |
| `api/models` | 7 |
| `api/oauth` | 16 |
| `api/pricing` | 1 |
| `api/provider-nodes` | 3 |
| `api/providers` | 10 |
| `api/proxy-pools` | 6 |
| `api/pxpipe` | 8 |
| `api/settings` | 4 |
| `api/translator` | 6 |
| `api/tunnel` | 7 |
| `api/usage` | 10 |
| `api/v1` | 21 |
| `api/v1beta` | 2 |
| `api/version` | 3 |
| **total** | **157** |

## Appendix B — rewrites and headers (`next.config.mjs`)

Rewrites (`:101-136`), in file order:

| Source | Destination |
|---|---|
| `/v1/v1/:path*` | `/api/v1/:path*` |
| `/v1/v1` | `/api/v1` |
| `/codex/:path*` | `/api/v1/responses` |
| `/responses` | `/api/v1/responses` |
| `/v1beta/:path*` | `/api/v1beta/:path*` |
| `/v1beta` | `/api/v1beta` |
| `/v1/:path*` | `/api/v1/:path*` |
| `/v1` | `/api/v1` |

`/v1/v1/*` exists purely to tolerate clients whose base URL already ends in `/v1`.

Headers (`:60-99`):

- `/api/:path*`, `/v1/:path*`, `/v1beta/:path*` → `Content-Security-Policy: default-src 'none';
  frame-ancestors 'none'; base-uri 'none'`.
- everything except `api|v1|v1beta|_next/static|_next/image` → the dashboard CSP
  (`script-src 'self' 'unsafe-inline' 'unsafe-eval'` + GTM/Cloudflare Insights/jsDelivr,
  `connect-src` incl. GA + `ws: wss:`, `object-src 'none'`, `frame-ancestors 'self'`).

Notable config: `output: "standalone"`, `serverExternalPackages` keeps `open` external (build-machine
`import.meta.url` leakage), `experimental.proxyClientMaxBodySize` default **128 MB** (env-overridable
via `ZENROUTER_PROXY_CLIENT_MAX_BODY_SIZE`) — relevant to the upload routes and to any
denial-of-service reasoning.

## Appendix C — `src/sse/` inventory

| File | LOC | Role |
|---|---|---|
| `handlers/chat.js` | 449 | Chat entry: parse, key gate, combo expansion, account loop |
| `handlers/embeddings.js` | — | `/v1/embeddings`; own key check |
| `handlers/imageGeneration.js` | — | `/v1/images/generations`; own key check |
| `handlers/tts.js` | — | `/v1/audio/speech`; own key check |
| `handlers/stt.js` | — | `/v1/audio/transcriptions`; own key check |
| `handlers/search.js` | — | `/v1/search`; own key check + combos |
| `handlers/fetch.js` | — | `/v1/web/fetch`; own key check + combos |
| `handlers/videoGeneration.js` | — | `/v1/videos/*`; own key check |
| `services/auth.js` | 511 | Credential selection, rotation, lock/unlock |
| `services/quotaAwareSelection.js` | 159 | Quota normalization, ordering, TTL snapshot cache |
| `services/antigravityQuota.js` | — | Antigravity per-model quota + strike counter (RAM) |
| `services/tokenRefresh.js` | — | Pre-emptive refresh + `refreshWithRetry` |
| `services/backgroundTokenRefresh.js` | — | Periodic refresh scheduler (also started from `custom-server.js`) |
| `services/model.js` | 94 | `parseModel` / alias / combo resolution on top of `open-sse` |
| `utils/logger.js` | 117 | `LOG_LEVEL`-gated logger, per-session colored tags, `maskKey` |
| `utils/requestCorrelation.js` | 47 | `x-request-id` stamping + public error sanitisation |

`src/instrumentation.js` (14 lines) runs only on `NEXT_RUNTIME === "nodejs"`: installs the console
log capture buffer, installs the model-catalog override source, and starts the model catalog sync.
It does **not** start MITM — that happens through `src/shared/services/bootstrap.js` →
`initializeApp()` → `runHeavyStartup()` after a 3 s defer, and only when `settings.mitmEnabled`.
