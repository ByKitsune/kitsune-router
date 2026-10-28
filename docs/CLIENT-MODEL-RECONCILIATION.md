# Client and model catalog reconciliation

This is a dated source-reconciliation report retained by Kitsune Router. Catalog counts, sources and validation below describe their original snapshots, not fresh 1.0.2 verification or publication. See [current installation](INSTALLATION.md), [release status](CHANGELOG_v1.0.2.md) and [migration](MIGRATION.md).

Research date: 2026-10-06 (Asia/Jakarta). Source baseline: `ff469a0768a854ebe7d6d5936702c669c5cd91f5`.

## Scope and evidence

The baseline inventory contains 119 active provider definitions and 1,044 static provider/model rows. The resulting registry contains 1,164 rows: 120 additions (100 chat, 8 image, 6 embedding, 6 TTS), with no baseline rows removed. Reviewed factual metadata has 342 exact provider/model records across 36 providers. Some factual records describe compatibility variants rather than standalone registry rows.

`model-catalog-coverage.json` enumerates every current static row and explicitly marks rows not individually reverified. Enumeration is exhaustive; internet verification of every historical value is **not** complete. The 827 preserved, individually unverified rows are not certified accurate. Separate media research enumerated 70 providers and 288 provider/kind/ID definitions, including voice/language surrogates rather than only independent models.

The fetched models.dev catalog contains provider-scoped limits, modalities, costs and tier information. It is a comparison source, not proof that an IDE subscription or individual account can serve a model.[1]

Official endpoint-specific documentation takes precedence over a generic family record. API context, maximum input, maximum output, client configuration ceilings and compaction thresholds remain separate. No production database, authenticated provider account, live inference or deployment was used.

## Important context correction

GPT-6.1 Sol's OpenAI API specification is **1,050,000 total context**, **922,000 maximum input**, and **128,000 maximum output**.[2]

The official Codex `rust-v0.160.0` model catalog instead declares **272,000 default context** and **872,000 maximum configurable context** for this model. The protocol calls the latter the “Maximum context window allowed for config overrides”; it separately defines 95% effective context and a 90% automatic-compaction threshold.[3][4]

Consequently, Kitsune Router does not relabel the API limit as an independently proven Codex backend limit. The selected Codex configuration value remains separate from API maxima in `metadata.limits`; unverified route input/output maxima are `null` and omitted from top-level numeric limit fields. Account-supplied live metadata and explicit operator declarations can override the static reference without crossing provider boundaries.

## Client updates

- Claude Code: latest-channel non-prerelease `2.1.289` and inspected Stainless SDK `0.128.0`. The explicit stable tag is `2.1.285`; next-only `2.1.290` is not selected. Existing runtime assumptions and beta entitlement flags were not broadened.[13]
- Kiro CLI: `2.27.0`, including the previously stale connection-test User-Agent. The IDE version remains a separate identity.[15]
- Kimchi: `1.6.0`.[16]
- CodeBuddy CN CLI: `2.161.3`; the unverified INTL IDE-labelled wire profile remains separately pinned rather than pretending the CN CLI release verifies it.[14]
- Gemini CLI remains `0.62.0`; its OAuth Code Assist header now follows the inspected auth-library branch rather than the API-key genai branch.[17]
- Copilot chat/models API identity follows the bundled `copilot-api` versioned behavior; token/user-info retains its different API date.[18]
- Antigravity IDE, CLI and Hub remain distinct release lines. Updating a CLI changelog reference does not change the IDE fingerprint or enable account-gated models.[20]

Codex, Cursor, Kiro IDE, Grok stable, Zed, OpenCode and Qoder pins were researched and retained where unchanged. Trae, Windsurf and Devin source definitions remain inactive. Protocol-specific checksum/signing identities and unverified bundled runtime pins were not guessed from unrelated package releases.

## Consistency repairs

- Browser-safe generated provider identity metadata covers canonical IDs, storage/display aliases and declared upstream model aliases without importing server registries into browser resolvers.
- Capabilities and pricing use consistent provider identity. Exact native namespaces and `:free` routes remain distinct; catalog schema v3 rejects old normalized cache files.
- Daily catalog joins distinguish Kimi Code/Z.ai coding plans from direct API products. Reviewed provider-specific facts apply to exact resolution paths without replacing unrelated gateway protocol restrictions.
- Public/dashboard discovery preserves native model IDs, live typed metadata, custom overrides, intentional chat/STT duplicate IDs and no-auth providers. Operator-declared runtime capabilities are scoped by provider and native model ID.
- Numeric custom input/context/output values persist separately. Public chat listings expose `max_input_tokens` where known, rather than conflating it with `context_length`.
- Long-context reasoning follows the relevant output tariff when appropriate; saved partial user tariffs merge consistently for display and billing. An inclusive threshold can be explicitly declared instead of forcing every provider into a strict-greater-than rule.
- Per-model target transport now follows the translation target when no supported native source transport exists. Models declared Responses-only by the gateway dispatch to `/responses`; native compatible transports retain precedence and stale credential transport state is cleared. GPT-6.1 Sol uses this gateway policy to support tool calls consistently; its upstream Chat Completions endpoint also supports requests without tools.[2]

