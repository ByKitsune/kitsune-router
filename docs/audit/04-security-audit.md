# 04 — Security audit

> **Kitsune Router archive:** dated ZenRouter audit evidence; original names, paths, hashes and results remain historical, not current verification. See [current docs](../INSTALLATION.md) and [migration](../MIGRATION.md).

Audited: 2026-10-13 · commit `2c61f4f1` · method: static reading, every finding in this
document was verified against the source in this session (file:line references given).
Security is this repo's stated top review priority (CLAUDE.md).

Companion documents: [02-persistence-and-data-model.md §5](02-persistence-and-data-model.md)
owns the credential-at-rest inventory (headline: **provider credentials are plaintext in
SQLite**); this document owns the network/auth/injection surfaces.

---

## 1. Trust boundaries

```
 untrusted                        semi-trusted                    trusted
 ─────────────                    ────────────                    ───────
 internet/LAN clients  ──►  custom-server.js (TCP peer IP,
 (Claude Code, curl,        XFF strip, peer-token stamp)
 browsers via tunnel)             │
                                  ▼
                          src/proxy.js → dashboardGuard.js   ◄── per-process PEER_TOKEN
                                  │                                proves x-zen-real-ip
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
        /dashboard UI      /api/* admin           /v1,/v1beta,/codex,/responses
        (JWT cookie)       (JWT | CLI token |     (API key | CLI token | local peer)
        [optionally off]    requireLogin=false)
              │                   │                   │
              └───────────────────┼───────────────────┘
                                  ▼
                     LOCAL_ONLY routes (spawn/host secrets)
                     = CLI token OR (local peer + authenticated)
                                  ▼
                     open-sse engine → upstream providers
                     (credentials from plaintext SQLite, §5 of doc 02)
```

Key asymmetry to internalise: **"local" is not decided by the socket alone** and **"remote"
is never decided by a client-supplied header**. Every hop of that chain is proven below.

## 2. The peer-token chain (IP attribution)

`custom-server.js:69-74, 217-245` + `src/lib/auth/trustedPeer.js`:

1. At boot the wrapper mints `PEER_TOKEN = crypto.randomBytes(24)` and stores it in
   `process.env.ZENROUTER_PEER_TOKEN`. A bare `next start`/`next dev` never loads this file,
   so it cannot mint a matching header — peer trust is structurally off without the wrapper.
