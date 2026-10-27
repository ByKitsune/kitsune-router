# Client identities, model catalogs and pricing refresh

> **Kitsune Router archive:** dated ZenRouter audit evidence; original names, paths, hashes and results remain historical, not current verification. See [current docs](../INSTALLATION.md) and [migration](../MIGRATION.md).

Review date: **2026-10-21**. Starting source and deployed production revision:
`04c0bf77c3d0b287a438566e504d72b81e6e081b`.

## Scope and evidence rules

This review separates four independent facts: a publisher's current stable
client release; the SDK/protocol bundled into that release; the native model
catalog and account entitlement; and the provider/product-specific tariff.
A newer client identity does not grant model permission, create a supported
modality, or establish subscription-dollar billing.

Primary package manifests, stable update selectors, tagged source and inspected
bundles take precedence over release-number guesses. Prerelease/alpha channels
are not promoted merely because their version is numerically larger. A delayed
stable channel is identified separately from a non-prerelease npm `latest`.
Existing verified wire/runtime pins remain independent where the new app's
release does not establish a replacement.

The previous [October reconciliation](17-october-reconciliation-2026-10.md)
remains the record for its deployed source, tests and production probes. Its
passing CI is not evidence for this later batch.

## Client release integration

The central source remains `open-sse/config/clientVersions.js`. Transport,
OAuth, usage, validation and model-discovery consumers must use the same
appropriate product surface. Publisher versions are not copied into unrelated
SDK, browser, extension or executing-Node identities.

- Claude Code: non-prerelease npm `latest` **2.1.306**; delayed `stable`
  **2.1.304**. The inspected latest bundle still uses Stainless **0.128.0**.
  No additional Anthropic beta entitlement is inferred.
- Codex: stable **0.163.0**, shared by the transport and catalog's
  `client_version` gate. Alpha releases are excluded.
- Gemini CLI: stable **0.65.0**, with the inspected OAuth auth-library
  **10.9.0** kept separate from the API-key GenAI **1.30.0** branch. Its runtime
  fingerprint belongs to the executing host.
- Antigravity: publisher identities remain separate—App **2.24.0**, CLI
  **1.4.0**, standalone IDE **2.5.5**. An unchanged verified version is not a
  missed bump. The CLI identity alone does not validate Enterprise inference.

Secondary clients are checked against the correct stable product, not a
similarly named build number or marketplace extension. VS Code's bundled
Copilot version, Cursor's bundled Connect identity, Kiro IDE versus CLI,
CodeBuddy CN versus INTL, and Windsurf desktop versus its language-server
identity are independent pairings. Signature-bound legacy Qoder metadata and
unverified Kiro runtime/SDK fingerprints must not be guessed from app versions.

The secondary publisher survey selects VS Code **1.143.0** with bundled Copilot
Chat **0.71.0**, Cursor **3.24.18** with unchanged Connect **1.6.1**, Kiro IDE
**1.4.13** / CLI **2.33.0**, CodeBuddy CN **2.171.0**, Grok stable **1.0.62**,
Kimchi **1.17.0**, Command Code **1.86.3**, Zed **1.24.4**, Windsurf desktop
**3.10.67**, OpenCode **1.19.3**, Qoder **1.1.75** and inactive Trae **3.6.4**.
CodeBuddy INTL's unverified IDE wire pin remains **2.161.1**, independently.
Windsurf's inspected metadata extension identity is **1.48.2**, not its desktop
release or extension package version. The native Command Code production
environment is `production`, not `cli`; Cursor's internal commit header is not
a mandatory public-account header.

## Model and product availability

Registry additions require a literal provider ID and a wire type already
supported by this gateway. Missing entries in a public or account catalog do
not establish retirement. Stable accepted compatibility IDs are retained rather
than silently rewritten into a different billed product. Authenticated
availability and documented limits remain separate from metadata comparisons.

Antigravity's metadata now records the official plan/surface matrix using
explicit `available`, `unavailable` and `unknown` values. Missing account plans
stay unknown; positive quota or a generic 404 never becomes a guessed plan.
Argon is not available in the standalone IDE. Gemini 3.7/3.6/3.1 Pro require
Enterprise, and Pro access to Argon/Claude 5.5 requires a non-trial subscription.
Enterprise provisioning, project/region discovery and administrator partner
opt-in are reference requirements, not an implemented Enterprise transport.
The announced **2026-11-02** removals remain scheduled lifecycle metadata, not
premature execution blocks.

## Pricing correctness

Quotes are scoped to the provider, literal/declaratively aliased model,
currency, billing unit, delivered service tier and applicable context boundary.
Vendor API prices are not automatically reseller or subscription invoices.
Media prices per image, minute, second, character, credit or megapixel cannot be
converted to text-token prices from a generic output counter.