## Pricing semantics

xAI's documented long-context boundary is inclusive; Gemini pricing distinguishes output thinking, cached reads and time-based storage. These cannot be represented by a universal cache-write multiplier.[6][7]

DeepSeek publishes peak and off-peak schedules. The recorded reference rates and schedule are preserved, but automatic time-of-day billing selection remains a limitation rather than a claim that one flat price is universally correct.[5]

Subscription quotas, regional CNY tariffs, images, characters, duration and modality-specific token prices remain labelled in `metadata.billing`. Only compatible USD-per-million-token quotes enter the token calculator. Unknown tariffs are shown as “Not specified,” not as zero/free; numeric usage costs remain local estimates, not guaranteed upstream invoices.

OpenAI image pricing separates text/image input and image output. Gemini Embedding 2's input allowance and embedding dimensions are not completion-token limits; Kitsune Router's existing adapter is text-only even though the native model supports more modalities.[10][11]

## New-model safety and explicit deferrals

OpenCode Go additions use documented model-specific Messages or Responses endpoints, not a blanket Chat Completions route.[9]

Antigravity documentation advertises plan-gated Claude 5.5 models, but the exact internal IDs and account limits were not independently established; they were not fabricated from Anthropic API names.[8]

Cohere output ceilings are corrected from its model reference, but additional Aya models remain deferred because the documented compatibility endpoint differs from the pre-existing registry transport.[12][19]

Other explicit gaps are preserved in the coverage file and research handoff:

- No claim of live serving, account entitlement or universal Command Code major-version protocol compatibility.
- Incompatible realtime, managed-agent, WebSocket STT and missing media adapters were not added merely because a catalog lists them.
- OpenRouter/MiniMax image protocol corrections, existing historical media table drift, Qoder Lite retirement handling, and some hosted provider tariffs remain separate follow-up work.
- Existing unreviewed family estimates and dated compatibility IDs are retained for backward compatibility, not newly validated.
- 9router issues were triaged against this fork. Unrelated namespace-tool translation, Cursor exec and nested Qoder queue defects were not silently bundled into the catalog change.

## Verification

All tests use isolated HOME/DATA_DIR, fresh test secrets and live-provider flags disabled. New behavior has ordinary RED/GREEN regression evidence. Verification includes full Vitest, zero-warning ESLint, production Next build, provider/alias/OAuth baselines, real built-server model/pricing API reads, SQLite custom-limit read-back, and a Chromium pricing form smoke with intercepted save. No provider inference is required for these checks.

The exact final gate totals and reviewed source hashes are recorded in the external handoff, so later review corrections do not leave a stale count in this document.

## 2026-10-17 reconciliation update

