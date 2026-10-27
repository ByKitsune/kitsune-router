# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Kitsune Router (`kitsune-router-app`) — a local AI routing gateway + Next.js dashboard. It exposes compatible endpoints under `/v1/*` and routes traffic across upstream providers with format translation, model-combo fallback, multi-account fallback, OAuth/API-key credential management, token refresh and quota/usage tracking. Legacy cloud-sync fields remain, but the sync implementation was removed.

Two artifact types live in this one repo; publication of the rebranded packages is pending:
- The **dashboard + gateway** (root `package.json`, `kitsune-router-app`) — the Next.js server that does the actual routing.
- The **CLI launcher** (`cli/`, published as `@bykitsune/router`, binary `kitsune-router`) — a separate package that installs/starts the server and manages the tray. It has its own manifest and build; the release guard requires all four package versions and lockfiles to match the release tag.

The code lives in `src/` (Next.js app + dashboard/compat APIs), `open-sse/` (the provider-agnostic routing/translation engine), `cli/` (the launcher package), and `tests/`.

### Identity and migration contract

- **Kitsune Router — Your models. Your routes.** Maintained/sponsored by [ByKitsune](https://bykitsune.com); provider-neutral and local-first, with no mandatory ByKitsune account or preferred provider order.
- Target repository: `https://github.com/ByKitsune/kitsune-router`; npm `@bykitsune/router`; executable `kitsune-router`; canonical image `ghcr.io/bykitsune/kitsune-router`. **Client provider keys are `kitsunerouter`**, not the hyphenated executable or a bare JavaScript identifier with a hyphen.
- **1.0.2 is user-authorized; final SHA/tag, exact-source gates and npm/GHCR publication are pending.** Keep both tags immutable: v1.0.0 at `390a65677c06a30084386d2a2adf8b0c48709281` failed the ownership migration test before npm/GHCR publication; v1.0.1 at `745834026a5a9f55dffce40c0ad01bf3106e8237` passed SSH (9,039 passed, 100 skipped, zero failures) and CI `40463259397`, but GHCR `40465152324` failed its exact gate (9,038 passed, one failed at `db-scoped-cache:216`) before login/push. npm `40465152995` passed the exact gate/docs build/pack, then publish failed; cause is not yet known, public readback was HTTP 404 on 2026-10-27, and no GitHub Release 1.0.1 was created. Source tags/saved CI artifacts are not registry releases; do not infer E401/E403/two-factor failure. See `docs/CHANGELOG_v1.0.2.md` for artifact identity and pending gates; do not inherit prior counts.
- The 1.0.2 cache-test fix controls the child clock and covers equal/different timestamps with real fresh-cache/repository writes; **production priority/`updatedAt` ordering is unchanged**. Production migration ownership checks also remain fail-closed for unreadable same-UID state. Historical migration coverage is **58 total including eight denials**, not 58 plus eight; bounded UID 65534 Linux evidence is not general non-root certification, and native Windows/macOS migration remains unverified. ByKitsune integration PR #6 merged at `73a14982` without production deployment. Do not move old tags or relabel artifacts.
- Read `docs/MIGRATION.md` before changing state initialization. `cli/hooks/dataDirectory.js` resolves `DATA_DIR` authoritatively; otherwise it can migrate stopped `~/.zenrouter`/`~/.9router` state to `~/.kitsune-router` (`%APPDATA%` on Windows). Keep originals, native Node/Bun SQLite-consistent snapshots, copied-file verification, destination lock/incomplete-marker refusal, secrets/auth/certificates and no-overwrite behavior. Never replace derivation salts, an existing SAML issuer or trusted root just to rename it. Fresh SAML uses `urn:kitsunerouter:sp`; existing implicit legacy entity IDs are preserved.
- New project environment names use `KITSUNE_ROUTER_*`, extension headers `x-kitsune-router-*`. Unprefixed operator secrets keep their values; standard `/v1/*` and port 20128 are unchanged. Old binary/provider-key aliases are not required. Historical audit paths, hashes, upstream product identities and legal notices are provenance, not branding bugs.

## Commands

Dashboard/gateway (run from repo root):

The source server (`next dev`, source production/standalone) is not the CLI launcher's secret-provisioning path. `JWT_SECRET` must be a strong value of at least 32 characters or dashboard login fails. The initialization below is for a **fresh** source install with POSIX shell/OpenSSL. On upgrades, retain the effective existing JWT/API/identity secrets and absolute `DATA_DIR`; use `docs/MIGRATION.md` rather than generating replacements. Keep `.env` private/uncommitted and replace other public example defaults only for a fresh installation.
```bash
umask 077
cp -n .env.example .env
if ! grep -q '^JWT_SECRET=.' .env; then
  printf '\nJWT_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
fi
chmod 600 .env
npm ci
npm run check:deps
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
npm run build && npm run start                                        # production (node)
npm run build && npm run start:bun                                    # production (bun runtime; bun:sqlite)
```
- All ports are aligned to **20128** (dashboard at `/dashboard`, API at `/v1`). The standalone server reads `PORT` from `.env` and ignores CLI args — keep `.env`'s `DATA_DIR` ABSOLUTE when running the standalone/bun build (it chdirs into `.next/standalone`; a relative DATA_DIR silently creates a fresh empty DB).
- Lint: `npm run lint -- --max-warnings=0`. The composed runner applies Oxlint's Next.js policies (`.oxlintrc.json`) and ESLint's React/import/accessibility policies (`eslint.config.mjs`). Running ESLint alone does not cover the Next.js rules. Run `npm run lint:policy` after changing either policy or the runner.

CLI package (`cli/`):
```bash
npm run cli:pack       # build + npm pack from root
cd cli && npm run dev  # node --watch launcher
```

Tests (Vitest lives in `tests/`, an **independent** ESM package, also exposed by root `npm test`):
```bash
npm ci                                  # ROOT deps first — tests import from src/ which needs `open`, `undici`, etc.
cd tests && npm ci                      # then tests' own locked deps → tests/node_modules (allowed by tests/.gitignore)
npx vitest run                          # all tests; auto-discovers tests/vitest.config.js
npx vitest run unit/capabilities.test.js   # single file (path relative to tests/)
```
> From the repository root, use `npm test` after installing both dependency sets, or `npm --prefix tests test`. The committed Vitest configuration resolves the repository root and `open-sse`/`@/` aliases regardless of the invocation directory. It does not load repository `.env` files (`envDir: false`); supply synthetic configuration or deliberate live-test opt-ins explicitly through the process environment. Do not point test state at a production `DATA_DIR`.
> Source `prebuild`/`pretest` hooks reject installed direct-dependency drift from the lockfile. `node scripts/check-installed-dependencies.mjs . tests cli gitbook` checks all four installed projects. Restore them with `npm ci`; never lower locked versions to match a stale install. These metadata checks do not replace integrity checks or security audits.
>
> **Report actual case and suite failures from the current run**, rather than relying on an old expected count. Notes:
> - `unit/embeddings.cloud.test.js.skip` targets the private `cloud/` worker — rename back to `.test.js` only when that checkout exists.
> - Live-provider suites are opt-in (`RUN_LIVE_TESTS=1`) or self-skip without credentials.
> - Judge regressions with `tests/__baseline__/verify-no-regression.mjs <vitest-json>`; count suite-level failures too (`numFailedTestSuites`), not just test counts.
- Run `npm run test:compat` for the CJS HTTP/2-upgrade compatibility tests; they are not included in Vitest's `*.test.js` glob. The report gate rejects unsuccessful/empty/inconsistent reports and collection failures. CI retains SHA-bound JSON evidence; `it.fails` and skipped cases remain separate from verified working behavior.
- `*.real.test.js` under `tests/translator/real/` make live provider calls — skip unless credentials are set.
- Regression baselines: `tests/__baseline__/verify-*.mjs` compare against committed snapshots (providers, aliases, OAuth URLs). Run these after touching provider registry / alias logic.

## Architecture

Two authoritative docs already exist — read them before working in these areas rather than re-deriving:
- `docs/ARCHITECTURE.md` — request lifecycle, combo/account fallback, OAuth + token refresh, data model and legacy boundaries.
- `open-sse/AGENTS.md` — the routing/translation engine's own conventions and "how to add a provider/executor/translator". **Read this before editing anything under `open-sse/`.**

### Request flow (the thing to understand first)
`src/app/api/v1/*` route (Next rewrite maps `/v1/*` → `/api/v1/*` in `next.config.mjs`)
→ `src/sse/handlers/chat.js` (parse, combo expansion, account-selection loop)
→ `open-sse/handlers/chatCore.js` (detect source format, translate request, dispatch to executor, retry/refresh, stream setup)
→ `open-sse/executors/*` (per-provider upstream call; `default.js` handles any OpenAI-compatible provider)
→ `open-sse/translator/*` (client format ↔ provider format)
→ SSE back to client.

`src/sse/` is the app-side entry glue; `open-sse/` is the provider-agnostic engine. Some engine modules import app persistence/logging through `@/`; it is not an independently installable library. Cross that boundary consciously.

### Translator engine (`open-sse/translator/`)
- Pivots through **OpenAI as the intermediate format**. A translator registered on an exact `source:target` pair (e.g. `claude:kiro`) runs as a **direct route**, skipping the lossy double-hop. Prefer a direct route for fragile pairs (thinking blocks, tool ids, non-base64 images, `is_error`).
- Translators **self-register** via `register(from, to, reqFn, resFn)` as an import side effect — a new translator file MUST be imported in `open-sse/translator/index.js` or it never runs.
- Never hardcode role/block/model strings — use `open-sse/translator/schema/` and `open-sse/config/` constants. Config-driven and DRY is enforced by convention here.

### Provider registry (`open-sse/providers/registry/*`)
- One file per provider. `providers/registry/index.js` is an **auto-generated** static import list — regenerate it with `scripts/migrate-registry.mjs` / `injectDisplayToRegistry.mjs`, don't hand-edit.
- Add a provider: copy `providers/REGISTRY_TEMPLATE.js`, add models to `config/providerModels.js`. Only add an executor for non-OpenAI-compatible upstreams.

### Persistence
State is **no longer `db.json`**. It's a SQLite layer under `src/lib/db/` with a runtime-specific adapter fallback chain (`driver.js`): Bun uses `bun:sqlite`; Node prefers optional `better-sqlite3`, then `node:sqlite` (Node ≥22.5). Pure-JS `sql.js` requires explicit `KITSUNE_ROUTER_SQLJS_SINGLE_PROCESS=true` and exclusive single-process ownership of `DATA_DIR`; mixed writers fail closed. A stale `.sqljs-owner` directory requires operator review after confirming no owner remains. `better-sqlite3` stays optional so installation can succeed without build tools.
- `src/lib/localDb.js` is a **backward-compat shim** re-exporting `src/lib/db/index.js`. New code should import from `@/lib/db/index.js`; per-entity logic lives in `src/lib/db/repos/*`. Schema/migrations in `src/lib/db/migrations/`.
- DB file location resolves via `src/lib/db/paths.js` (`DATA_DIR`, else `~/.kitsune-router/`).
- Usage/request logs use the same SQLite repository layer and absolute `DATA_DIR`; `usage.json` is a legacy import source, not the active usage database.
- Full database import bypasses ordinary repository mutations. The process-local `src/lib/db/helpers/importGeneration.js` still advances only after commit; persisted scope revisions additionally fence native SQLite workers and dependent caches. Rollbacks retain warmed references. Preserve refresh of MITM aliases and connection/project/quota state, and do not claim success if post-commit alias synchronization failed.
- Usage acceptance (`enqueueRequestUsage`) freezes tokens, recorded time, resolved pricing and delivered-tier costs into a bounded durable outbox. Projection commits history, daily totals, lifetime count and outbox removal together using a unique event ID. `saveRequestUsage` additionally waits for history visibility. Retain one ID per incurred routed attempt, reuse it on terminal retries and surface failed acceptance; request/detail/file logs are best-effort telemetry, not a billing ledger.
- `custom-server.js` owns managed process shutdown: stop scheduling/admission, drain HTTP, flush durable usage, flush best-effort logs, close upstream pools, then checkpoint/close SQLite within one deadline. Direct adapter consumers retain their independent lifecycle by default.

### RTK token saver (`open-sse/rtk/`)
Final-provider-body hooks, after translation/native preparation and before dispatch, compress `tool_result` content in-place to cut tokens. **Fail-open**: any error returns null and leaves the body untouched — never throw out of them. Skips `is_error`/`status:"error"` results to preserve traces.

## Conventions & gotchas

- Plain JavaScript (ESM), no TypeScript. `@/*` path alias → `src/*` (`jsconfig.json`).
- `custom-server.js` derives client IP from the TCP socket, accepting only a valid rightmost `X-Forwarded-For` address appended by a loopback reverse proxy. A lone `X-Real-IP` is not trusted. Preserve the proxy marker even when its address is rejected; proxy traffic must not gain loopback-only privileges.
- Security-sensitive env: `JWT_SECRET` (session cookie), `INITIAL_PASSWORD` (set a strong value before exposure), `API_KEY_SECRET`, `MACHINE_ID_SALT`. Full env contract in `.env.example` and ARCHITECTURE.md's env matrix. Back up the whole private `DATA_DIR`, not just a database export, and do not claim all stored provider keys are encrypted at rest.
- Server-side provider probes and model catalogs must use `fetchPublic` or, only after `isLocalRequest`, `fetchTrustedLocal`. A separate DNS check followed by global `fetch` is not safe. Preserve metadata denial, pinned DNS, redirect checks, cancellation and bounded body reads. Image retrieval has its own engine-side public IP policy in `open-sse/config/mediaConfig.js`; it must not import the app layer.
- The MITM certificate API is asynchronous and uses WebCrypto plus `@peculiar/x509`, not `node-forge`. Await root loading and leaf generation. Existing PKCS#1/PKCS#8 keys and unexpired trusted roots must remain usable without trust-store changes; test only with temporary certificate directories.
- OpenCode configuration writes use `src/shared/utils/opencodeConfig.js` for JSONC-preserving, serialized atomic updates. Parse/read errors must never become an empty replacement config. Preserve user model/agent settings and use disposable HOME/XDG directories in tests; coexisting `.json`/`.jsonc` files require the operator to resolve the ambiguity.
- Binary/protobuf upstreams (kiro EventStream, cursor protobuf, commandcode NDJSON) don't round-trip through OpenAI — they're handled inside their own executor, not the translator.
- **Security-first on PRs**: Security is the top priority when reviewing or creating PRs. Audit authentication, credential/token storage & leaks, header manipulation (`X-Forwarded-For`), and SSRF risks before functional logic. Always include explicit security warnings/notes when reporting PR reviews or changes to the user.
- Versioning: root, `cli/`, `tests/` and `gitbook/` manifests and lockfiles must agree before release. `scripts/bump-version.mjs` updates all four manifest/lock pairs but not release notes or publication. Upstream client identities in `open-sse/config/clientVersions.js` are a separate version line. Commit style is Conventional Commits (`fix(translator): …`, `feat(...)`).
- Catalog provenance: `docs/audit/data/catalog-review-20261017.json` records the October 17 models.dev commit, capture/reconstruction hashes, comparison coverage and unresolved fields. Use exact provider/product identities and primary-source overrides; do not turn missing catalog rows into retirements or assign 1M output because a model has a 1M context window.
- Vision regressions: keep tool media attached internally until destination-specific serialization; hoisting images before all parallel tool replies can fabricate missing results. Explicit hybrid `tool_result` blocks require native lowering even on final Chat normalization. Gemini `response.result`/`response.output` arrays can contain typed media, but ordinary JSON records and nested examples must remain data. See `tests/unit/vision-large-tool-wire.test.js` and `tests/translator/translator-media-*.test.js`.
- No-auth proxy plans are scoped to the request's exclusion set and snapshot the configured pool budget. Virtual `noauth:` connection IDs are routing identities, not persistent accounts. Do not write account health for them or retry quota/abuse denials via another egress. A configured pool never silently falls back to direct transport.
- Provider thinking and processing speed use independent persisted maps (`providerThinking`, `providerServiceTier`) admitted by both settings allowlists. Native `service_tier` is not `reasoning.effort`; explicit Standard/Auto must not be replaced by a paid default. Dashboard probes own their request budget, whereas real client caps must remain untouched.
- Cost estimates use the confirmed delivered tier, not just the request. Native OpenAI 30m/12h cache writes are separate from Anthropic 5m/1h. Unknown complete totals remain null; `costCoverage` is only a labeled known subtotal. Do not automatically reprice historical usage or turn a subscription multiplier into an API-dollar invoice.
- Time-dependent pricing resolves from the recorded usage timestamp before operator override merging. The native DeepSeek calendar is finite; unsupported years/timestamps stay unknown. Date-only published replacement rates use a documented UTC estimate boundary. Guaranteed-minimum promotions are not automatic expiries, and token-hour/image/character rates never become text-token prices.
- MITM password v2 ciphertext needs `${DATA_DIR}/auth/mitm-password.key` as well as the DB. New encryption uses a random installation key, never a machine-ID/fixed-salt fallback. Legacy reads do not silently migrate settings. Database config export is not a full secret/key backup.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
