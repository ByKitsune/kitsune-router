# ZenRouter — Audit & Knowledge Map

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
   `package.json`, separate version line, separate publish flow.

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
   ├── open-sse/rtk/             ← fail-open pre-translate body compression
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