The complete [models.dev snapshot](https://models.dev/api.json) contains 232 providers and 8,987 model records. The captured JSON has SHA-256 `60f5bc3e74aa0d883eea10839f599cb92e0f0dfbd010e182234318999439be99`; no record has a future `last_updated` date relative to this audit.

The active registry audit compares exact catalog products and literal or declared upstream IDs. It does not select the widest vendor leaf or treat decimal/binary token counts as interchangeable. Explicit primary-source overrides, route ceilings and unknown fields remain qualified results, not agreement or serving verification.

Native frontier limits remain endpoint-specific:

| Native route | Total context | Separate input ceiling | Common output ceiling |
| --- | ---: | ---: | ---: |
| OpenAI GPT-6.1 Sol | 1,050,000 | 922,000 | 128,000 |
| Anthropic Opus/Sonnet/Haiku 5.5 | 1,000,000 | Not independently specified here | 128,000 |
| Gemini 4 Argon, legacy GenerateContent | 1,048,576 unified | Shared window | 32,768 non-streaming |

Argon's legacy streaming route supports 65,536 output tokens. Its current model page describes the newer Interactions API's synchronous allowance; long decode requires continuation handling. Those modes do not turn the existing single-request GenerateContent path into a one-million-token output endpoint.

Catalog schema v4 preserves independent `maxInput`, `contextWindow` and `maxOutput`, including differences below ten percent. Explicit text-only, non-reasoning and no-tool facts override fallback guesses. Operator declarations and exact primary/route facts remain authoritative. Custom/live ingestion accepts `context_window` and `max_output_tokens` without relabelling a prompt-only limit as total context.

Public discovery keeps the established fields `context_length`, `max_input_tokens` and `max_completion_tokens`. Provider-native spellings normalize into those fields; the metadata retains API/client/mode provenance separately.

Usage pricing preserves unknown components as `null`, keeps free zeroes, and distinguishes five-minute from one-hour cache writes. Saved base/tier overrides retain their explicit component values. Native currency, subscription, media and time-dependent reference tariffs do not become guaranteed USD token invoices.

The [test guide](../tests/README.md) lists the reproducible gates. The [lifecycle audit](audit/12-model-lifecycle-audit.md) records retirement, eligibility and unmatched-route distinctions. Published release artifacts remain unchanged.

## Sources

[1] https://models.dev/api.json — models.dev complete model metadata API
[2] https://developers.openai.com/api/docs/models/gpt-6.1-sol.md
[3] https://raw.githubusercontent.com/openai/codex/rust-v0.160.0/codex-rs/models-manager/models.json
[4] https://raw.githubusercontent.com/openai/codex/rust-v0.160.0/codex-rs/protocol/src/openai_models.rs
[5] https://api-docs.deepseek.com/quick_start/pricing
[6] https://docs.x.ai/developers/pricing
[7] https://ai.google.dev/gemini-api/docs/pricing
[8] https://antigravity.google/docs/models.md
[9] https://opencode.ai/docs/go
[10] https://developers.openai.com/api/docs/models/gpt-image-2.5-flare.md
[11] https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2
[12] https://docs.cohere.com/docs/models.md
[13] https://registry.npmjs.org/@anthropic-ai/claude-code
[14] https://registry.npmjs.org/@tencent-ai/codebuddy-code
[15] https://kiro.dev/changelog/cli/2-27
[16] https://github.com/getkimchi/kimchi/releases/tag/v1.6.0
[17] https://raw.githubusercontent.com/google-gemini/gemini-cli/v0.62.0/packages/core/src/core/contentGenerator.ts
[18] https://registry.npmjs.org/@vscode/copilot-api/-/copilot-api-0.5.2.tgz
[19] https://docs.cohere.com/docs/compatibility-api.md
[20] https://antigravity.google/docs/changelog.md

## 2026-10-29 source follow-up addendum

This addendum describes the current worktree, not a rewrite of the dated records above or evidence of a new release, deployment, live-provider entitlement or invoice. Pricing remains subject to final integration verification.

### Pricing scope and coverage tradeoff

Provider billing resolution no longer uses unscoped generic vendor-family fallbacks as if they were a route's tariff. This avoids cross-product price attribution but reduces future cost coverage: a read-only comparison of the same pre-change static LLM registry found many previously numeric routes now resolve unknown, especially among Kiro, CodeBuddy and gateway subscription routes. This observation is scoped to that comparison, not a complete inventory. Previously stored historical costs are unchanged.

The selected [models.dev](https://models.dev/api.json) snapshot references use exact provider/product and literal model IDs, not generic family matches. Verification against the captured payload found 146 distinct matching provider/model pairs across 149 registry rows with catalog costs under the selected product mappings; all are included among 163 extracted references. This does not claim coverage of other products, dynamic models, or later catalog changes. References are informational and are not account invoices, entitlements or availability claims. A narrower opt-in set of 16 text-only hosted pairs may provide input/output estimates for recorded timestamps from the captured observation until strictly before 24 hours later. The capture time is `2026-10-28T18:11:32.422Z`; estimates are not backdated and expire after that window. Other route-specific quotes and operator overrides are separate. Unverified used cost components remain `null`, so a known subtotal is not necessarily a complete total.

`node scripts/verify-modelsdev-pricing.mjs --extraction-only` checks the compact extraction's integrity; providing the original captured JSON additionally checks its pinned hash and snapshot coverage. The compact extraction cannot independently establish the full payload's provenance, completeness or estimate eligibility, and a later download of the changing endpoint cannot reproduce the original snapshot by itself.

The DeepSeek time-of-day limitation in the 2026-10-06 record is historical. Current source implements recorded-time native schedule selection for reviewed DeepSeek routes, with a finite reviewed holiday calendar; unreviewed or invalid inputs can remain unknown. The earlier OpenCode Go endpoint statement also describes its dated additions: the current registry has per-model `supportedFormats` and `targetFormat`, including Chat-only and multi-endpoint models. Neither change proves a live account's billing or access.

### Usage and Ollama Local discovery

The usage dashboard debounces committed-update events and refetches selected-period statistics and chart data. Retained snapshots keep their original period labels, and failures offer retry. Live request fields stream independently. The original cause of the user's browser issue remains unconfirmed.

Ollama Local speech and embeddings require an active registered connection, with an optional API key. Public speech defaults to WAV, supports PCM and JSON-wrapped WAV, and rejects explicit MP3; listed Phonon tags are selectable, not evidence of installation. The embedding adapter forwards literal IDs. Its discovery shows operator-declared embeddings and recognizable whitelist IDs, not an installed inventory; `enabledModels` filters discovery candidates rather than proving universal request enforcement, and custom declarations and aliases can also appear. Both adapters reject redirects and relay configurations that cannot guarantee redirect refusal. Direct internal `handleTtsCore` calls retain their separate MP3 default and do not forward the public route's voice, cancellation, speed or instructions options; explicit WAV is the tested internal path.
