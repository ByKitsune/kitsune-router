# 05 — CLI package, tests, scripts & release tooling

Audit date 2026-10-13 · commit `2c61f4f1` · verified by static reading only (no deps installed).

## 1. The CLI package (`cli/`)

Published to npm as **`@joyccn/zenrouter`**, binary `zenrouter` → `cli/cli.js`.
It is versioned **independently** from the root app (both are currently 0.9.7, but that is
coincidence — the release scripts check them separately).

### File inventory

| Path | LOC | Purpose |
|---|---|---|
| `cli/cli.js` | 1,008 | Entry point. Argument/command dispatch, server spawn + readiness polling, spinner UI, menus |
| `cli/hooks/postinstall.js` | 40 | npm `postinstall`: creates data dir, generates runtime secrets, warms SQLite + tray deps. **Non-fatal on any failure** |
| `cli/hooks/runtimeSecrets.js` | 131 | Generates/persists `JWT_SECRET` & friends into `<dataDir>/secrets.json` (mode `0600`, atomic temp+rename) |
| `cli/hooks/sqliteRuntime.js` | 180 | Lazily installs `sql.js` / `better-sqlite3` into `~/.zenrouter/runtime` — deliberately **not** bundled in the package |
| `cli/hooks/trayRuntime.js` | 107 | Lazily installs `systray2` into the runtime dir |
| `cli/hooks/nodeFlags.js` | 69 | Node runtime flag handling |
| `cli/src/cli/api/client.js` | 556 | HTTP client for the local dashboard API |
| `cli/src/cli/menus/providers.js` | 860 | Provider management TUI |
| `cli/src/cli/menus/cliTools.js` | 618 | Configures external CLIs to point at ZenRouter |
| `cli/src/cli/menus/combos.js` | 477 | Combo management TUI |
| `cli/src/cli/menus/apiKeys.js` | 233 | API key management TUI |
| `cli/src/cli/menus/settings.js` | 204 | Settings TUI |
| `cli/src/cli/commands/xaiVideo.js` | 300 | xAI video command |
| `cli/src/cli/tray/{tray,autostart,trayWin}.js` | 717 | System tray + OS autostart (`tray.ps1` for Windows) |
| `cli/src/cli/utils/*.js` | 824 | `clipboard`, `display`, `endpoint`, `format`, `input`, `menuHelper`, `modelSelector` |
| `cli/scripts/build-cli.js` | — | esbuild bundling for the published artifact |
| `cli/scripts/buildMitm.js` | — | Bundles the MITM child process |

### What `cliTools.js` configures

Grep of the menu reveals the supported targets: **claude** (Claude Code), **codex**,
**droid**, **opencode**, **openclaw**, **hermes**. The Claude path writes
`~/.claude/settings.json` → `env.ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`,
`API_TIMEOUT_MS: "600000"`, plus `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL`
(`cli/src/cli/menus/cliTools.js:88`). It only overwrites `ANTHROPIC_BASE_URL` when the
existing value is absent or already ZenRouter-owned (`:110-113`) — a deliberate
don't-clobber-foreign-config guard.

### Design decisions worth knowing

- **Runtime deps are installed outside the package.** `sql.js`, `better-sqlite3`, and
  `systray2` are intentionally absent from `cli/package.json` dependencies; `postinstall`
  installs them into `~/.zenrouter/runtime`. This keeps the npm package small and avoids
  native build failures at global-install time. Consequence: first run may need network.
- **Secrets are generated locally, never shipped.** `runtimeSecrets.js` explicitly refuses
  a shared default because `src/lib/auth/dashboardSession.js` has no fallback — a known
  constant would let anyone forge a dashboard session. `secrets.json` is written `0600`,
  atomically, and existing values are never overwritten. An exported `JWT_SECRET` env var
  wins over the file.
- **Postinstall runs code at install time.** `cli/hooks/postinstall.js` executes on
  `npm i -g`. It only writes inside the user data dir and spawns npm installs of the
  runtime deps; it does not curl remote scripts. Still, it is a supply-chain surface: this
  hook is what runs when a user installs the package.

## 2. Test suite (`tests/`)

An **independent ESM package** (`tests/package.json`, `zenrouter-tests`) with its own
`node_modules`. It is *not* wired into the root `npm test` in the documented workflow,
though the root `package.json` `test` script does invoke
`node tests/node_modules/vitest/vitest.mjs run --config tests/vitest.config.js`.