2. Per request the wrapper takes the IP from **`req.socket.remoteAddress`** (unspoofable),
   computes the attributed IP as: if the TCP peer is loopback **and** forwarding headers
   exist → the **rightmost** `X-Forwarded-For` hop (appended by the trusted loopback proxy
   itself); a bare `X-Real-IP` (no XFF chain) is *ignored* for attribution because it is
   fully client-controlled (9router #4286 tunnel rotation attack). Otherwise → socket IP.
3. It **deletes** `x-zen-real-ip`, `x-forwarded-for`, `x-zen-via-proxy`, `x-zen-peer-token`
   from the request (a duplicate delete pair appears at `:231-241` — see doc 03 R16), then
   re-stamps `x-zen-real-ip`, `x-zen-peer-token`, and (when forwarding headers existed)
   `x-zen-via-proxy: 1`.
4. `hasTrustedPeerHeaders(request)` (trustedPeer.js:6-14) accepts `x-zen-real-ip` as ground
   truth **only** when `x-zen-peer-token` equals the boot secret. Without the proof the
   header is treated as attacker input. `NODE_ENV=development` without the wrapper logs a
   one-time warning and treats everything as non-local (fail-closed).

Consumers of the proven IP: `loginLimiter.getClientIp` (loginLimiter.js:49-63 — trusts
`x-zen-real-ip` only under peer proof; honours `TRUST_PROXY=true` leftmost-XFF as an
explicit operator opt-in; otherwise a **single shared `"unknown"` bucket** so header
rotation cannot escape the limiter) and `dashboardGuard.isLocalRequest` /
`isLoopbackPeer` (dashboardGuard.js:109-149). `isLocalRequest` additionally demotes to
non-local whenever `x-zen-via-proxy` is stamped (a request that came through a proxy means
the loopback socket is the proxy hop, not the end-user) and checks the `Origin` host for
loopback when present.

Residual assumption (doc 03 R5): rightmost-hop trust presumes the loopback reverse proxy
**appends** to XFF (nginx `proxy_add_x_forwarded_for`, cloudflared). A proxy that forwards
client-supplied XFF verbatim hands the client the rightmost slot. Mitigation is
operational discipline, not code.

## 3. Dashboard authentication

`src/lib/auth/dashboardSession.js`, `src/app/api/auth/login/route.js`,
`src/lib/auth/loginLimiter.js`:

- **Password**: stored as bcrypt (cost 10) in `settings.password`. With no stored hash the
  effective password is `INITIAL_PASSWORD`, with placeholder values (`change-me…`) treated
  as unset → public default `12345678` (dashboardSession.js:5-23, login/route.js:57-61).
- **JWT_SECRET is mandatory with no fallback** (dashboardSession.js:43-49): `loadJwtSecret`
  throws unless a trimmed secret ≥ 32 chars exists (CLI/Docker generate one into
  `secrets.json`). Rotation supported via `JWT_SECRET_OLD` / `JWT_OLD_SECRET` /
  `JWT_SECRET_PREVIOUS` — verification tries primary then old; only the primary signs.
- **Session cookie**: `auth_token`, HS256 JWT, 24 h expiry, `httpOnly`, `sameSite=lax`,
  `secure` when `AUTH_COOKIE_SECURE=true` or `x-forwarded-proto: https`
  (dashboardSession.js:75-133). There is **no server-side revocation**; logout clears the
  cookie only, and the limiter/lockout state is in-memory per process (doc 03 R13).
- **Default-password refusal** (login/route.js:67-92): a remote login with the public
  default password succeeds validation but **issues no token** — returns 403
  `mustChangePassword`. The comment cites the CVE-2026-56679 class (fresh install +
  remote login → valid JWT → PATCH settings to disable auth) and states the missing
  remote self-service password-change path is deliberate: `PATCH /api/settings` needs a
  JWT, which is exactly what is withheld. Rotation must happen locally or via
  `INITIAL_PASSWORD`.
- **Progressive lockout** (loginLimiter.js): 5 failures → lock ladder 30 s/2 m/10 m/30 m,
  1 h decay window, per attributed IP, in-memory. Two consequences worth naming:
  - a direct-exposure deployment funnels all clients into the shared `"unknown"` bucket,
    so an unauthenticated attacker can **deliberately lock out every non-local user** by
    failing five logins (availability trade-off accepted to defeat XFF bucket rotation);
  - restart resets all lockout state (R13).
  - `remainingBeforeLock` is returned in the 401 body (login/route.js:108-111) — a minor
    enumeration convenience for a password-guessing client, bounded by the lockout.
- **SSO**: `authMode: sso|saml|oidc` disables password login when the respective backend
  is configured (login/route.js:43-51). SAML requires one-use signed request correlation
  bound to browser state and `SameSite=None; Secure` cross-site callbacks
  (ARCHITECTURE.md:168). OIDC discovery validates the issuer, pins vetted DNS answers per
  socket, rejects redirects on token requests, and runs every advertised endpoint through
  `fetchPublic` + `assertPublicUrlAsync` (`src/lib/auth/oidc.js:87-127`) — the
  best-guarded SSRF surface in the repo.

## 4. Gateway API authentication (`/v1/*`)

`src/shared/utils/apiKey.js`, `src/lib/db/repos/apiKeysRepo.js`,
`src/dashboardGuard.js:151-175`:

- Key format: `sk-{machineId}-{keyId6}-{crc8}` where `crc8 = HMAC-SHA256(API_KEY_SECRET,
  machineId+keyId)` truncated to 8 hex chars. The CRC proves the key was issued by this
  installation; **validity** is still an `apiKeys` table lookup (`validateApiKey`) — the
  CRC alone never authenticates. Legacy `sk-{random8}` keys parse and validate without CRC.
- `API_KEY_SECRET` falls back to the constant `"endpoint-proxy-api-key-secret"`
  (apiKey.js:3) — fine for CRC integrity only, but operators should set it (the CLI does).
- `validateApiKey` (apiKeysRepo.js:79-90) caches **only positive** results; attacker-guessed
  invalid keys are never retained in process memory. Keys are stored plaintext (doc 02 §5.2).
- Extraction accepts `Authorization: Bearer`, `x-api-key`, `x-goog-api-key`, and a
  `?key=` **query parameter** (dashboardGuard.js:155-163). Query-string keys end up in
  access logs/proxies — prefer headers when deploying remotely.
- Access rule (dashboardGuard.js:248-256): `/v1`, `/v1beta`, `/codex`, `/responses` accept
  **local peer** (no key — loopback tools "just work"), the machineId-derived CLI token, or
  a valid API key. `REQUIRE_API_KEY=true` in settings/env forces the key check even for the
  toggle-off case at the handler layer.
- **Known unauthenticated catalogue reads** (doc 03 R7, verified): `GET /api/v1beta/models`
  and `GET /v1/audio/voices` serve data without the key check their siblings apply — low
  impact (model/voice lists), but inconsistent with the advertised rule.
- Per-request opt-out header `x-zenrouter-token-saver: off` exists for the compression
  pipeline (runtimeConfig.js) — an authenticated-client knob, not a security boundary.

## 5. The guard: `src/proxy.js` → `src/dashboardGuard.js`

`src/proxy.js` is the Next 16 **proxy** convention (not classic middleware) matching every
path except `_next/static|_next/image|favicon.ico` (doc 03 R6: the rest of `public/` still
pays a full guard invocation that reads settings from the DB). Decision order
(dashboardGuard.js:223-313) — each branch verified:

1. **LOCAL_ONLY_PATHS** (`:72-93`; cli-tools cowork/antigravity-mitm, `/api/mcp`, tunnel
   install/enable/disable, oauth cursor/kiro/zed auto-import, `auth/reset-password`,
   headroom start/stop/proxy, pxpipe install/start/restart/stop) → require
   `canAccessLocalOnlyRoute` = CLI token **or** (proven-local peer **and** authenticated
   JWT/`requireLogin=false`). These are the routes that spawn processes or read host
   secrets.
2. **ALWAYS_PROTECTED** (`:40-48`; shutdown routes, `settings/database`, oauth auto-import)
   → CLI token or JWT always; `GET/POST /api/settings/database` requires **dual auth**:
   JWT **and** (CLI token or API key) `:236-242` — plus a password re-auth inside the route.
   The export it protects returns the full plaintext DB (doc 02 §5.6), so the layering is
   appropriate.
3. **Public LLM prefixes** → CORS preflight passes through; otherwise key/CLI-token/local.
4. **Everything under `/api/*`** → **deny-by-default**: public allow-list
   (`PUBLIC_API_PATHS :23-34`) or `hasValidCliToken` or `isAuthenticated` (JWT, or
   `requireLogin === false`). Note the nuance verified in doc 03 R1: with
   `requireLogin=false`, *every* admin route is effectively public — including `/api/tags`
   (model catalogue) whose membership in the never-referenced `PROTECTED_API_PATHS` list
   (`:51-69`, dead code — grep confirms the only reference is its own definition) signals
   the author's intent that it should not be.
5. **`/dashboard*`** → JWT cookie when `requireLogin`; `tunnelDashboardAccess=false` also
   hard-redirects requests whose `Host` matches the configured tunnel/Tailscale hostnames
   (`:277-285`). The `Host` header is used here only as a *deny* signal (fail-safe
   direction), never as an auth grant.
6. `/` → `/dashboard`.

`isAuthenticated` (JWT valid) OR (`settings.requireLogin === false`) — that second
disjunct is the single most consequential operator setting in the repo: it converts the
entire management API, including settings writes that can disable auth further, into an
unauthenticated LAN surface.

## 6. Privileged/local-only surfaces

- **CLI token**: `x-zen-cli-token` = `getConsistentMachineId("zen-cli-auth")`
  (dashboardGuard.js:7-20) — an HMAC of the machine id under `MACHINE_ID_SALT`. It is
  derivable by anything that can read `<DATA_DIR>/machine-id` or `auth/cli-secret`
  (both 0600) — i.e. it is a **host-local bearer**, not a secret against host compromise.
  ARCHITECTURE.md:170: if an older deployment exposed it, rotate and reapply local MCP
  configuration.
- **Command execution routes**: `src/app/api/cli-tools/*` (settings writers + `which <tool>`
  probes via fixed `exec` command strings — spot-checked `claude-settings/route.js:60-64`),
  `src/app/api/tunnel/tailscale-*`, `oauth/{cursor,kiro,zed}/auto-import`. All sit in
  `LOCAL_ONLY_PATHS`. Verified guards: local peer proof, CLI token, or
  (local + authenticated). Remaining exposure is therefore: a malicious **local** process
  with the CLI token, or an authenticated operator — matching the tool's threat model. A
  full argument-injection review of every cli-tools route was **not** performed in this
  pass (fixed-command probes were; per-route argument construction from settings values
  deserves a follow-up).
- **`/api/headroom/proxy/[...path]`** (doc 03 R9, verified): an authenticated, local-only
  reverse proxy whose target comes from the `headroomUrl` setting (settable via
  `PATCH /api/settings`). Scheme is pinned to http/https, hop-by-hop headers stripped, and
  `cookie`/`authorization` are deleted for non-loopback targets (`route.js:19-56`) —
  good — but it remains a general outbound relay for a JWT holder.
- **`POST /api/settings/proxy-test`** — see §7 (gap).
- **`GET /api/settings/database`** — dual-auth + password re-auth, then returns the full
  plaintext DB export (every provider token). Treat any JWT + key combination as
  equivalent to reading `data.sqlite` off disk.

## 7. SSRF inventory

Central primitives:

- `src/shared/utils/ssrfGuard.js` (463 lines): blocks loopback (v4+v6, decimal and
  hex-encoded IPv4 forms, `::ffff:` mapped), link-local `169.254/16` + `fe80::/10` (IMDS),
  ULA `fc00::/7`, IPv4-compatible `::a.b.c.d/96`, and metadata hostnames
  (`metadata.google.internal`, bare `metadata`); `assertPublicUrlAsync` additionally
  resolves DNS and rejects if **any** record is private; `fetchPublic` uses direct undici
  connections (bypasses env proxies so a proxy cannot defeat DNS pinning) and blocks
  metadata at **every redirect** and socket lookup (ARCHITECTURE.md:171).
- `open-sse/handlers/fetch/index.js` (the `/v1/web/fetch` tool): resolves **all** DNS
  records and rejects if any is private/reserved; uses `redirect: "manual"` so a public URL
  cannot redirect into a private one (`:26-101`).
- Local private MCP access fails closed when an env proxy applies (ARCHITECTURE.md:171).

Surfaces and their guard status (verified this session):

| Surface | Auth | Guard | Verdict |
|---|---|---|---|
| `/v1/web/fetch` (`open-sse/handlers/fetch/index.js`) | gateway key/local | DNS resolve + private-range reject + manual redirects | ✅ |
| web search dispatcher (`open-sse/handlers/search`) | gateway key/local | uses `fetchPublic` + `assertPublicUrlAsync` | ✅ |
| OIDC discovery/test (`src/lib/auth/oidc.js:87-127`) | varies | issuer + every advertised endpoint guarded | ✅ |
| `POST /api/settings/proxy-test` (`src/lib/network/proxyTest.js`) | JWT (admin) | **none on `testUrl` or `proxyUrl`** — arbitrary `ProxyAgent` + `HEAD` to any URL, 30 s max timeout | ⚠️ S4 |
| `/api/headroom/proxy/[...path]` | local + auth | scheme pinned, credentials stripped off-loopback | ⚠️ S5 (relay by design) |
| `open-sse/handlers/videoCore.js:102` | gateway key | bare `fetch` on user-supplied URL (doc 01 §8.4) | ⚠️ S6 |
| upstream provider calls (`proxyFetch.js`) | engine | MITM DNS bypass resolves via Google DNS for 6 hardcoded hosts (15-min negative cache; `DISABLE_MITM_BYPASS=1`) | ℹ️ scoped |

Notes: `proxyFetch.js` **patches `globalThis.fetch`** at first import of
`open-sse/index.js` (doc 01 §8.4.1) — ~50 bare `fetch` call sites in the engine
unintentionally bypass per-connection proxy policy (functional gap more than a security
one; it also means any library assuming pristine `fetch` is affected).

## 8. Injection surfaces

- **SQL**: every repo in `src/lib/db/repos/` uses `?` placeholders; the interpolated
  `WHERE` fragments are built exclusively from **fixed column-name literals** joined with
  ` AND `, with values in the params array (`usageRepo.js:353-362`,
  `requestDetailsRepo.js:163-177` — both verified). No user text reaches the SQL string.
- **Prototype pollution**: `updateSettings` blocks `__proto__`/`constructor`/`prototype`
  keys behind a key whitelist (settingsRepo.js:5-6, 207-211; two layers at the route level
  per doc 03 "What looks solid"). No `merge`-style deep-assign of untrusted objects was
  found elsewhere.
- **Command injection**: privileged exec routes use fixed command strings
  (e.g. `which claude`); per-route argument construction is the open follow-up noted in §6.
- **HTML/XSS**: streamed upstream error text is tag-stripped + 160-char clamped before the
  UI renders it (`handlers/chatCore/streamingHandler.js:109-111`, doc 01 §8.1.8) — blocks
  naive tag injection, not entity/markdown-encoded payloads; the code's own comment flags
  this. Public-path error sanitisation (`src/sse/utils/requestCorrelation.js:22-39`) redacts
  `Bearer …`, strips control chars, clamps 500 chars, and validates `x-request-id`.
  Contrast: ~80 admin routes return raw `error.message` (doc 03 R8).
- **Path traversal**: the standalone server's `_next/static` URL normaliser decodes only a
  whitelisted set of percent-escapes and refuses results containing `..` or `//`
  (custom-server.js:121-159, verified).

## 9. Credential & secret storage (summary — full detail in doc 02 §5)

- Every provider credential (API keys, OAuth access/refresh/ID tokens) is **plaintext**
  inside `providerConnections.data` / `apiKeys.key` / `usageHistory.apiKey` in
  `<DATA_DIR>/db/data.sqlite` — which on the audited host was mode **0644** while
  `secrets.json` was 0600. The dashboard's "encrypted and stored securely" hint
  (`(dashboard)/providers/new/page.js:163`) is **false** (S1).
- `secrets.json` (`JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT`) is plaintext but
  0600, written atomically by the CLI (`cli/hooks/runtimeSecrets.js:63-112`).
- Read paths do scrub secrets: provider detail/list routes delete token fields;
  `/api/providers/client` allow-lists + masks; `GET /api/settings` strips
  `password`/`oidcClientSecret`; `requestDetails` rows redact payloads and sensitive
  headers. Output hygiene is good; at-rest protection is absent.
- `MACHINE_ID_SALT` defaults to a public constant (`machineId.js:50`) — the CLI token and
  machine id become predictable on installs that skipped the CLI-generated secrets.

## 10. MITM interception proxy (`src/mitm/`)

Off by default (doc 03 §6.2). Trust model: a locally generated root CA (node-forge) signs
intercepted certs; **upstream trust is never implied** — outbound connections still
validate upstream certificates and fail 502 without insecure retry (server.js:168,201,263;
ARCHITECTURE.md:173).

- **S10** — the root CA private key is written with a bare `fs.writeFileSync`
  (`src/mitm/cert/rootCA.js:88`, verified) — default umask mode, unlike the 0600 used for
  `machine-id`/`cli-secret`. Anyone who can read `DATA_DIR/mitm/` can mint trusted certs
  for any host.
- **S11** — `node-forge` 1.4.0 is a direct dependency affected by
  [GHSA-86w9-cpqp-85rv / CVE-2026-85393](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
  with no patched release. The scoped non-reachability assessment in ARCHITECTURE.md:172
  (generation/signing/PEM only, not RSA PKCS#1 v1.5 verification) holds for current code;
  it becomes live risk the moment cert-chain verification is added. Keep it on the
  dependency-watch list; update both package trees when a fix lands.
- A hidden-provider hazard borders this surface: `devin-cli` (registry entry commented out
  of `providers/registry/index.js:240` — *both* its import and array slot are commented,
  verified this session) is the one executor that spawns a local process with shell/fs
  access; it is unreachable through normal routing.

## 11. Findings (consolidated, severity-ordered)

Severity reflects the local-first deployment posture; "High" assumes the gateway is
reachable from a network beyond one trusted machine.

| ID | Sev | Finding | Where | Status |
|---|---|---|---|---|
| S1 | High | Provider credentials (OAuth refresh tokens, API keys) plaintext in a 0644 SQLite file; UI claims encryption | doc 02 §5, `providers/new/page.js:163`, `connectionsRepo.js:65-79` | open — highest-value fix |
| S2 | High | `requireLogin=false` makes the whole `/api/*` admin surface unauthenticated (by design, but includes settings writes that disable auth further); `/api/tags` catalogue leaks catalogue data to LAN in that mode | `dashboardGuard.js:259-263`, dead `PROTECTED_API_PATHS` `:51-69` | open — document + wire the intended list |
| S3 | Med-High | `x-zen-real-ip`/`x-zen-via-proxy`/peer-token delete+stamp duplicated twice (merge-magnet), and rightmost-XFF trust presumes an appending loopback proxy | `custom-server.js:229-245` | hardening |
| S4 | Med | `POST /api/settings/proxy-test`: no allow-list on `testUrl`/`proxyUrl` — authenticated arbitrary-outbound primitive (internal-range probing via attacker-chosen proxy or direct) | `src/lib/network/proxyTest.js` (verified: zero SSRF checks) | open — apply `assertPublicUrlAsync` or pin test target |
| S5 | Med | `/api/headroom/proxy/**` is an authenticated open relay to any http(s) origin (settings-controlled) | `headroom/proxy/[...path]/route.js` | accepted-risk if documented; consider allow-list |
| S6 | Med | `videoCore.js:102` bare `fetch` on user-supplied URL (no SSRF guard) | `open-sse/handlers/videoCore.js` | open |
| S7 | Med | Unauthenticated reads: `/api/v1beta/models` (CORS `*`) and `/v1/audio/voices`; `?key=` query auth risks key leakage into logs | doc 03 R7, `dashboardGuard.js:162` | open |
| S8 | Med | Lockout-DoS: shared `"unknown"` limiter bucket lets an unauthenticated remote attacker lock out all direct-exposure clients; restart clears lockouts; no session revocation | `loginLimiter.js:61-63`, `dashboardSession.js` | accepted trade-off — document it |
| S9 | Med | Root CA private key written without explicit 0600 | `src/mitm/cert/rootCA.js:88` | open (one-line fix) |
| S10 | Med | `node-forge` CVE-2026-85393 (no patch) in MITM CA path; non-reachable today, guarded by a comment not a control | ARCHITECTURE.md:172 | watch |
| S11 | Low-Med | ~80 admin routes echo raw `error.message` (upstream URLs, cause codes) vs the sanitised public path | doc 03 R8 | open |
| S12 | Low | `MACHINE_ID_SALT`/`API_KEY_SECRET` have public defaults when CLI secrets generation is skipped; CLI token is machine-id-derived (host-local bearer) | `machineId.js:50`, `apiKey.js:3`, `dashboardGuard.js:7-20` | document |
| S13 | Low | `remainingBeforeLock` in login 401 bodies aids online guessing cadence; limiter bounds it | `login/route.js:108-111` | cosmetic |
| S14 | Low | `REQUIRE_API_KEY`/`authCookieSecure`-class toggles and `requireLogin` semantics are easy to misconfigure with no warning banner in the dashboard | settings UI | UX hardening |

## 12. What is solid (verified)

- The **peer-token provenance chain** (§2): IP attribution cannot be forged without the
  per-process secret; `Host` is never an auth input; `x-zen-via-proxy` closes the
  "tunnel-looks-loopback" hole; dev-without-wrapper fails closed with a warning.
- **JWT_SECRET is genuinely mandatory** (no fallback, ≥32 chars, trim-validated) and
  rotation is first-class.
- The **default-password remote refusal** (§3) is an unusually thoughtful control — it
  withholds the very credential the attack chain needs and accepts the UX cost explicitly.
- **Dual-auth DB export**, **local-only gating for every spawn/host-secret route**, and
  **deny-by-default `/api/*`** are the right defaults.
- SQL is parameterised everywhere sampled; prototype-pollution keys are blocked at the DB
  layer and the route layer; OIDC/SAML flows carry real anti-CSRF/anti-SSRF discipline;
  MITM never degrades upstream TLS.
- Positive-only API-key caching avoids retaining guessed keys in memory.

## 13. Priority recommendations

1. Encrypt provider credentials at rest (or hash `apiKeys.key` and stop persisting raw
   keys into `usageHistory`); chmod `data.sqlite` 0600. (S1, mirrors doc 02 rec 1-3.)
2. Fix the false "encrypted" UI copy immediately — it is one string until (1) lands.
3. Give `proxy-test` the same `assertPublicUrlAsync` treatment as OIDC, or pin the test
   target server-side. (S4.)
4. Either wire `PROTECTED_API_PATHS` into the guard or delete it; add a dashboard warning
   banner when `requireLogin=false` exposes admin APIs beyond loopback. (S2, S14.)
5. Add SSRF guard to `videoCore`'s user-URL fetch; dedupe the custom-server delete/stamp
   pairs. (S6, S3.)
6. `chmod 0600` the MITM root CA key at generation; keep node-forge on the watch list. (S9,
   S10.)
