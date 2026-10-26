# Changelog

## Kitsune Router 1.0.0 — proposed, pending verification/publication

**Your models. Your routes.** Maintained and sponsored by [ByKitsune](https://bykitsune.com), with no required account or provider order. Targets: `ByKitsune/kitsune-router`, npm `@bykitsune/router`, executable `kitsune-router`, provider key `kitsunerouter`, canonical image `ghcr.io/bykitsune/kitsune-router`.

Stop old writers and back up all state before migration. Default startup can verify/copy `~/.zenrouter` or `~/.9router` to `~/.kitsune-router`, preserving originals and refusing existing destination overwrite. Explicit `DATA_DIR` stays authoritative. Preserve secrets, auth, crypto derivation inputs and trusted certificates. Project settings become `KITSUNE_ROUTER_*`, extension headers `x-kitsune-router-*`; standard `/v1/*` and port 20128 stay stable.

Namespace registration/ownership, npm authorization, registry access, final SHA-bound tests/builds and actual publication remain pending. [Release draft](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.0.md) · [Technical changelog](https://github.com/ByKitsune/kitsune-router/blob/master/docs/CHANGELOG_v1.0.0.md) · [Migration](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).

> **Archive boundary:** entries below preserve the original ZenRouter names, artifacts, URLs and dated test claims. They are not retroactive Kitsune 0.x publications or verification of the renamed source. Use [current installation](/en/getting-started/installation/), not archived upgrade commands. The preceding Unreleased source work was recorded before the rebrand proposal.

## Unreleased — October reconciliation

- Fix recursive calls between Next.js's fetch wrapper and the gateway transport, restoring chat, OAuth refresh, usage and catalog requests without changing account/proxy policy.
- Check installed direct dependencies against committed lockfiles before source builds/tests. Reinstall with `npm ci` rather than packaging stale Next.js/Undici dependencies. Published 0.9.13 artifacts remain unchanged.

[Transport recovery and reproducible source builds](https://github.com/ZenRouter/ZenRouter/blob/master/docs/audit/20-fetch-transport-recovery-2026-10.md)

- Reject unsupported Codex/Antigravity-Claude PDF input before dispatch; preserve typed Gemini documents and ordinary JSON tool results rather than silently dropping data.
- Standardize inference errors and retry metadata without exposing secrets or turning quoted validation input into account quota locks. Preserve missing-model and retirement statuses separately.
- Echo requested model IDs consistently, keep endpoint-owned JSON/SSE framing and measured usage, and preserve readable upstream reasoning summaries. Explicit thinking/output budgets remain unchanged; unsupported controls and unrepresentable structured output fail locally.
- Filter rejected built-in routes and private build/evidence metadata from discovery. Keep unknown input ceilings and subscription costs honest; API USD references are not Codex credit invoices.

- Refresh verified stable upstream client identities and model catalogs; audit exact provider prices and native media billing units. Native time-of-use and published replacement rates use recorded usage time before operator overrides.
- Make every registered model's effective or unknown price discoverable, with provider/model search that preserves edits. Account plans, client surfaces and subscription credits remain separate from API invoices.
- Correct exact TokenHarbor free-route estimates and provider-scoped delivered-speed tariffs; preserve separate native cache-write lifetimes, unknown charges and explicit operator overrides.
- Show known subtotals and unpriced request counts without replacing unknown totals or repricing recorded history.
- Reconcile authorization, private persistence, cancellation/proxy policy, inference limits and truthful failure metrics; selectively adapt verified October upstream protocol and CLI fixes.
- Align source-verification and publication guards. These changes are not included retroactively in immutable 0.9.13 artifacts and do not establish live-provider availability or invoice parity.

[Scope, sources and verification limits](https://github.com/ZenRouter/ZenRouter/blob/master/docs/audit/17-october-reconciliation-2026-10.md)

## 0.9.13: 2026-10-19

- Fix false thinking-budget errors in Antigravity Claude model tests; persist provider thinking defaults without changing real clients' output caps.
- Add independent OpenAI/Codex Auto, Standard, Fast and Ultrafast controls with native `service_tier` requests and correct Responses routing.
- Preserve uploaded files and tool attachments; skip only known-ineligible accounts without health penalties or lowering the selected tier.
- Guard saved selections and model-test results against stale asynchronous updates. Keep requested/actual tiers and unknown premium costs distinct.
- Implementation verification: 6,248 ordinary tests passed on Node 22/24, plus 3 expected failures and 100 optional skips. Synthetic tests do not prove live entitlement, throughput or billing; faster tiers can cost more.

[Release notes](https://github.com/ZenRouter/ZenRouter/blob/v0.9.13/releases/RELEASE_NOTES_v0.9.13.md) · [Technical changelog](https://github.com/ZenRouter/ZenRouter/blob/v0.9.13/docs/CHANGELOG_v0.9.13.md)

## 0.9.12: 2026-10-19

- Preserve typed tool screenshots and thinking choices across native and translated requests, including Ollama and CommandCode.
- Keep OpenCode JSONC settings intact; refresh authentication, model and quota caches after database imports.
- Remove the node-forge dependency chain, harden proxy/DNS boundaries, and stop retries on cancellation.
- Include Antigravity Argon CLI/quota support and reviewed model pricing/lifecycle corrections without inventing context or output limits.
- Implementation verification: 6,052 passing tests on Node 22/24, 100 optional cases skipped, zero failures; four lockfile audits report zero advisories. This does not prove live-provider access or guarantee security.

[Release notes](https://github.com/ZenRouter/ZenRouter/blob/v0.9.12/releases/RELEASE_NOTES_v0.9.12.md) · [Technical changelog](https://github.com/ZenRouter/ZenRouter/blob/v0.9.12/docs/CHANGELOG_v0.9.12.md)

## 0.9.11: 2026-10-17

This release repairs multi-turn vision, reasoning controls, native failures and cache-aware cost estimates in the customized ZenRouter gateway.

- Keep recognized images typed through tool results, compacted history, compression and cross-provider conversion instead of serializing base64 into text.
- Preserve thinking settings, tool IDs, signatures and SSE/JSON failures. Unsupported native controls fail explicitly; invalid requests do not cool down healthy accounts.
- Reconcile exact provider/model metadata against the October 17 models.dev snapshot. Keep context, input and output independent; preserve unknown charges and explicit free zeroes.
- Save only edited pricing overrides. Gemini 2.5 Pro and Flash-Lite remain listed for eligible existing projects: the older global-retirement conclusion was incorrect.

**Security warning:** [node-forge GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) remains unresolved in the app and CLI; GitHub lists no patched release. Protocol tests do not establish live account entitlement or invoices.

[Release notes](https://github.com/ZenRouter/ZenRouter/blob/v0.9.11/releases/RELEASE_NOTES_v0.9.11.md) · [Technical changelog](https://github.com/ZenRouter/ZenRouter/blob/v0.9.11/docs/CHANGELOG_v0.9.11.md)

## 0.9.10 — 2026-10-16

Patch release for changes made while re-verifying the audit findings against the code, after 0.9.9 was published. npm versions are immutable, so these were in no released version until now. No breaking API change; two database columns are added automatically on first boot.

### Fixed

**Retired models are no longer advertised.** `gemini-2.5-pro` and `gemini-2.5-flash-lite` both answer 404 *"is no longer available to new users"* — reproduced 5/5 and 2/2, and corroborated by 30 days of production logs. Both were listed and looked callable. They are now hidden while the ids stay in the registry, so a stored combo resolves into a clear failure instead of a 404.

**Fifteen `deprecated` models were still being offered.** The flag existed and was documented, but was consumed only by the dashboard UI — no filter existed on the API path. Reproduced with one active deepseek connection: two retired compatibility aliases were listed. Now filtered, with an important distinction: a **provider-level** `deprecated: true` is a ToS risk notice for claude/codex/antigravity/… and must not hide that provider's models.

**Gemini context windows were withheld, not unknown.** Eleven records declared the window unverified, which nulled it; since `/v1/models` only emits `context_length` when finite, **17 of 334 models** reached clients with no window at all. models.dev's official entries publish 1,048,576 for these ids and the routes are served, so removing the number was the worst option. Now **12** models lack a window, each genuinely unservable or genuinely unverified.

**Two silent-data-loss translation bugs.** `openai-to-cursor` overwrote the client's `max_tokens` with a hardcoded 32000 — a client asking for 200 received 32000; the constant is now a floor, not an override. `openai-to-commandcode` turned malformed tool arguments into `{}` with no signal, so the model received a tool call with no parameters and nothing indicated the loss.

### Added

**TTFT is finally measurable.** The streaming handler computed time-to-first-token and printed it, but never stored it — which is why the audit had to parse 304 log lines to report a 5,471 ms median. It is now persisted as nullable columns (written as NULL, never 0, so unmeasured requests do not drag the median down) and exposed as `zenrouter_ttft_ms{quantile=...}` on `/api/metrics`.

### Note

Three findings in this release came from re-checking an earlier conclusion rather than trusting it: the audit reported **3** models with a null `context_length` and the real count was **17**; `gemini-3.5-flash-lite` appeared alongside genuinely retired models but returns **HTTP 200** (an earlier 429 was quota); and 250,000 turned out to be the *Antigravity bridge* cap for `claude-sonnet-4-6`, not the Anthropic API window, which is 1,000,000.

## 0.9.9 — 2026-10-15

> **Upgrading from 0.9.7? This release also contains 0.9.8.** The 0.9.8 batch was prepared on 2026-10-13 but not published then; it was **backfilled on 2026-10-16** as its own release, with `latest` left on 0.9.9 in every registry. 0.9.9 is 45 commits between `v0.9.7` and `v0.9.9`, so it contains everything 0.9.8 has — the critical dependency-advisory removal and Tier-1 upstream ports — plus everything below. **Prefer 0.9.9:** 0.9.8 has none of the audit fixes below.

Answers an external audit (11 prompt documents) plus a full catalog verification against [models.dev](https://models.dev). Every finding was reproduced against the running gateway before being changed, and each fix ships with a regression test. Requires **Node.js >=22.19.0**. The package remains `@joyccn/zenrouter`, with binary `zenrouter`. No breaking API change.

### Security

**A client can no longer drain every provider.** The `apiKeys` table had no quota column at all and `validateApiKey()` returned a plain boolean, so nothing bounded what a *client* consumed — the only limits were the dashboard login limiter and the upstream account cooldowns. `/v1` now has per-key rate limiting (600 RPM, 120/s burst, `V1_RATE_LIMIT_RPM`/`V1_RATE_LIMIT_BURST`), with hashed bucket keys, a bounded counter table, and `Retry-After` plus `x-ratelimit-*` on 429. Defaults came from measured traffic (peak ~246 req/min → ~30x headroom).

**Internal routing detail stopped leaking.** Production returned `"No active credentials for provider: openai"`, naming the upstream provider. The same phrasing existed in the image, video, search, tts, stt, embeddings, fetch and Gemini-native handlers. Clients now get a neutral message; machine-readable diagnostics Zen itself produces (`output_budget_exhausted` and friends) are still forwarded.

**Account emails left the logs.** Journald carried 589 lines with 27 unique addresses, because `connectionName` resolves to `displayName || name || email || id`. Identities are now a salted short hash — greppable and distinguishable, not reversible.

**Revoked tokens are permanent, not transient.** `token_revoked` matched no rule and fell through to the generic 401 cooldown, so a dead account was retried every 2 minutes — 31 events across 8h in production, one account retried 16 times. Now a 1h cooldown plus a `needs_reauth` status. The refresh attempt is deliberately kept: unlike an org-policy denial, a revoked token may still be recoverable.

**Baseline security headers and an explicit CORS allowlist.** The gateway is published through a Cloudflare tunnel (`zen.hlcyn.xyz` → `127.0.0.1:20128`), so this is not cosmetic.

### Fixed

**Self-update works again.** The code queried npm for the bare name `zenrouter`, which is unclaimed (404), so `/api/version` always reported `latestVersion: null` and the updater's install command would have failed. The scoped `@joyccn/zenrouter` is now a single shared constant used by the version route, the updater and the landing page.

### Routing and errors

**Context overflow stops reporting itself as 502.** An over-long prompt arrived as `context_length_exceeded` inside a 200-OK SSE stream and was converted to 503 → 502. ByKitsune retries 502, so a prompt that could never succeed was retried while every healthy account was locked for 30s in turn. It is now a 400 with `invalid_request_error`, without rotating accounts.

**Context windows were under-reported by up to 778k tokens.** `/v1/models` published the Codex CLI ceiling (872,000; 272,000 for GPT-5.6) as `context_length`. Measured live: 402,486 tokens accepted for a model advertised at 272,000, and 902,486 for one advertised at 872,000, with the real ceiling at 922,000. GPT-6/GPT-5.6 now report the API specification (1,050,000 / 922,000 / 128,000); CLI ceilings stay under `limits.cliDefaultContext`/`cliMaxContext`.

**A mid-stream failure now marks the account.** Previously an account that failed after the 200 header stayed in rotation, so every request returned 200 with truncated content and no failover — an outage invisible to status-based monitoring. A client disconnect cannot reach that path.

**Provider `Retry-After` was dead code.** `checkFallbackError` accepted a `Response` to read the header, but no caller passed it, so a provider answering `Retry-After: 3600` was retried after seconds.

**Unexpected exceptions were logged.** A bare `catch {}` returned a generic 500 with a `serverRequestId` that appeared nowhere in the logs. The error name, message and stack are now logged with that id. Prompt and response content never are.

### Translation

`top_p`, `stop`/`stop_sequences`, `seed` and `metadata.user_id` were dropped on several hops, so a client setting `stop: ["</end>"]` received untruncated output whenever the gateway routed to Claude. A failed tool result was signalled through a non-standard `is_error` field that OpenAI tool messages do not have, so the receiving model could conclude the tool succeeded; it is now an in-content `[tool_error]` marker.

### Catalog

Five windows corrected against models.dev's official vendor entries: `gpt-4.1*` (1,000,000 → 1,047,576), `command-a-translate-08-2025` (128,000 → 8,000, a 16x over-promise), `ministral-3b/8b/14b` (128,000 → 131,072/262,144), `codestral-latest` (128,000 → 256,000). A naive comparison reported 206 differences; excluding unit conventions (256000 vs 262144) and route-scoped bridge caps left 5 real ones. Four Codex routes the ChatGPT account rejects (`gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex-spark`) now carry `routeAvailable: false` with a machine-readable reason.

### New endpoints

`GET /api/health` is now a real probe — a database read, **503** when storage is unreachable, plus uptime, version, locked-account and needs-reauth counts. `GET /api/metrics` serves Prometheus text (models in use, failures per status, in-flight requests), token-gated and strictly aggregate.

### Verification and limits

Isolated suite: **1,436 files, 4,525 cases — 4,424 passed, 0 failed**; `npx eslint .` clean. Registry baselines byte-for-byte equal. Runtime-verified on an isolated `DATA_DIR`: health JSON, security headers, CORS allowlist, 429 with `Retry-After`, and metrics returning 401 unauthenticated. Catalog work is metadata: it does not establish entitlement or live availability, and 448 rows have no models.dev reference. Not vulnerability-free — the `node-forge` advisory still has no upstream fix and its affected path remains unreachable, asserted by a test.

## 0.9.8 — 2026-10-13

Clears the critical dependency advisory and lands the Tier-1 batch from the 9router upstream sync analysis. Twenty changes, each committed and tested separately. Requires **Node.js >=22.19.0**. The package remains `@joyccn/zenrouter`, with binary `zenrouter`. No breaking API change.

### Security

**Critical cleared:** `proxy-addr` (GHSA-jqcg-44mw-7w3h, IP spoofing via an IPv4-mapped IPv6 trust subnet) entered only through `express`, which was declared in `dependencies` but imported nowhere in the repository. The dependency was removed rather than pinned around; the lockfile loses 40 transitive packages. `marked` (its consumer was deleted when changelog rendering moved to `react-markdown`) and `selfsigned` (test-only, now a devDependency) went with it.

**Not vulnerability-free, and not claimed to be.** `node-forge` GHSA-86w9-cpqp-85rv (high) has no patched release upstream (1.4.0 is newest). Its only production consumer parses, generates, signs and serializes certificates but never calls a signature verifier, so the affected RSA PKCS#1 v1.5 verification path is unreachable here — now asserted by a test rather than left as a comment. A dev-graph `braces` advisory remains and does not ship in the production install. A new dependency-hygiene test keeps all of this from regressing.

### Usage and accounting

Streaming OpenAI-compatible chat calls request `include_usage`, so cache hits bill at the cache rate instead of a character-count estimate. Codex image requests report their real tokens into usage history. Effort-annotated model ids price at the base model rate instead of `$0`.

### Routing and fallback

A 400 meaning "out of credits" advances to the next combo member instead of failing the request; an ordinary bad request still stops it. Chat endpoints honor `x-connection-id` account pinning with automatic fallback, matched only inside the resolved provider's own active accounts. The model picker no longer offers providers whose connections are all disabled, nor registry-hidden no-auth entries.

### Translation and protocol

Strict tool declarations survive translation in both directions. Chat `response_format` maps to Responses `text.format`, and the Responses-only `text` field is stripped on the way back with its JSON-mode intent carried over as `response_format`. CommandCode output is clamped to its real 200k schema limit. The GitHub Responses route strips parameters that endpoint rejects.

### Catalog

Antigravity Claude Sonnet 5.5 / Opus 5.5, CodeBuddy CN `kimi-k2.8-preview` and `deepseek-v4.1-flash` (with `maxOutput` corrections and a thinking-level glob fix), LongCat 2.5, the MITM map aligned to the 3.8 generation, and ParalonCloud as a new OpenAI-compatible provider. Catalog entries are declarations: they do not establish account entitlement or live availability.

### Verification

Isolated suite: **1,386 files, 4,335 cases — 4,234 passed, 100 skipped, 1 todo, 0 failed** on Node 24.19.0; zero-warning lint. Registry baselines byte-for-byte equal. Production build and a standalone smoke run on an isolated `DATA_DIR` pass; no production account or billable inference was used.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.8) · [Complete changelog](https://github.com/ZenRouter/ZenRouter/blob/master/CHANGELOG.md) · [Technical details](https://github.com/ZenRouter/ZenRouter/blob/master/docs/CHANGELOG_v0.9.8.md) · [Release notes](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.8.md) · [Previous release 0.9.7 (historical)](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.7.md)

---

## 0.9.7 — 2026-10-06

This release collects the previously merged maintenance batch; the version bump adds no separate product feature. Requires **Node.js >=22.19.0**. The package remains `@joyccn/zenrouter`, with binary `zenrouter`.

### Catalog and client identities

Add **120 provider/model entries** (100 chat, 8 image, 6 embedding, 6 TTS) and **342 sourced metadata records**; **827 historical entries remain not individually verified**. Keep API versus IDE/OAuth/coding-plan limits, prices and unknowns separate. Repair provider/pricing aliases, model transport, no-auth discovery, cross-kind IDs, live/operator capabilities, separate input/context/output limits and long-context/custom pricing. Non-token prices are not token tariffs; unknown prices are not free. Reconcile researched client pins and endpoint-specific Gemini/Copilot headers without granting beta entitlements.

### Reasoning and usage

Preserve explicit/nullable output caps and native thinking through final serialization; do not silently increase a paid cap. Keep Responses reasoning fields and effective Claude interleaving support, including rejected-beta retries. Account exhausted attempts, fold Gemini thoughts once, retain incomplete terminals/partial output/refusals, prevent terminal-then-cancel double persistence and false empty-combo replay. No automatic larger-budget retry is added. Codex OAuth, OpenCode Muse and Cursor still do not enforce the public API cap; a token cap is not a total monetary budget.

### Grounded search

Bare provider names and `provider/search` select defaults, not upstream model names. Validate explicit/combo ownership before dispatch. Antigravity uses its dedicated sandbox, real project/request/session IDs, model/thinking mapping, Google Search and per-account strict proxy. Exclude `thought: true` from answers and citation context. The specific Gemini model 404 uses one account attempt; the exact ambiguous Antigravity resource 404 uses at most **three**, without healthy-account cooldowns. Success clears only the matching search scope; other auth/quota fallback remains.

### Dependencies, installer and interface

Refresh React **19.3.0**, ESLint **10.12.0**, Vitest **5.0.3**/Vite **8.3.2** and Undici **8.11.2**. Preserve Node 22 dispatchers, CONNECT, DNS pinning, cancellation and fail-closed proxy policy; remove unused dependencies. The installer verifies the exact runtime minimum and freshly linked CLI. Bundle Monaco **0.57.0** and same-origin workers, fix docs markdown/language switching and React warnings without losing drafts/hydration safety. Narrow ESM boundaries leave CommonJS launchers unchanged; optional SQLite fallback stays available.

### Release publication

Manual npm/Docker workflows require the actual stable tag and exact source commit; npm provenance also matches the dispatch ref/SHA. Persisted original tarballs are recovered with registry SHA512 verification. Global serialization and numeric version checks stop older retries from replacing newer `latest`; missing recovery artifacts fail closed.

### Verification, security and upgrade limits

Prior verification includes isolated tests, zero-warning lint, app/CLI builds, docs export, browser checks and real loopback/standalone SQLite search/usage acceptance. Final local release verification: **494 test files, 4,091 passed, 100 skipped, 1 todo, zero failures** on Node 22.23.2; zero-error/zero-warning lint, CLI packaging and Docker smoke checks pass. No production accounts, live provider inference, new spending retries or automatic deployment were used. Catalog research **does not establish account entitlement or live availability**.

TLS verification remains enabled; self-signed fixture exceptions are per-request, not global. **node-forge and braces advisories remain**: this is not a vulnerability-free release. After publication, install `@joyccn/zenrouter@0.9.7` or use the pinned `joyccn/zenrouter:0.9.7` image. Container publication targets **linux/amd64 only**; persist **/app/data** and back it up before upgrading. Documentation does not certify publication or tag availability.

---

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.7) · [Complete changelog](https://github.com/ZenRouter/ZenRouter/blob/master/CHANGELOG.md) · [Technical details](https://github.com/ZenRouter/ZenRouter/blob/master/docs/CHANGELOG_v0.9.7.md) · [Release notes](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.7.md) · [Previous release 0.9.6 (historical)](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.6.md)
