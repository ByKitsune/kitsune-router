# ZenRouter 0.9.8 technical changelog

> **Kitsune Router archive:** this dated ZenRouter record keeps its original names, artifacts and evidence; it is not current installation or verification guidance. See [current docs](INSTALLATION.md) and [migration](MIGRATION.md).

Release date: **2026-10-13** · Previous release: **0.9.7**.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.8) · [Complete changelog](../CHANGELOG.md) · [Release notes](../releases/RELEASE_NOTES_v0.9.8.md)

This release has two parts: the dependency-advisory remediation that made it a release
candidate, and the Tier-1 port batch from the 9router upstream sync analysis
([`docs/audit/07-upstream-sync-2026-10.md`](07-upstream-sync-2026-10.md)). Historical
[0.9.7 documentation](CHANGELOG_v0.9.7.md) remains unchanged.

## Dependency security

- **Critical cleared — GHSA-jqcg-44mw-7w3h (`proxy-addr`)**. The advisory describes IP
  spoofing through an IPv4-mapped IPv6 trust subnet, which matters for any component that
  derives a client IP from `X-Forwarded-For`. `proxy-addr` was reachable only through
  `express`, which was declared in `dependencies` but imported nowhere in the repository —
  verified by an exhaustive search for `require("express")` / `from "express"` across all
  source trees. The fix is removal, not a version pin: a declared-but-unused production
  dependency is deleted. Production audit goes from 2 advisories (1 critical + 1 high) to
  1 high; the lockfile drops 40 transitive packages (`express`'s entire tree, including
  `body-parser`, `qs`, `send`, `serve-static`, `router`, `type-is`, `raw-body`).
- **Orphaned `marked` removed.** Added for `ChangelogModal`, which was deleted in
  `d7028eda` when changelog rendering moved to `react-markdown`. No importer remained; its
  `optimizePackageImports` entry in `next.config.mjs` was removed with it.
- **`selfsigned` moved to `devDependencies`.** Its only consumer is the SAML test fixture
  (`tests/auth/saml.test.js`), so it must not appear in the production install graph. Note
  that `selfsigned@5.5.0` no longer depends on `node-forge` at all (it uses
  `@peculiar/x509` + `pkijs`).
- **Remaining — GHSA-86w9-cpqp-85rv (`node-forge`, high), no upstream patch.** `1.4.0` is
  the newest published version, so there is nothing to upgrade to. Reachability was
  re-verified: the advisory affects RSA PKCS#1 v1.5 **signature verification**, and the
  only production consumer is `src/mitm/cert/rootCA.js`, which parses PEM, generates key
  pairs, creates and signs certificates and serializes them back — it never calls
  `verify()`. The dev-graph `braces` advisory (via `eslint-config-next`) does not ship in
  the production install. Both remain documented rather than suppressed; the finding is
  not claimed as fixed.
- **New regression gate** — `tests/unit/dependency-hygiene.test.js`: no phantom production
  dependency (one documented intentional pin, `react-is`, which the stable dependency
  contract pins to the exact React version), `express`/`proxy-addr` cannot return, no
  `node-forge` consumer may call a signature verifier, and the unpatchable advisory must
  stay documented in the changelog. The test is dependency-free and offline.

## Upstream sync — ported fixes

Each item below is a separate commit with its own tests, ported from the verified Tier-1
list; two report rows were re-scoped after reading the actual upstream diffs.

**Pricing and usage accounting**

- `matchPattern` memoizes compiled glob regexes on the function itself (module-scope state
  is a TDZ hazard in bundled chunks). `getPricingForModel` walks the whole pattern table per
  lookup, so this was one compilation per pattern per resolution — ~32x slower than the
  cached form. A whole-table equivalence test pins identical semantics.
- `getPricingForModel` (repo layer) strips a trailing effort annotation before resolving, so
  usage rows keyed `gpt-6.1-sol(xhigh)` price at the base model rate instead of `$0` or a
  cheaper family glob. A user override on the exact annotated id still wins.
- Codex image generation now reports its exact token usage: `parseStream` captures usage
  from `response.completed`/`response.done`, the core threads an `onUsage` callback, and the
  image handler persists it through `saveRequestUsage` with account/API-key/endpoint
  attribution. Absent or non-integer counts are never fabricated into `0/0` rows.

