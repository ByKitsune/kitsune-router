# Changelog

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