All registered model rows now have a discoverable effective or explicitly
unknown quote in the pricing editor. Loading those rows does not write public
defaults into operator overrides. Search filters provider/model IDs without
discarding edits. A single captured pricing/node snapshot is shared across the
editor's catalog resolution rather than issuing a SQLite read for each model.

### Recorded-time native DeepSeek estimates

The native DeepSeek USD schedule publishes peak rates on Monday–Friday
**[01:00,04:00)** and **[06:00,10:00) UTC**, excluding Chinese public holidays.
Previously those conditions were prose while live billing used off-peak rates.

Usage costing now supplies the stored entry timestamp before the saved pricing
merge. Peak/reference selection therefore cannot replace an explicit operator
zero/null tariff, affect a reseller with the same model name, or reprice an
already persisted row when the wall clock changes. Ambiguous timestamps and
years without a reviewed holiday calendar leave used native rates unknown.
Holiday coverage is needed only inside a possible weekday peak window;
weekends and hours definitely outside both windows remain known off-peak.
The 2026 holiday calendar is pinned to State Council
**国办发明电〔2025〕7号**. Weekend makeup work does not override DeepSeek's
explicit weekend off-peak rule. This remains a local estimate from recorded
usage time, not proof of the upstream's authoritative billing timestamp. The
vendor does not clarify statutory holidays versus every substitute weekday in
the government's extended leave blocks; this local calendar interpretation is
qualified rather than advertised as verified invoice policy.

### Counter integrity

Canonical explicit zeroes take precedence over stale alternate input/output
fields. Negative, non-finite or fractional counts, cache subsets exceeding
inclusive input, and reasoning exceeding total completion tokens cannot produce
a falsely complete numeric total. Known independently priced components remain
available where their counts are valid. Legitimate cache and reasoning subsets
are still billed once. Native OpenAI 30m/12h and Anthropic 5m/1h write families
remain independent.

Published `billing.nextRates` transitions are selected by recorded time before
operator merging, rather than remaining inert notes. Date-only transitions use
an explicit **UTC gateway-estimate boundary**; they are not a claim about an
unpublished upstream invoice timezone. Only token-rate fields are admitted to
the token calculator—cache storage per token-hour remains a separate unit.
An offer guaranteed through *at least* a date is not treated as an expiry when
no replacement rate has been published.

### Complete native processing-speed quotes

The captured OpenAI API tables now supply **47 complete Standard quotes,
23 Fast, 2 Ultrafast and 20 Flex**. These are literal tariff cells, not blanket
2x/0.5x multipliers. Unpublished long-context cells, unknown cache writes and
contract-specific Scale remain unknown. The separately rounded Flex cache
prices are retained exactly. Native GPT-5.3 Codex Fast support does not imply
Codex subscription account permission. Complete Standard quotes replace stale
native defaults before independent delivered-speed quotes are attached.

### Review findings and scope limits

The initial committed-source inventory classified **120 providers and 1,165
registered model/kind rows**, including the 603 rows outside the then-reviewed
metadata. It found 741 editor omissions. Its 503 global/leaf/family references
were classified as unverified provider references, **not 503 proven invoice
errors**. The immutable models.dev comparison is pinned to
`020f86d1b0970fe421c5dd7baec94478879d9756`; generated default/all-type objects
exactly match the captured public API objects.

Material primary-source corrections include TokenRouter's full 156-row tariff
review and context tiers, native reseller DeepSeek V4 Pro **1.32/3.96/0.044**,
Nebius Flash cache **0.01/M** and M3 cache **0.06/M**, and Perplexity Agent
Sonnet 5.5 cache **0.10/M**. Exact MiniMax M3.1 free routes do not inherit paid
family prices. Native-CNY quotes remain qualified native quotes, not USD
estimates. Media token blockers are complete unknown quotes rather than fake
per-image/per-second conversions.

The vendor review classified 226 rows across 21 products, the gateway review
classified 23 providers, the media review classified all 28 assigned providers,
and the OAuth review added 48 supported routes without deleting existing IDs.
These overlapping scopes are **not additive unique-provider counts**. Restricted
Daybreak/Mythos facts are metadata-only. Codex review names remain gateway
aliases with exact base wire IDs; a gateway-expanded model catalog is not proof
of native review IDs. New model metadata does not establish live entitlement.

The final current-source inventory—not the older committed baseline—contains
**120 providers / 1,297 model-kind rows**: 1,076 LLM, 90 image, 51 TTS,
41 embedding, 24 STT, 13 video and 2 audio. It classifies 26 providers without
explicit model rows separately. Reviewed metadata covers 1,008 rows; the other
289 are inventoried, not silently claimed primary-verified. The quote states
are 741 known input/output references (including 20 zero references), 28 partial
quotes, 443 complete all-null quotes and 85 absent quotes. **246 heuristic/global
references remain qualified**, not proven host tariffs.

