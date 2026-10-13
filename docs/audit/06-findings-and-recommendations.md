# 06 — Consolidated findings & recommendations

Consolidates: [01](01-open-sse-engine.md) §8, [02](02-persistence-and-data-model.md) §7,
[03](03-app-surface-and-request-flow.md) §7, [04](04-security-audit.md) §11, plus new
findings from the second audit pass (this session, same commit `2c61f4f1`).

Severity scale: **P0** = fix now (data exposure / auth bypass chain), **P1** = next
release (security hardening, correctness bugs users can hit), **P2** = schedule
(doc-truth, tech debt, hygiene). This is a local-first gateway; P0/P1 assume the port may
be reachable beyond one trusted machine.

---

## 1. P0 — fix now

| # | Finding | Evidence | Fix |
|---|---|---|---|
| P0-1 | **Provider credentials plaintext in a 0644 SQLite file.** OAuth refresh tokens (long-lived), API keys, ID tokens all in `providerConnections.data` / `apiKeys.key` / `usageHistory.apiKey`. The UI tells users otherwise. | doc 02 §5 (field-by-field table); `(dashboard)/providers/new/page.js:163` false "encrypted" hint | Encrypt `data` blob at rest (key from `secrets.json`), or minimally: store `apiKeys.key` hashed, drop raw keys from usage rows, `chmod 0600` the DB. Fix the UI string immediately — it is one line. |
| P0-2 | **`requireLogin=false` exposes the entire admin API unauthenticated** — including `PATCH /api/settings` writes that can further disable protections (tunnel config, headroom URL, key management). `/api/tags` (model catalogue) leaks to LAN in that mode; its intended protection list `PROTECTED_API_PATHS` is **dead code** (never referenced — grep-verified). | doc 04 §5; `dashboardGuard.js:51-69, 259-263` | Wire `PROTECTED_API_PATHS` into the guard (or delete it); add a dashboard banner when `requireLogin=false` while the port is bound non-loopback. |

## 2. P1 — next release

**Security hardening** (detail in doc 04 §11):

| # | Finding | Fix |
|---|---|---|
| P1-1 | `POST /api/settings/proxy-test` performs `HEAD` to any URL via an attacker-specified `ProxyAgent` — no SSRF allow-list at all (JWT-gated only). | Route through `assertPublicUrlAsync` or pin the test target server-side. |
| P1-2 | `open-sse/handlers/videoCore.js:102` bare `fetch` on a user-supplied URL — the one unguarded fetch in the engine. | `fetchPublic` from `ssrfGuard.js`. |
| P1-3 | MITM root CA private key written without explicit mode (`rootCA.js:88` bare `writeFileSync`) while `secrets.json`/`machine-id` are 0600. | `{ mode: 0o600 }`, one-line fix. |
| P1-4 | Unauthenticated reads: `GET /api/v1beta/models` (CORS `*`) and `/v1/audio/voices` skip the key check their siblings apply; `?key=` query auth leaks keys to logs. | Align with `canAccessPublicLlmApi`; deprecate query-param keys. |
| P1-5 | `custom-server.js:229-245` delete/stamp block duplicated line-for-line — a merge-magnet in the most security-critical file in the repo. | Extract a helper. |
| P1-6 | `node-forge` 1.4.0 / CVE-2026-85393 (no patch) in the MITM CA path — scoped non-reachable today (ARCHITECTURE.md:172), but nothing enforces that boundary. | Watch for the fix; consider an eslint/grep guard against importing forge verification APIs. |
| P1-7 | Login 401 bodies return `remainingBeforeLock` (guessing cadence aid); lockout is in-memory, resets on restart, and direct-exposure deployments share one `"unknown"` bucket (an attacker can lock out all remote users). | Accept + document, or persist lockout and drop the counter. |

**Correctness**:

| # | Finding | Fix |
|---|---|---|
| P1-8 | `mitmEnabled` cannot persist: `updateSettings` whitelist silently drops the key, so MITM never auto-starts after restart and the restart gate in `manager.js` can never fire. | Add to `ALLOWED_SETTINGS_KEYS` or store under an existing key. |
| P1-9 | `importDb` does not invalidate the connection/API-key caches, and `connectionCache` has no TTL — after a DB import the process can serve the pre-import account list (old tokens) indefinitely. Also `exportDb`/`importDb` are asymmetric on `disabledModels`. | Export and call the invalidators post-import; make export/import symmetric. |
| P1-10 | Registry/executor drift: `trae`, `windsurf`, `devin-cli` have live executors but are commented out of `providers/registry/index.js` (both import and array — verified this session; note doc 01 §8.1.1 originally misdescribed this as dangling imports). If ever wired without re-running the generator, `BaseExecutor` gets `config === undefined` and throws. `devin-cli` additionally spawns a local process with shell/fs access — it should stay gated. | Keep hidden entries commented *with the generator*; add a startup assertion that every executor-map key resolves in `PROVIDERS`. |
| P1-11 | `/codex/:path*` rewrite drops the sub-path (`next.config.mjs:112-114`) — every `/codex/<x>` hits the same handler. | Add `:path*` to the destination or 404 explicitly. |

## 3. P2 — schedule

