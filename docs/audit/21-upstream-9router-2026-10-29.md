# 9Router upstream review — 2026-10-29

This is a source review, not a deployment or a claim that the production
service contains these changes. Upstream `master` was fetched without tags at
`1fe586bb` (9Router v0.5.112, 2026-10-28). Kitsune and 9Router have diverged;
408 upstream commits were absent from Kitsune's ancestry at the start of this
review. That count does not mean 408 behaviors are missing. The table covers
the newest 2026-10-28 commits, not the entire divergent history. Its dispositions
describe the initial review; the dated follow-up below records subsequent source
work without rewriting that history.

## Newest commits

| Upstream | Disposition |
| --- | --- |
| `1fe586bb` v0.5.112 | Release marker only; do not replace Kitsune's version or branding. |
| `85d73bd6` MiniMax desktop lease | Not ported: new OS-specific broker/auth feature; needs a separate compatibility and security review. |
| `d7bb71ce` DeepSeek PoW | Not ported: the affected PoW module is absent from this checkout. The direct DeepSeek API is a different path. |
| `3b7acf72` Docker lazy dependencies | Not ported: Kitsune has no upstream `lazyRuntime.js`; its OpenCode transport and packaging differ. Assess together with the OpenCode changes below. |
| `56dbf466` non-stream SSE errors | Kitsune already classifies response errors and accounts for incurred usage. Added coverage and numeric-string HTTP status handling in `21a5148f`; do not replace the usage accounting with upstream's earlier return. |
| `8db1f4ae` Gemini schema predicates | Adapted in `f84c5eff` using Kitsune's schema-map-aware traversal. The existing lossy union/placeholder compatibility behavior is not strict JSON Schema enforcement. |
| `f7f6f5ed` Nace Drex | Not ported: new provider/feature, not a confirmed fix for an existing Kitsune provider. |
| `ced0cf6e` NVIDIA reasoning aliases | Kitsune already normalizes readable Chat aliases and rejects contradictory values instead of silently discarding one; the two behaviors are intentionally not identical. |
| `a199d777` opaque LLM tokens | Adapted in `fcc4ccb4`; two-part named keys and Cloudflare syntax remain supported. |
| `b1effa03` CommandCode CLI headers | Not ported yet: request/session handling differs and must be reconciled with Kitsune's serializer and existing transport contracts. |
| `f3e1f716` Copilot Claude 5.5 | Partially adapted in `4cba07ec`: GitHub Haiku 5.5 uses adaptive thinking and dotted Opus 5.5 avoids rejected forced choices. Sonnet's `between_tools` and explicit display were already covered. The other provider routes have not been fully compared or probed live. |
| `3fd925ab` CodeBuddy channel headers | Adapted in `8949ca17` for both existing CodeBuddy executors. No live account was used. |
| `acb3c080` GPT-6.1 Terra | Not ported yet: new Codex model and pricing need route-specific provenance and metadata validation; do not copy a global price/limit blindly. |
| `e70ea24d` OpenCode lazy runtime | Not ported: the affected module is absent. New upstream OpenCode TLS/fingerprint changes are a candidate for a separate end-to-end compatibility review. |

Also reviewed selected 2026-10-26 fixes: the Claude tool-image and Headroom
document-preservation paths already have Kitsune implementations and tests.
`2924e055` exposed one missing legacy DeepSeek V4.1 Flash identifier; it is now
an alias to the canonical `deepseek-flash` in `d7bc86f0`, scoped to DeepSeek.
Other 2026-10-26 and older commits have not all been reviewed or integrated.

## 2026-10-29 source follow-up

This follow-up covers the current worktree, including changes not yet committed.
Its source-level observations are not a release, deployment, live-account
acceptance or invoice verification.

- **CommandCode:** adapt the upstream `b1effa03` CLI 1.88.0 header identity.
  Keep the outbound project slug and session header aligned with the body.
  Translated requests receive a fresh thread ID, retained for retries rather than
  shared across unrelated requests; a native caller's thread ID is retained.
  Do not infer cross-turn continuity from an unscoped client identifier.