A real empty in-memory SQLite editor probe exposes all 1,294 distinct
provider/model pairs (1,297 kind rows), with **zero missing rows and zero saved
overrides**. Its 1,432 effective pairs include extra static compatibility rows.
Replaying the 20 original pricing cases gives 15 published-rate matches,
4 conservative unknown totals and one qualified Gemini audio counter case;
flat text counters do not establish audio billing. This refresh does not claim
exhaustive modality metering or verified invoices for every provider.

An independent reviewer reproduced and then verified all eight agreed findings:
annotated override inheritance, invalid calendar dates, definite off-peak
coverage, canonical-zero persistence, prototype-safe literal model keys,
native/custom-prefix ownership, invalid-counter provenance, and finite cost
arithmetic. Final scoped evidence: **45 external checks and 150 repository
cases passed**. The original strict equality test for a very large finite
floating-point result differs by one rounding step; the retained tolerant gate
verifies finiteness, serialization and relative accuracy, rather than pretending
the original assertion passed.

## Verification and operational limits

Each behavioral update requires ordinary RED/GREEN evidence at its consuming
boundary: serialized headers/queries/payloads, actual price calculations,
SQLite persistence or rendered editor events. A constant-only or source-text
assertion is not runtime validation. The final full suites, lint, baselines,
build/package checks and production results must be recorded from the frozen
candidate; overlapping focused runs are not added as independent coverage.

Evidence is retained outside the repository under
`/tmp/opencode/zenrouter-client-pricing-refresh-20261021/`, separated into
clients, secondary clients, core, vendor, gateway, media, OAuth catalog and
catalog-comparison reviews. Captures retain URLs, timestamps and hashes.

### Frozen local verification

Before committing or operating production, the combined source passed:

| Gate | Observed result |
| --- | --- |
| Node **22.23.3** full suite | **8,129 passed, 100 skipped/todo, 686 result files**, zero failed cases/suites; strict JSON validator passed |
| Node **24.22.0** full suite | Same counts and strict report validation; source fingerprint stable during both runs |
| Composed lint | `npm run lint -- --max-warnings=0`, exit 0 |
| HTTP/2 compatibility | 1 passed; separate from Vitest discovery |
| Provider/alias/OAuth/identity baselines | All passed after explicit review of client fields, two native URL corrections and xAI's Responses transport |
| Dependency audits | Application, CLI, tests and docs: **0 reported vulnerabilities** at `--audit-level=low` |
| Application/docs/CLI | Production standalone build, docs tests/build and CLI build/pack all exit 0 |
| Actual standalone and extracted CLI artifact | **63 HTTP checks per run**, including Node and Bun **1.4.3** (`bun:sqlite` observed) |
| Browser on standalone and extracted pack | **14 checks per run**; unknown prices, hidden-edit search, zero/null overrides and desktop/mobile Save; no page errors |

The package inspection found no environment files, generated database/auth
state, unsafe archive paths or bundled native better-sqlite3. Native driver
fallback and PKI runtime dependencies remain present. A first browser harness
run had an ambiguous selector matching two legitimate model rows; scoping the
external locator to the exact edited row fixed that harness error without
changing application assertions or source. Test counts above exclude that
failed exploratory run and do not sum overlapping focused runs.

Compact public provenance is in
[`data/client-model-pricing-refresh-20261021.json`](data/client-model-pricing-refresh-20261021.json).
Deployment, bounded live acceptance, historical-data comparison, push and
exact-SHA CI are subsequent independent gates. Their operational records are
retained in the external evidence directory and tied to the final commit, not
retroactively attributed to this precommit local gate.

No historical cost backfill, immutable npm/Docker artifact replacement, account
plan purchase, TLS relaxation or credential copying is authorized by a catalog
refresh. Production deployment uses a new source-labeled release directory and
private backup/rollback, then public authenticated smoke. GitHub push and
exact-SHA CI are separate gates; synthetic tests do not establish all providers'
native availability, pricing invoices or OS-specific behavior.

## Primary reference entry points

- [OpenAI pricing](https://developers.openai.com/api/docs/pricing.md)
- [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing.md)
- [Google Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [xAI models](https://docs.x.ai/developers/models)
- [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [2026 China holiday notice](https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html)
- [Antigravity models](https://antigravity.google/docs/models.md),
  [plans](https://antigravity.google/docs/plans.md),
  [Enterprise](https://antigravity.google/docs/enterprise.md)
- [models.dev comparison catalog](https://models.dev/api.json) — a secondary
  literal-route cross-check, not account entitlement or a universal USD quote.