- **Duplicated engine logic** (doc 01 §8.2): `openAICompletionToClaudeMessage` ×3, Gemini tool-call conversion ×2, `extractResetsAtMs` ×2 with different behavior, `services/compact.js` dead combo implementation, auth-header construction ×2 (Base vs Default executor).
- **Dead code** (doc 01 §8.3): `services/compact.js`, `config/models.js`, `providers/schema.js` `resolveProvider()`/`ENDPOINT_DEFAULTS` (documented defaults that are not behaviour — misleading), `rtk/registry.js` test-only, dead zustand stores (`settingsStore`, `providerStore`, `userStore`).
- **Perf foot-guns**: `reorderInTx` O(pool) inside write transactions; `getUsageStats` O(all rows) for unlisted periods; `sql.js` adapter last-writer-wins multi-process hazard + 100 ms debounce loss window (document as single-process-only).
- **Observable hygiene**: ~80 admin routes echo raw `error.message` (doc 03 R8) vs the sanitised public path; streamed-error tag-strip doesn't cover entity/markdown-encoded payloads (doc 01 §8.1.8); i18n DOM re-walk per route change (doc 03 R15).
- **CLI manual sync point**: `src/cli/menus/providers.js` keeps a static copy of `PROVIDER_MODELS` — add a codegen step or a drift test.
- **Docs drift** — see §5 below.

## 4. What is solid (keep doing this)

- **Peer-token provenance chain** for IP attribution (custom-server → trustedPeer): provenance-proven header, Host never trusted for auth, fail-closed without the wrapper.
- **Mandatory 32-char `JWT_SECRET`** with first-class rotation; **default-password remote refusal** that withholds the JWT (explicit CVE-2026-56679 rationale).
- **Layered auth**: deny-by-default `/api/*`, dual-auth DB export, LOCAL_ONLY gates on every spawn/host-secret route, CLI token mixed with a persisted random secret (not just machine id).
- **3-layer SSRF guard** (`ssrfGuard.js`: literal IP → resolved DNS with rebinding-suffix blocklist → pinned-DNS `fetchPublic` with per-redirect revalidation); OIDC/SAML flows use it on every advertised endpoint.
- **Parameterised SQL everywhere sampled**; prototype-pollution keys blocked at two layers; positive-only API-key cache; MITM never degrades upstream TLS (502 instead).
- **Engine resilience policy**: config-driven account fallback (model-scoped failures cool down 0 ms; permanent OAuth denials skip refresh; client-abort never locks accounts), 3-strike circuit breaker, exactly-one refresh-retry with rotating-refresh-token handling, fail-open token savers.
- **Test suite as a gate**: 498 files ≈ 2100 tests, committed baselines for providers/aliases/OAuth-URLs, lint policy itself tested, installer logic tested with full mocks.

## 5. Documentation drift (fix the docs, they misdirect)

Verified against code this session:

| Doc claim | Reality | Where |
|---|---|---|
| `ARCHITECTURE.md` §Cloud Sync: routes `src/app/api/sync/*`, `src/app/api/cloud/*`, `initCloudSync.js`, `cloudSyncScheduler.js` | **None of these files/routes exist.** Only `cloudEnabled`/`cloudUrl` settings keys remain. | `ls src/app/api/` — verified; subagent report §6 |
| `ARCHITECTURE.md` + `CLAUDE.md`: usage lives in `~/.zenrouter/usage.json` + `log.txt`, "does not follow DATA_DIR" | Usage is SQLite `usageHistory`/`usageDaily`/`requestDetails` under `<DATA_DIR>/db/data.sqlite`; both files gone; `appendRequestLog` is a no-op. | doc 02 §7; `usageRepo.js` |
| `ARCHITECTURE.md`: 6 specialized executors | **26** executor files (antigravity … zed). | `executors/` listing |
| `open-sse/AGENTS.md:7` lifecycle: `parseModel` in core; token savers "pre-translate" | `parseModel` runs app-side in `src/sse/handlers/chat.js`; savers run **after** `translateRequest` (and on passthrough bodies). | doc 01 §8.5 |
| Dashboard hint "Your API key will be encrypted and stored securely" | False — see P0-1. | `providers/new/page.js:163` |
| `ARCHITECTURE.md`: `/api/v1` returns a static model list | It re-exports `/api/v1/models`. | doc 03 R14 |
| doc 01 §8.1.1 (this repo's own audit): "123 bindings, array omits three" | Imports **and** array entries for p102/p104/p114 are both commented out — consistent, no dangling refs. Latent hazard is the executor-map mismatch only. | `registry/index.js:105,116-117,229,240-241` — corrected this session |

Suggested one-pass doc fix: regenerate the Cloud Sync section (or delete it), correct the
usage-storage paragraph in both ARCHITECTURE.md and CLAUDE.md, update the executor
count/lifecycle in AGENTS.md, and delete the false UI hint.

## 6. Priority order (if you do only five things)

1. P0-1 credential encryption at rest + chmod 0600 + fix the false UI string.
2. P0-2 wire or delete `PROTECTED_API_PATHS`; warn when `requireLogin=false` off-loopback.
3. P1-1 + P1-2 close the two unguarded outbound-fetch primitives.
4. P1-8 + P1-9 make MITM settings persist and DB imports cache-safe.
5. §5 documentation sweep — stale docs are actively dangerous in a codebase this size.

## 7. Environment caveats

- This audit is **static**. `node_modules/` and `tests/node_modules/` were not installed at
  audit time; nothing here was validated by running the suite or a build. Before trusting
  behavioural claims: `npm install`, `cd tests && npm install`, `npx vitest run --config
  tests/vitest.config.js`, then `tests/__baseline__/verify-no-regression.mjs <vitest-json>`.
- Registry size reconciliation (for future audits): **122** registry files on disk,
  **119** active bindings (3 commented out: trae, windsurf, devin-cli),
  124 files total in `registry/` counting `index.js` + `REGISTRY_TEMPLATE.js`.
