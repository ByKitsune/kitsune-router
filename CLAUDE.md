# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ZenRouter (`zenrouter-app`) — a local AI routing gateway + Next.js dashboard. It exposes one OpenAI-compatible endpoint (`/v1/*`) and routes traffic across 40+ upstream providers with format translation, model-combo fallback, multi-account fallback, OAuth/API-key credential management, token refresh, quota/usage tracking, and optional cloud sync.

Two published artifacts live in this one repo:
- The **dashboard + gateway** (root `package.json`, `zenrouter-app`) — the Next.js server that does the actual routing.
- The **CLI launcher** (`cli/`, published to npm as `zenrouter`) — a separate package that installs/starts the server and manages the tray. It has its own `package.json`, version, and build.

The code lives in `src/` (Next.js app + dashboard/compat APIs), `open-sse/` (the provider-agnostic routing/translation engine), `cli/` (the launcher package), and `tests/`.

## Commands

Dashboard/gateway (run from repo root):
```bash
cp .env.example .env
npm install
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
npm run build && npm run start                                        # production (node)
npm run build && npm run start:bun                                    # production (bun runtime; bun:sqlite)
```
- All ports are aligned to **20128** (dashboard at `/dashboard`, API at `/v1`). The standalone server reads `PORT` from `.env` and ignores CLI args — keep `.env`'s `DATA_DIR` ABSOLUTE when running the standalone/bun build (it chdirs into `.next/standalone`; a relative DATA_DIR silently creates a fresh empty DB).
- Lint: `npm run lint -- --max-warnings=0`. The composed runner applies Oxlint's Next.js policies (`.oxlintrc.json`) and ESLint's React/import/accessibility policies (`eslint.config.mjs`). Running ESLint alone does not cover the Next.js rules. Run `npm run lint:policy` after changing either policy or the runner.

CLI package (`cli/`):
```bash
npm run cli:pack       # build + npm pack from root
cd cli && npm run dev  # nodemon watch
```

Tests (Vitest lives in `tests/`, an **independent** ESM package, also exposed by root `npm test`):
```bash
npm install                             # ROOT deps first — tests import from src/ which needs `open`, `undici`, etc.
cd tests && npm install                 # then tests' own deps (vitest) → tests/node_modules (allowed by tests/.gitignore)
npx vitest run                          # all tests; auto-discovers tests/vitest.config.js
npx vitest run unit/capabilities.test.js   # single file (path relative to tests/)
```
> From the repository root, use `npm test` after installing both dependency sets, or `npm --prefix tests test`. The committed Vitest configuration resolves the repository root and `open-sse`/`@/` aliases regardless of the invocation directory. Do not point test state at a production `DATA_DIR`; the configuration loads `.env` if present.
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
- `docs/ARCHITECTURE.md` — full system: request lifecycle, combo/account fallback, OAuth + token refresh, cloud sync, data model.
- `open-sse/AGENTS.md` — the routing/translation engine's own conventions and "how to add a provider/executor/translator". **Read this before editing anything under `open-sse/`.**

### Request flow (the thing to understand first)
`src/app/api/v1/*` route (Next rewrite maps `/v1/*` → `/api/v1/*` in `next.config.mjs`)
→ `src/sse/handlers/chat.js` (parse, combo expansion, account-selection loop)
→ `open-sse/handlers/chatCore.js` (detect source format, translate request, dispatch to executor, retry/refresh, stream setup)
→ `open-sse/executors/*` (per-provider upstream call; `default.js` handles any OpenAI-compatible provider)
→ `open-sse/translator/*` (client format ↔ provider format)
→ SSE back to client.

`src/sse/` is the app-side entry glue; `open-sse/` is the provider-agnostic engine (also usable standalone). Cross that boundary consciously.

