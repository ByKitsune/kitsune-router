# Kitsune Router — historical audit & knowledge map

The [stable npm dependency and CI repair follow-up](27-dependency-upgrade-and-ci-repair-2026-10-31.md)
records all owned package targets, compatible transitives, SAML/PKI migrations,
the repaired minimatch audit and final verification evidence.

The [October 31 security/stability closing review](26-security-stability-and-1.0.5-closing-2026-10-31.md)
records fresh upstream issue/advisory dispositions, verified auth/resource/model
error fixes, the 1.0.5 source bump and the initial dependency gate subsequently repaired in the follow-up.

The [client compatibility and catalog sync follow-up](25-client-compatibility-and-catalog-sync-2026-10-31.md)
records verified client/SDK identities, source-backed model changes, per-account
discovery and the boundaries of blocked publisher sources.

The [recorded pricing accuracy and dashboard motion follow-up](24-recorded-pricing-accuracy-and-dashboard-motion-2026-10-31.md)
records current corrections to dynamic-model pricing configuration, durable
usage identity, token/detail accuracy and animated dashboard navigation/maps.

> **Archive boundary:** the ZenRouter-era reports retain original names, package/artifact URLs, source hashes, operational paths and dated results. They are not current installation instructions or fresh Kitsune Router verification. Later Kitsune-era source reviews have their own dates and evidence boundaries. Use [current docs](../INSTALLATION.md), [operations](../OPERATIONS.md) and [migration](../MIGRATION.md). Kitsune Router is maintained/sponsored by [ByKitsune](https://bykitsune.com); no hosted account is required.

Audit snapshot: **2026-10-13** · commit `2c61f4f1` (`master`) · version **0.9.7**
*(completed in two passes on the same commit — pass 2 filled in 04 + 06, verified key
pass-1 claims against the code, and corrected one: see 06 §5 / 01 §8.1.1)*

Purpose: a durable onboarding/knowledge map of this repository — what exists, where it
lives, how a request actually flows, and what is risky. Written for humans and agents
picking the codebase up cold.

**All seven documents are complete.** Start at [06-findings-and-recommendations.md](06-findings-and-recommendations.md)
if you only have ten minutes, or [07-upstream-sync-2026-10.md](07-upstream-sync-2026-10.md)
for the upstream port backlog.

These are historical snapshots, not a claim that every finding remains open.
See [13-security-wave-2026-10-18.md](13-security-wave-2026-10-18.md) for the
dependency/PKI, lint, stream-identity and DNS-pinned network follow-up.
The subsequent [vision/catalog follow-up](14-vision-catalog-follow-up-2026-10.md)
records newly verified fixes and the limits of their evidence.
The [thinking/speed follow-up](15-thinking-speed-2026-10.md) covers dashboard
probe budgets, persisted defaults and independent OpenAI/Codex service tiers.
The [Antigravity follow-up](16-antigravity-upstream-2026-10.md) records confirmed
runtime retirements and selective request/schema ports from pinned 9router history.

The [October reconciliation](17-october-reconciliation-2026-10.md) tracks the
subsequent pricing, security, protocol, tooling and verification changes. Its
dated evidence and remaining native/operational limits supersede historical
open-finding labels; published release artifacts remain immutable.

The [client/model/pricing refresh](18-client-model-pricing-refresh-2026-10.md)
separates upstream stable client identities, product/account availability and
provider-specific tariffs, including recorded-time native pricing conditions.

The [public contract audit](19-public-contract-audit-2026-10.md) follows the
owner's PDF, errors, reasoning, discovery and billing reports against the current
customized gateway. It records local evidence separately from live-provider and
subscription-billing guarantees.

The [transport recovery follow-up](20-fetch-transport-recovery-2026-10.md)
records the Next.js/global-fetch recursion incident, installed dependency drift,
reproducible build checks and isolated deployment validation.

The Kitsune-era [9Router upstream review and 2026-10-29 source follow-up](21-upstream-9router-2026-10-29.md)
record selected adaptations, deferred work and evidence limits. They are not a
claim that the reviewed source was released or deployed.

The [pricing, capability and localization follow-up](22-pricing-capability-localization-2026-10.md)
reviews the complete configured registry against a pinned official models.dev
source reconstruction, distinguishes price references from usable estimates,
and records the subsequent runtime-localization and upstream issue review.

The [stability and translator-latency follow-up](23-upstream-stability-and-translator-latency-2026-10-31.md)
reviews the latest actual issues separately from commit history, adapts verified
native-thinking/streaming corrections, fixes launcher and observability behavior,
and records matched-input local CPU measurements and their limits.

## Read in this order

| # | Document | Covers |
|---|---|---|
| 1 | [01-open-sse-engine.md](01-open-sse-engine.md) | The provider-agnostic routing/translation engine (`open-sse/`) |
| 2 | [02-persistence-and-data-model.md](02-persistence-and-data-model.md) | SQLite layer, repos, migrations, where credentials live |
| 3 | [03-app-surface-and-request-flow.md](03-app-surface-and-request-flow.md) | Next.js routes, dashboard, `src/sse`, custom server |
| 4 | [04-security-audit.md](04-security-audit.md) | Auth, secret storage, IP trust, SSRF, injection |
| 5 | [05-cli-tests-and-tooling.md](05-cli-tests-and-tooling.md) | CLI package, test suite, scripts, release/Docker pipeline |
| 6 | [06-findings-and-recommendations.md](06-findings-and-recommendations.md) | Consolidated findings, doc discrepancies, priorities |
| 7 | [07-upstream-sync-2026-10.md](07-upstream-sync-2026-10.md) | decolua/9router sync gap: 1–13 Oct 2026 issues/PRs scored vs Zen (port backlog) |

Existing in-repo docs that remain authoritative and were **not** duplicated here:

- [../ARCHITECTURE.md](../ARCHITECTURE.md) — system architecture, mermaid diagrams, env matrix
- [../../open-sse/AGENTS.md](../../open-sse/AGENTS.md) — engine conventions, "how to add a provider/model/executor/translator"
- [../../CLAUDE.md](../../CLAUDE.md) — agent working instructions, commands, gotchas

## 60-second orientation

ZenRouter is **one repo shipping two artifacts**:

1. **Dashboard + gateway** — root `package.json` (`zenrouter-app`), a Next.js 16 app.
   It serves the dashboard at `/dashboard` and the compatibility API at `/v1/*`.
2. **CLI launcher** — `cli/`, published to npm as `@joyccn/zenrouter` with binary
   `zenrouter`. It installs/starts the server and manages a system tray. Separate
   `package.json` and publish flow; release guards require all four package/lock versions to agree.

A third, non-published package sits in `tests/` (an independent ESM package with its own
`node_modules` and vitest config).

```
client (Claude Code / Codex CLI / OpenAI SDK)
   │  POST /v1/chat/completions
   ▼
next.config.mjs rewrite  →  /api/v1/chat/completions
   ▼
src/app/api/v1/.../route.js
   ▼
src/sse/handlers/chat.js         ← combo expansion + account-selection loop
   ▼
open-sse/handlers/chatCore.js    ← detect source format → translate → dispatch → retry/refresh
    ├── open-sse/rtk/             ← fail-open final-provider-body compression
   ├── open-sse/translator/      ← client format ↔ provider format (OpenAI-pivoted, or direct route)
   └── open-sse/executors/*      ← per-provider upstream call (default.js = generic OpenAI-compatible)
   ▼
SSE back to client, usage extracted and persisted
```

## Scale (measured, not estimated)

| Area | Size |
|---|---|
| `src/` | 525 files (521 JS) — Next.js app, dashboard, APIs, DB layer |
| `open-sse/` | 405 files (392 JS) — routing/translation engine |
| `tests/` | 524 files — **498** `*.test.js` files, ~4,091 passing tests at 0.9.7 |
| `cli/` | 35 files (~6,354 LOC of JS) |
| Provider registry | **122** files on disk, **119** active entries (3 hidden/commented: trae, windsurf, devin-cli) |
| Executors | **26** specialized + `DefaultExecutor` fallback for everything else |
| Translators | 12 request + 10 response modules, self-registering |
| Largest source files | `open-sse/providers/metadata/vendorModels.js` (3,064), `coreModels.js` (2,130), `src/app/(dashboard)/dashboard/providers/[id]/page.js` (1,964) |

## Environment caveat (important)

At audit time **neither `node_modules/` nor `tests/node_modules/` was installed**. Nothing
in this audit was validated by running the test suite or the build — all findings are from
static reading. Before trusting any behavioral claim here, install deps and run the suite:

```bash
npm install
cd tests && npm install && cd ..
npx vitest run --config tests/vitest.config.js     # see tests/README notes in CLAUDE.md
```