| Group | Count | Notes |
|---|---|---|
| `tests/unit/` | **456** files | The bulk of the suite |
| `tests/translator/` | 27 files | Translation correctness + `__snapshots__/` |
| `tests/translator/real/` | 14 files | **Live provider calls** — opt-in, must skip without credentials |
| `tests/auth/` | 1 file (`saml.test.js`) | SAML flow |
| `tests/helpers/` | `mitm-upstream-tls.cjs` | TLS fixture for MITM tests |
| **Total `*.test.js`** | **498** | 0.9.7 release gate claims 4,091 passed / 100 skipped / 1 todo / 0 failed |

- `tests/unit/embeddings.cloud.test.js.skip` targets the private `cloud/` worker and is
  **intentionally disabled**. Rename back only when that checkout exists.
- The committed `tests/package.json` `test` script hardcodes Unix `/tmp/node_modules`
  paths (an upstream shared-install workaround). **Ignore it**; use
  `npx vitest run --config tests/vitest.config.js` (or the root `npm test`, which uses an
  explicit path and does not rely on `NODE_PATH`).
- `vitest.config.js` resolves the `open-sse` and `@/` aliases from the repo root, so it
  works regardless of where vitest is installed.

### Regression baselines (`tests/__baseline__/`)

| File | Role |
|---|---|
| `verify-no-regression.mjs` | Compares a vitest JSON report against `baseline-results.json`; flags **pass→fail**. Journal with this, and also count `numFailedTestSuites`, not just test counts |
| `verify-providers.mjs` | Diffs the live provider registry against `providers-baseline.json` |
| `verify-alias.mjs` | Diffs model aliases against `alias-baseline.json` |
| `verify-oauth-urls.mjs` | Diffs generated OAuth URLs against `oauth-urls-baseline.json` |
| `snapshot-providers.mjs` | Regenerates the provider baseline |
| `known-fails.txt` | Empty as of 2026-08-25 — the suite is expected all-green |

Run `verify-providers` / `verify-alias` / `verify-oauth-urls` after touching the provider
registry or alias logic; run `verify-no-regression` after any change.

## 3. Build, scripts & release pipeline

### Root scripts (`package.json`)

| Script | What it does |
|---|---|
| `dev` | `next dev --port 20128` |
| `dev:webpack` | Same, forcing the webpack dev server |
| `build` | `next build --webpack`, then `postbuild` copies standalone assets |
| `start` | `node custom-server.js --port 20128` |
| `build:bun` / `start:bun` | Bun runtime path (`bun:sqlite` driver) |
| `cli:pack` / `cli:publish` | Delegates to `cli/` |
| `test` | vitest via explicit `tests/node_modules` path |
| `lint` | `eslint .` |
| `lint:policy` | Runs `tests/unit/eslint-policy.test.js` only |

### `scripts/`

| Script | Role |
|---|---|
| `migrate-registry.mjs` | **Regenerates** `open-sse/providers/registry/index.js` (the auto-generated import list) — never hand-edit that file |
| `injectDisplayToRegistry.mjs` | Injects display metadata into registry entries |
| `generate-provider-identity.mjs` | Provider identity generation |
| `bump-version.mjs`, `check-release-version.mjs`, `release-publication-helpers.mjs` | Version/release guards |
| `copy-standalone-assets.mjs` | `postbuild` — copies assets Next tracing misses |
| `worker-mesh.mjs` (+ reader/runner) | Dev-only Mutagen star topology for multi-worker builds/tests |
| `test-combo-autoswitch.mjs` | Combo autoswitch harness |
| `translate-readme.js` | README i18n generator |

### CI (`.github/workflows/ci.yml`)

On push/PR to `master`/`main`: Node 22 → `npm ci` → `cd tests && npm ci` →
`npm test --if-present` → `npm run build --if-present`. It injects test-only
`JWT_SECRET`, `ZENROUTER_PEER_TOKEN`, `NODE_ENV=test`. Other workflows:
`release.yml` (publish), `docker-publish.yml`, `dependabot.yml`.

### Docker