### Translator engine (`open-sse/translator/`)
- Pivots through **OpenAI as the intermediate format**. A translator registered on an exact `source:target` pair (e.g. `claude:kiro`) runs as a **direct route**, skipping the lossy double-hop. Prefer a direct route for fragile pairs (thinking blocks, tool ids, non-base64 images, `is_error`).
- Translators **self-register** via `register(from, to, reqFn, resFn)` as an import side effect — a new translator file MUST be imported in `open-sse/translator/index.js` or it never runs.
- Never hardcode role/block/model strings — use `open-sse/translator/schema/` and `open-sse/config/` constants. Config-driven and DRY is enforced by convention here.

### Provider registry (`open-sse/providers/registry/*`)
- One file per provider. `providers/registry/index.js` is an **auto-generated** static import list — regenerate it with `scripts/migrate-registry.mjs` / `injectDisplayToRegistry.mjs`, don't hand-edit.
- Add a provider: copy `providers/REGISTRY_TEMPLATE.js`, add models to `config/providerModels.js`. Only add an executor for non-OpenAI-compatible upstreams.

### Persistence — IMPORTANT (ARCHITECTURE.md is stale here)
State is **no longer `db.json`**. It's a SQLite layer under `src/lib/db/` with an adapter fallback chain (`driver.js`): `bun:sqlite` → `better-sqlite3` (optional native dep) → `node:sqlite` (Node ≥22.5) → `sql.js` (pure-JS fallback, always works). `better-sqlite3` is deliberately in `optionalDependencies` so install never fails without build tools.
- `src/lib/localDb.js` is a **backward-compat shim** re-exporting `src/lib/db/index.js`. New code should import from `@/lib/db/index.js`; per-entity logic lives in `src/lib/db/repos/*`. Schema/migrations in `src/lib/db/migrations/`.
- DB file location resolves via `src/lib/db/paths.js` (`DATA_DIR`, else `~/.zenrouter/`).
- Usage/request logs use the same SQLite repository layer and absolute `DATA_DIR`; `usage.json` is a legacy import source, not the active usage database.

### RTK token saver (`open-sse/rtk/`)
Pre-translate hooks that compress `tool_result` content in-place to cut tokens. **Fail-open**: any error returns null and leaves the body untouched — never throw out of them. Skips `is_error`/`status:"error"` results to preserve traces.

## Conventions & gotchas

- Plain JavaScript (ESM), no TypeScript. `@/*` path alias → `src/*` (`jsconfig.json`).
- `custom-server.js` derives client IP from the TCP socket, accepting only a valid rightmost `X-Forwarded-For` address appended by a loopback reverse proxy. A lone `X-Real-IP` is not trusted. Preserve the proxy marker even when its address is rejected; proxy traffic must not gain loopback-only privileges.
- Security-sensitive env: `JWT_SECRET` (session cookie), `INITIAL_PASSWORD` (default `12345678` — must override), `API_KEY_SECRET`, `MACHINE_ID_SALT`. Full env contract in `.env.example` and ARCHITECTURE.md's env matrix.
- Server-side provider probes and model catalogs must use `fetchPublic` or, only after `isLocalRequest`, `fetchTrustedLocal`. A separate DNS check followed by global `fetch` is not safe. Preserve metadata denial, pinned DNS, redirect checks, cancellation and bounded body reads. Image retrieval has its own engine-side public IP policy in `open-sse/config/mediaConfig.js`; it must not import the app layer.
- The MITM certificate API is asynchronous and uses WebCrypto plus `@peculiar/x509`, not `node-forge`. Await root loading and leaf generation. Existing PKCS#1/PKCS#8 keys and unexpired trusted roots must remain usable without trust-store changes; test only with temporary certificate directories.
- Binary/protobuf upstreams (kiro EventStream, cursor protobuf, commandcode NDJSON) don't round-trip through OpenAI — they're handled inside their own executor, not the translator.
- **Security-first on PRs**: Security is the top priority when reviewing or creating PRs. Audit authentication, credential/token storage & leaks, header manipulation (`X-Forwarded-For`), and SSRF risks before functional logic. Always include explicit security warnings/notes when reporting PR reviews or changes to the user.
- Versioning: root and `cli/` are versioned independently. Commit style is Conventional Commits (`fix(translator): …`, `feat(...)`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