- **GPT-6.1 Terra:** the OpenAI registry uses Responses for tool-bearing requests
  and also routes other client formats through that transport. The public API
  model reference specifies 1,050,000 total context, 922,000 maximum input and
  128,000 maximum output tokens. The gateway records separate Standard, Fast and
  Flex reference prices, with the higher tier applying to the entire request
  only above 272,000 input tokens. The estimator does not automatically apply the
  documented 10% regional processing uplift. A Codex CLI catalog entry is not
  proof of account access, backend limits or a USD subscription invoice.
  Sources: [model reference](https://developers.openai.com/api/docs/models/gpt-6.1-terra.md),
  [pricing](https://developers.openai.com/api/docs/pricing.md),
  [regional processing](https://developers.openai.com/api/docs/guides/your-data.md),
  and Codex catalog commit `126a0ee92ed2c5e73cd8a8f7e37563e8527552d7`.
- **Google schema and context errors:** preserve valid legacy Google array bounds
  during conversion, reject invalid bounds without corrupting literal values, and
  normalize the specifically observed GitHub Copilot context-window error without
  treating it as an account quota failure. Existing non-strict schema boundaries
  and explicit combo/account fallback policies remain distinct.
- **Still deferred in this worktree:** the MiniMax desktop lease, OpenCode
  TLS/fingerprint integration and Nace Drex provider. These are specific new
  upstream features, not a statement that existing MiniMax or OpenCode providers
  are unsupported. An offline helper or catalog reference is not proof of native
  acceptance.
- **OpenCode Free restriction:** the current [OpenCode Console inference
  documentation](https://opencode.ai/v2/docs/console/api/inference/) states that
  free-tier chat models are available only from OpenCode itself; other clients
  receive HTTP 403 even with a key. The pre-existing Free executor identifies as
  OpenCode and includes decoy tools; its compliance with that restriction is not
  established. The experimental fingerprint port is not integrated. OpenCode Go
  and paid Console access have separate eligibility and billing terms.
- **Experimental accounting work not integrated:** a separate Codex streaming
  patch did not pass independent safety review. Synthetic cases exposed gaps in
  failure-trailer accounting, cancellation, retry boundaries and error redaction;
  a later candidate still failed a synchronous outbox-stall regression. An
  asynchronous timeout cannot bound synchronous database work or prove that a
  delayed acceptance did not occur. The patch must not be treated as a production
  fix. A separate Nace prototype
  propagated unknown token counters into mixed totals and altered some legacy
  nullable summaries, hiding otherwise known usage. It remains deferred pending an
  additive coverage design and compatibility tests. These synthetic findings do
  not establish either as the cause of the reported production display issue.
- **SenseNova and Runcrate candidates:** the separate provider candidates are not
  integrated in this worktree. Their combined redirect handling can repeat a
  potentially charged POST. Isolated SQLite tests also showed potentially charged
  SenseNova attempts with missing, incomplete or explicit zero usage omitted from
  durable request and unknown-cost coverage. Missing component counts can become
  inferred zeroes and yield a definite price. Honest uncertain-attempt accounting
  and its interaction with combo cancellation still require reconciliation. These
  are findings about isolated synthetic candidates, not confirmed production behavior.
- **Combo terminal decisions:** this worktree now preserves a no-retry header or
  known accounting-terminal code when availability normalization would otherwise
  replace the response. Synthetic tests cover cancellation and retryable fallbacks
  at the combo boundary and mocked public chat/image/TTS paths. Additional probes
  found possible loss of the header before the combo, account-level retries and
  missing caller-signal propagation in search/fetch; these separate paths are not
  fixed by this guard and need their own reconciliation and public-route tests.
  An isolated search/fetch cancellation candidate is not integrated: synthetic
  Antigravity and Kimi refreshes showed that aborting after a rotating grant was
  acquired could leave the previous grant stored. Safe cancellation requires a
  reviewed acquisition-to-commit handoff that preserves credential write fences.
  Provider/relay headers and error codes are not proof of a router-local accounting
  failure. A global upstream no-retry policy would change fallback behavior and
  must cover earlier executor and credential-refresh retries as well.
  A separate native Gemini TTS path now exposes a no-retry header on its existing
  locally generated HTTP 503 if error-usage acceptance fails; this does not change
  a stream whose HTTP headers have already been sent.
  A terminal chat error body can also stall client-boundary sanitization without
  caller abort. These findings are not proof of a particular production charge or
  of the reported Usage root cause.
- **OpenCode-reported amounts:** the current usage pipeline does not retain the
  documented provider-reported charge and Go allowance fields. Adding them needs
  trusted transport provenance, stream-finality and separate durable accounting;
  local token-price estimates and plan references are not a settled invoice.
- **Catalog estimate freshness:** the existing catalog sync refreshes capability
  data, not the price observations used by the 16 narrowly approved estimates.
  Those estimates expire at `2026-10-29T18:11:32.422Z`; there is no automatic
  pricing refresh. Extending a timestamp would not establish current rates. A
  safe refresh needs validated, versioned observations, including the applicable
  prior observation for in-flight requests, atomic cross-worker publication, and
  fail-closed handling of missing or changed rows. Saved operator overrides and
  already accepted usage remain separate.

## Open issue to verify

[9Router #5296](https://github.com/decolua/9router/issues/5296) reports Codex
Chat streaming being buffered until upstream EOF. `7769db72` adds an offline
test showing that Kitsune's Core emits a synthetic Codex text delta before the
synthetic upstream finishes. It does **not** exercise Next.js, the custom server,
the reverse proxy, or a live provider, and therefore does not establish whether
the deployed service is affected. Test those layers during planned maintenance.

## Validation and boundaries

These results belong to the initial review, not to every later worktree change:

- Selected packaging/branding tests: 20 passed; documentation tests: 16 passed.
- Bulk-add and CodeBuddy focused suites: 28 passed.
- Gemini schema and related translator suites: 226 passed.
- SSE error and transport suites: 66 passed.
- DeepSeek identity and model-contract suites: 82 passed.
- Copilot/Claude thinking and related capability suites: 133 passed, using
  synthetic responses rather than a live GitHub account.
- The offline Codex Core streaming regression passed; no real account was used.
- Targeted lint passed. A full build and complete repository test suite were not
  run. Changes have not been pushed, deployed, or activated by a service restart.