Multi-stage `Dockerfile` (`node:22-alpine`): builder installs `python3 make g++ linux-headers`
and runs `next build`; the runner copies `public/`, `.next/static`, `.next/standalone`,
`custom-server.js`, `open-sse/`, `src/mitm`, and explicitly re-copies `node-forge`, `next`,
and the `sql.js` wasm because Next file tracing omits them. `DATA_DIR=/app/data`,
`PORT=20128`, `HOSTNAME=0.0.0.0`.

`docker-compose.yml` runs ZenRouter plus a companion **headroom** service
(`ghcr.io/chopratejas/headroom:latest`, port 8787, `HEADROOM_URL` env) — the external
half of the RTK/headroom token-compression feature.

**Publication targets `linux/amd64` only**, not multi-arch. Persist `/app/data`.

## 4. In-repo agent skills (`skills/`)

Ten `SKILL.md` files published in-repo (not part of the DSH session catalog): `zenrouter`
(entry), `-chat`, `-image`, `-video`, `-tts`, `-stt`, `-embeddings`, `-web-search`,
`-web-fetch`. They are **usage docs for consuming ZenRouter's REST API** — drop-in prompts
users paste into any AI agent. They document the `/v1/models/{image,tts,embedding,web,stt,image-to-text}`
catalog endpoints and the `ZENROUTER_URL` / `ZENROUTER_KEY` convention.

## 5. Notes for the next person

- Root and `cli/` are released from separate manifests; bump both via `scripts/bump-version.mjs`
  and verify with `scripts/check-release-version.mjs`.
- `postbuild` must run — `.next/standalone` alone is missing `sql.js`'s wasm and the MITM deps.
- `node-forge` 1.4.0 carries an unresolved advisory (GHSA-86w9-cpqp-85rv / CVE-2026-85393)
  in both root and `cli/` trees; `docs/ARCHITECTURE.md` §4 records the scoped
  non-reachability assessment. Re-assess before introducing forge signature verification.
- The suite is large and green by contract; use the baseline scripts rather than eyeballing
  test counts.

## 6. Current verification workflow, 2026-10-18

The root `npm test` now runs the independent Vitest package with `tests/vitest.config.js`. `tests/package.json` no longer requires the historical `/tmp/node_modules` workaround described above. Keep Node at or above the manifests' 22.19.0 floor.

Run checks from a disposable checkout with an absolute temporary `DATA_DIR`, temporary `HOME`, synthetic secrets and no production `.env` or provider credentials. Disable live suites and background token/catalog work. A passing synthetic fixture proves gateway behavior, not provider entitlement.

Run the complete suite and regression checks from the repository root:

```bash
npm test -- --reporter=json --outputFile=/tmp/zenrouter-vitest.json
node tests/__baseline__/verify-no-regression.mjs /tmp/zenrouter-vitest.json
npm run lint -- --max-warnings=0
npm --prefix gitbook test
npm --prefix gitbook run build
node --test tests/unit/custom-server-h2c.test.cjs
node tests/__baseline__/verify-providers.mjs
node tests/__baseline__/verify-alias.mjs
node tests/__baseline__/verify-oauth-urls.mjs
node scripts/generate-provider-identity.mjs --check
node scripts/check-release-version.mjs
```

Inspect both `numFailedTests` and `numFailedTestSuites` in the JSON report. Record skipped live/credential-dependent suites separately; do not report them as exercised providers.

Build and inspect the unpublished artifact without running publication:

```bash
npm --prefix cli run build
npm pack ./cli --pack-destination /tmp
```

The CLI build also compiles the dashboard and MITM runtime. Reject bundled state, credentials, temporary build homes and missing API artifacts. Keep database adapter source files: `src/lib/db/` is executable runtime code, not operator state. Run the extracted package with absolute disposable state and loopback-only synthetic upstreams.

The selective upstream batch adds behavior coverage in `gitlab-pat-ssrf-guard.test.js`, `proactive-token-refresh.test.js` and `github-embeddings-contract.test.js`. Existing combo, response-accounting and usage-overlay tests cover the remaining fixes. Refresh tests retain the real policy-aware lower cache; deferred persistence barriers are synthetic, not evidence that synchronous SQLite writes normally take seconds.

Source and packaged smokes are separate from Vitest. The source run exercised actual HTTP refresh and SQLite persistence; the packaged run exercised the public APIs, authenticated management routes, local MCP and token statistics. The `0.9.11` manifest on an unpublished local tarball does not make it the immutable published `0.9.11` release.