**Routing and fallback**

- Streaming OpenAI-compatible chat calls request `stream_options.include_usage`, so gateways
  that omit the usage trailer no longer force the chars/4 estimate (which inflated
  `prompt_tokens` and dropped `cached_tokens`, billing cache hits at the full input rate).
  The injection is gated to streaming + chat api-type + `messages[]` + no caller-supplied
  `stream_options`; executors that reject the field delete it themselves.
- A 400 carrying credit-exhaustion text now falls through to the next combo member instead
  of stopping the request, while an ordinary bad request still stops it.
- The chat endpoints honor `x-connection-id` account pinning, matching the image/video
  endpoints. The pin is applied at the account-selection layer, so single-model, combo,
  fusion and capacity-adapter paths inherit it; an unknown, disabled or exhausted id falls
  back to the normal strategy. Security: the id is only matched inside the resolved
  provider's own active selectable set, so a header cannot select a cross-provider account.

**Translation and protocol**

- Explicit `strict` tool declarations survive the claude→openai translator and the Codex
  tool flattener; omitted strict stays omitted.
- Chat `response_format` maps to the Responses `text.format` on the Chat→Responses hop
  (the Codex allowlist strips `response_format` but keeps `text`).
- The Responses-only `text` field is stripped on the Responses→Chat hop, and its
  structured-output intent is carried over as `response_format`, so the round trip
  preserves the requested JSON mode while strict chat backends stop rejecting the body.
- CommandCode output caps are clamped to the upstream 200k schema limit in the translator
  and defensively in the executor; the constant lives in `runtimeConfig.js`.
- GitHub Copilot's `/responses` route runs the unsupported-parameter filter, and the
  GitHub temperature rule is widened to the real unsupported range with exact version
  boundaries.

**Catalog and provider metadata**

- CodeBuddy CN catalog resynced to the 2026-09-30 server config: `kimi-k2.8-preview` and
  `deepseek-v4.1-flash` added, `maxOutput` corrections applied, thinking-level glob
  shadowing fixed. Models dropped from the server list are marked `deprecated` (Zen
  convention) so stored combos still resolve.
- Antigravity gains Claude Sonnet 5.5 / Opus 5.5 (registry, capabilities, pricing, quota
  model list, MITM aliases and patterns), plus the `minimal` → `low` effort mapping the
  Anthropic wire requires.
- LongCat 2.5 gets a capability pattern (reasoning + ~650k context) instead of falling to
  the default floor.
- The MITM synonym map follows the catalog to the 3.8 generation (`gemini-default` →
  `gemini-3.8-flash-medium`).
- ParalonCloud is registered as an OpenAI-compatible API-key provider with chat and
  embedding entries; the generic executor serves it, so no executor file was added.
- The model picker stops offering providers the router would refuse: connections with
  `isActive === false` are filtered out and registry-hidden no-auth providers are excluded.
  An errored-but-enabled connection stays selectable, because the router retries and
  refreshes tokens before dispatch.

## Verification

- Isolated Vitest suite on Node 24.19.0: **1,386 files, 4,335 cases — 4,234 passed,
  100 skipped, 1 todo, 0 failed**.
- `npx eslint .` completes with zero errors and zero warnings.
- Registry baselines are byte-for-byte equal after the catalog work: 82 providers,
  117 alias tokens, unchanged OAuth URLs. `verify-no-regression.mjs` reports no regression.
- `next build --webpack` succeeds after the dependency removals, and a standalone smoke run
  on an isolated `DATA_DIR` (loopback-only port, model-catalog sync and MITM disabled)
  serves `/login` 200 and `/v1/models` 200 with the SQLite driver migrated. No production
  account, live provider inference or billable request was used.
- `node scripts/check-release-version.mjs v0.9.8` passes: app, CLI, tests and docs
  manifests and lockfiles are all 0.9.8.

## Upgrade notes

- No configuration change is required; no API shape changed.
- `npm install -g @joyccn/zenrouter@0.9.8`, or `npx @joyccn/zenrouter@0.9.8` after
  publication. Node.js >=22.19.0 remains required.
- If you deploy from a lockfile with `npm ci --omit=dev`, the install graph is smaller by
  41 packages; nothing referenced them.
- Catalog additions are declarations. They do not establish account entitlement, upstream
  availability or live-verified limits.
