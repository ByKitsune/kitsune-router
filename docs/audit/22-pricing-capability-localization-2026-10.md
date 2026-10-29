# Pricing, capability and localization follow-up — October 2026

This review starts from Kitsune Router `a1400d7a`. It follows the
[2026-10-29 upstream review](21-upstream-9router-2026-10-29.md) without changing
that report's historical source pins, results or deferred candidates. The work
describes source changes and local verification. It does not establish a new
release, deployment, model entitlement or provider invoice.

## What the catalog can establish

A model name alone is not a billing product. The same underlying model can be
sold through a native API, a reseller, an IDE subscription, a coding plan, a
regional endpoint or a free namespace. Their token rates, allowances, service
tiers and usable limits need not match. The audit therefore keeps provider,
product, literal model identifier and endpoint separate.

The reviewed registry contains **1,302 rows**. That is the local configured
registry inventory, including non-chat rows; it is not a count of models that
an individual account can serve. Dynamic provider discovery and operator-created
models can add further rows at runtime. Missing models.dev rows are unresolved
references, not evidence of model retirement.

The source for this comparison is models.dev. Direct requests to
`https://models.dev/api.json` returned a proxy HTTP 403 in this environment, so
the review uses its official Git source, pinned at
`91395aca0144ed1a54cdd527dc9d7eb682e1e4cd`. A reconstruction from that source is
not described as the original HTTP response or as a newly observed effective
tariff date. Source commit, complete generated payload and extraction hashes
must remain distinct evidence.

The reconstructed default API view contains **233 providers and 8,908 model
records**, with SHA-256
`d1f9cdad590fc031c5633132107d0818efec98f2ba8d27e4ba9cf952f473fc4b`.
The official all-model view has 8,974 records and a different hash; it must not
be substituted for the published default view. The
[source manifest](data/model-pricing-capability-source-20261029.json) records
the commit time, reconstruction time, generator dependencies and both hashes.

The exact-row capability comparison begins with this inventory:

| Registry rows | Classification |
| ---: | --- |
| 400 | Literal or explicitly declared upstream ID exists in the mapped catalog product. |
| 754 | A product mapping exists, but the literal/declared model ID has no matching row. |
| 31 | The route has no equivalent catalog product. |
| 117 | Non-chat unit; not treated as a chat token/context comparison. |

This is exhaustive enumeration of the configured registry, not 1,302
independently verified provider services. A matched row can still have a
primary-source override, a route ceiling, an unknown field or an actionable
difference. A comparison must preserve that field-level disposition.

## Reading a price correctly

The dashboard and estimator must keep these cases separate:

| Value | Meaning |
| --- | --- |
| Explicit zero | A verified zero component on that exact route, or an explicit operator override. |
| Known token price | A usable rate for the component, product, unit and applicable recorded time. |
| Catalog reference | A source observation that can be shown for comparison; it is not automatically an active billing rate. |
| Known subtotal | The sum of priced components while other incurred components remain unknown. |
| `Not specified` / `null` | No usable price for that component under the selected route and conditions. It is not free. |

The previous provider-billing change intentionally removed unscoped vendor
family fallbacks. A subscription route that used to borrow a public API tariff
can therefore become unknown even when a same-named public model has a published
price. Reintroducing that fallback would hide the mapping error rather than fix
it. Subscription allowance, regional currency, image/audio duration or character
charges, cache storage and provider-reported amounts need their own units and
provenance.

Saved operator overrides and already accepted usage are separate from catalog
reference data. Metadata refreshes must not rewrite recorded history. A source
capture timestamp is not evidence that a tariff applied before capture, and
extending an expiry timestamp is not a price refresh. The previous extraction's
16 text-only estimates and its 24-hour window remain historical facts recorded
in audit 21; they are not proof of coverage or freshness for later observations.

### Complete-row price coverage and observation refresh

The fresh source observation contains **1,411 exact reference IDs across 30
products**, compared with the historical extraction's 163 IDs. Of the configured
registry rows, **297 now have a matching reference**, compared with 149 in the
earlier extraction. Eligibility is computed from literal unit/modality/rate
facts: 359 public pay-as-you-go text-token IDs qualify, including IDs available
through dynamic catalogs. That number is not 359 newly priced registry models.

The all-row effective-rate audit remains deliberately conservative:

| Registry rows | Token-rate status |
| ---: | --- |
| 481 | Input and output are known; other incurred components can still be unknown. |
| 28 | At least one token component is known, without a complete input/output pair. |
| 793 | No usable token-rate component. |

The unknown rows comprise 223 subscription/credit products, 115 non-chat billing
units, 155 reviewed unknown/conditional routes, 13 quote-required routes, 286
without an exact product reference, and one ineligible raw catalog reference.
These counts explain gaps; they do not turn all gaps into confirmed price bugs.
At the recorded audit instant, 33 rows differ from the catalog: eight are IEEE floating-point representation noise, 18 use exact native-neuron conversions rather than rounded USD displays, four use the applicable native time-of-use schedule, and three retain an older primary quote that could not be reverified. The unresolved material conflicts are Chutes Kimi-K2.6-TEE, Chutes GLM-5.1-TEE, and Together Qwen3.7-Max; they are not certified current prices. No vendor invoice was inferred from those differences. The
[full price coverage report](data/pricing-coverage-20261029.json) includes every
row, known/missing component, source category and catalog disposition.

The runtime now attempts a validated full catalog refresh every six hours and
publishes private, content-addressed immutable observations. Only a complete,
bounded successful response establishes a new observation; HTTP 304, failed
requests and manually extended timestamps do not. Estimates retain their
24-hour applicability window. The original request timestamp selects the
newest applicable whole observation, including an older observation for an
in-flight request. A missing model in a newer observation does not borrow the
deleted rate from an older one. Independent workers do not overwrite a shared
manifest; corrupt or unreadable observations fail closed. The reader loads the
newest 64 observations into its recent-value cache and indexes all persisted
filenames. An older timestamp loads its actual predecessor after cache eviction
or restart instead of falling back to an unrelated bundled observation.
Disabling background catalog sync leaves persisted observations readable without
renewing them.

The refresh tests cover actual child-process publication and cross-worker
reads, timestamps, removal, expiry, corrupt/link-substituted files and invalid
or 304 responses. Direct API access remained proxy-blocked in this environment;
live automatic refresh acceptance was not demonstrated. The pinned Git-source
observation and successful offline publication tests are separate evidence.

A separate estimate defect affected Ollama Cloud DeepSeek requests: the
published weekday 12:00–18:00 UTC peak reference was used outside its window.
Recorded-time resolution now uses the documented off-peak half-rates outside
that window, including weekends, for the exact reviewed Pro and V4.1 Flash IDs.
The non-dated editor reference and pre-review behavior remain distinct. Native
DeepSeek uses its own different windows/holiday policy; local Ollama and other
plan products do not inherit this schedule. Operator overrides still win, and
accepted usage history is not repriced. Boundary, offset, weekend and durable
usage/cache-read regressions cover this correction.

The presentation audit also found a real false-zero path: missing values and
`NaN` could format as `$0.00`. Undefined, non-finite, negative and nonnumeric cost
values now remain unknown. A known subtotal is still shown when the aggregate
is unavailable; explicit unpriced coverage is not overridden by a legacy numeric
total. Actual zero charges remain zero.

The pricing editor distinguishes **Operator override**, **Built-in estimate**,
**Catalog estimate** and **No effective token tariff**. Catalog status explains
reference-only, expired and unmapped rows without replacing an unknown price
with a same-named vendor quote. Reset and save failures remain visible and keep
unsaved edits intact. Its native dialog retains browser focus management.

`GET /api/pricing?view=diagnostics` is a read-only diagnostic view with known and
missing fields, override fields, effective source and catalog status. It does
not replace the ordinary writable rate JSON or `view=overrides` contract;
diagnostics cannot be submitted through PATCH. Responses are not cached. This
separation prevents explanatory metadata from becoming a saved token tariff.

## Capability limits are independent facts

Keep total context window, maximum input and maximum output separate. A model
with a million-token context window does not thereby support a million-token
response. Explicit negative capabilities must survive fallback resolution, and
non-chat model units must not inherit chat completion limits.

The audit reproduced a source-level defect in the generic capability defaults:
unreviewed models inherited a **200,000-token context** and **64,000-token
output** even when no supporting source existed. Removing those numeric guesses
affects 97 registry rows: 60 had the guessed context value, and 97 had the
guessed output value. Unknown limits now remain unknown unless provider-scoped
reviewed metadata, an explicit route declaration, a validated exact catalog row
or an operator declaration establishes the corresponding field.

This correction is different from deleting a verified model limit. Reviewed
primary-source overrides and real bridge/route ceilings remain qualified facts;
they must not be replaced by whichever catalog leaf has the largest number.
The comparison report records these distinctions rather than counting all
differences as passes or all missing values as failures.

The generated exact-product overlay has **397 unique provider/model pairs**,
covering the 400 matched registry rows. It compares input and output modalities,
reasoning, tools, structured output, temperature and independent token limits.
The enhanced verifier was also run against the original `a1400d7a` resolver,
rather than using the already-corrected unknown defaults as a baseline:

| Field disposition | Original resolver | Final audit |
| --- | ---: | ---: |
| Agrees with the exact catalog record | 4,070 | 4,569 |
| Field-bound primary-source override | Part of 51 previously excused fields | 2 |
| Unresolved primary-reference conflict | Not separated from those 51 fields | 22 |
| Unknown, not advertised as a capability fact | 626 | 174 |
| Actionable difference | 20 | 0 |

The correction fixes 20 wrong Boolean fields, fills 454 previously unspecified
Boolean fields and refreshes 24 stale secondary-catalog facts that had been
mistakenly promoted to primary evidence when a billing review appended URLs.
A pricing URL does not establish a capability. Ministral 3B's native API context
is now 131,072; its 262,144-token weights/architecture reference is kept separate.
Codestral's conflicting moving-alias context and xAI multi-agent's beta-dependent
client-tool support remain explicitly unknown; explicit operator tool overrides
are retained. Hosted search and client-side tools are separate capabilities.

The 174 unknown fields and 22 current primary-source conflicts are explicit
non-passes, not fabricated agreement. The [per-field disposition of all 51 former
overrides](data/capability-primary-dispositions-20261029.json) records whether
each claim had field-bound evidence, stale catalog scope, a route condition or
unresolved source conflict. Primary HTTP pages blocked by the network were not
claimed to have been freshly verified. See every registry row in the
[before report](data/capability-audit-before-20261029.json) and
[after report](data/capability-audit-after-20261029.json).

The public model metadata and dashboard capability hook retain per-field
verification categories. Capability badges distinguish inferred values from
operator declarations and provider references without changing admission just
to give an assumption a stronger visual label.

The final after report also includes resolved capability values and separate
registry declarations for all 1,185 chat rows, including rows without a catalog
match. The 117 non-chat rows comprise 55 image, 29 embedding, 17 TTS, 13 STT and
three video rows; they retain their separate units rather than fabricated chat
comparisons.

Two route-level defects were reconciled alongside catalog metadata. Five
CommandCode rows advertised output above the executor's existing 200,000-token
ceiling; they now use the same shared ceiling as execution while explicitly
unverified limits remain unknown. Combo UI output aggregation now uses the
minimum known member ceiling, matching public discovery instead of advertising
the largest member's allowance. Nested combos and unknown members keep their
explicit conservative behavior. These fixes address gateway behavior, not a
claim that vendor-native limits changed.

## Localization is a runtime behavior

The initial locale inventory has English plus 34 non-English dictionaries.
Twenty-eight of the non-English dictionaries contain only about 200 entries;
the richer dictionaries have different historical coverage. A translated
language picker is not proof that every dashboard string is translated.

The runtime audit found that only newly inserted nodes were observed. React
updates to existing text, placeholders, titles and ARIA labels could remain in
English. Permanently retained original text could also become stale after a
component changed its value, and a nested code element was not reliably
protected by the ancestor skip rule. Dictionary loading and dynamic content
therefore need behavioral regression coverage in addition to a key inventory.

Model/provider identifiers, code, credentials, URLs and deliberately native
language labels are not prose to translate. Fallback English must remain
readable when a locale has no verified translation. Localization coverage must
report untranslated keys honestly rather than treating a copied English value
as a translated language.

The corrected runtime batches text and translated-attribute mutations, tracks
the current React-provided source separately from its own translations, caches
dictionary loads and fences stale locale loads. Template parameters and known
numeric display templates preserve changing counts and cost values. Nested
code, identifiers and marked regions remain protected; observer cleanup avoids
installing duplicate runtime listeners.

The final extractor registers **1,868 static and known dynamic-display UI
literals** in the English source catalog, and Indonesian has an entry for all
1,868, with zero missing keys in that measured scope. The extractor now includes
conditional/error/message properties and pricing-state vocabulary; its larger
scope is not a like-for-like percentage comparison with the initial 1,500-row
inventory. `audit-ui-i18n.mjs --check` rejects new unregistered English strings,
missing Indonesian keys and template-placeholder mismatches.

All 34 non-English dictionaries receive common navigation, pricing, status and
template vocabulary, adding 52–56 keys according to their previous coverage.
This does not fully translate all 35 supported locales. For example, Japanese
has 164 of the 1,868 measured source literals and falls back to English for the
remaining 1,704. The [locale coverage summary](data/i18n-coverage-20261029.json)
reports every dictionary's remaining gaps. A source-key match is not independent
linguistic certification or coverage of arbitrary backend error strings.

Isolated Chromium checks exercised Indonesian navigation, the chooser,
attributes, counters, pricing-source changes, protected code/model IDs, a return
to English and Japanese pricing states without browser errors. Runtime/language
fixtures also cover dictionary races, React text changes, attributes and cleanup.

## Upstream review boundary

The current 9Router Git tip is still
`1fe586bb1cf35e1ed0cb2150a8ef7d1db040b21d`, dated 2026-10-28, the same tip used
by audit 21. The October inventory includes 137 commits. Absence from Kitsune's
Git ancestry does not establish absence of the behavior: many fixes were already
adapted while preserving Kitsune's persistence, cancellation and public error
contracts.

Live issue metadata and commit history are different evidence. A reported issue
can guide reproduction without proving this fork is affected; a closed upstream
issue does not by itself prove a deployed Kitsune service is fixed. New account
brokers, providers or transport fingerprints must not be bundled into a pricing
audit merely because they appear in recent history.

The public October-created issue search was fetched across **12 pages**:
**295 issue titles**, 240 open and 55 closed at capture. The newest returned
creation time is `2026-10-28T20:04:00Z`; this is a point-in-time inventory, not a
claim about issues created after collection or the rest of October. The
[issue and commit inventory](data/9router-october-inventory-20261029.json)
contains the 295 public metadata rows and 137 October commits. Forty-one issue
bodies were selected for deeper review; the inventory is not evidence that all
295 issues were reproduced, solved or ported. Raw issue bodies are not copied
into the repository.

### Selected issue and commit dispositions

| Upstream issue / change | Kitsune disposition |
| --- | --- |
| [#5025](https://github.com/decolua/9router/issues/5025), commit `31b8439b` / [#5026](https://github.com/decolua/9router/issues/5026): Ollama Cloud quota moved to `/api/balance` | Adapted now. Bounded readonly requests preserve working legacy windows and fall back to balance for absent/removed history limits. Validate finite observations; unknowns never become full quotas. USD allowances and purchased balances retain separate semantics. |
| [#4604](https://github.com/decolua/9router/issues/4604), commit `466272490`: native Ollama cache counters dropped | Adapted now. Native `prompt_eval_cached_count` survives converter, raw NDJSON accounting, client JSON/SSE and request details. Prompt remains cache-inclusive, totals unchanged; invalid cache counters do not become a definite price. Tests use synthetic rates, not claimed Ollama subscription invoices. |
| [#5278](https://github.com/decolua/9router/issues/5278): Copilot context overflow loses public context error | Already adapted before this task; `upstream-context-overflow-routing.test.js` and public error normalization cover the reported structured context boundary. |
| [#5249](https://github.com/decolua/9router/issues/5249),56dbf46: nonstream SSE error becomes HTTP 200 | Existing Kitsune path and `upstream-nonstream-sse-status.test.js` cover it, including numeric-string status handling. Do not replace its incurred-usage accounting with upstream's early return. |
| [#5296](https://github.com/decolua/9router/issues/5296): Codex streaming fully buffered to EOF | Existing core regression `codex-stream-before-eof.test.js` proves synthetic core delivery before EOF. Live provider/reverse-proxy deployment behavior remains unproven; no blanket production-fix claim. |
| [#5295](https://github.com/decolua/9router/issues/5295): automatic connected-provider model sync | Kitsune already has a catalog-sync subsystem and refresh-OAuth regression suites. Model discovery, entitlement and catalog-price freshness are distinct; the pricing audit addresses its own observations instead of treating catalog sync as price refresh. |
| [#5307](https://github.com/decolua/9router/issues/5307)/[#5214](https://github.com/decolua/9router/issues/5214): stalled combo and first-token failover | Caller abort and bounded stream-peek behavior exist. New first-token attempt budgets/combo-to-combo routing are not automatically safe (duplicate charged attempts and active stream disposal); no new feature copied without attempt-lifecycle reconciliation. |
| [#5187](https://github.com/decolua/9router/issues/5187): combo peeking replays thinking-only/unknown responses | Existing Kitsune peeker preserves unknown/deadline/read-error streams rather than treating them as proven empty. Existing combo timeout/terminal/caller suites cover synthetic boundaries. This is distinct from first-token budget before upstream headers. |
| [#5188](https://github.com/decolua/9router/issues/5188): caller abort before streaming ignored | Existing chat/core/combos have caller-signal guards and tests. Previously documented search/fetch credential-acquisition-to-commit gap remains separate; do not transplant a global abort patch that can lose rotating OAuth grants. |
| [#5236](https://github.com/decolua/9router/issues/5236): Claude non-disableable thinking drops display | Current `thinkingUnified.js` preserves explicit display on adaptive thinking even when disabling is unsupported. Preserve the existing endpoint-specific behavior rather than reapply an old provider patch. |
| [#5143](https://github.com/decolua/9router/issues/5143)/[#5142](https://github.com/decolua/9router/issues/5142)/[#5005](https://github.com/decolua/9router/issues/5005),3fd925a: CodeBuddy channel identifiers | Already adapted before this task with canonical channel headers and tests for both executors. Actual WAF/account acceptance is not established by synthetic header checks. |
| [#5024](https://github.com/decolua/9router/issues/5024): CodeBuddy Intl 400 block cooldown | Confirmed the upstream provider-specific broad substring backoff is not in Kitsune. Deferred instead of blindly copying: Kitsune separates quoted invalid values/request errors from account faults, and its classifier has a different API. Need exact structured error evidence and account/combo tests before account-health writes. |
| [#5285](https://github.com/decolua/9router/issues/5285): observability toggle vs env flag | Current explicit env precedence remains: OBSERVABILITY_ENABLED, then ENABLE_REQUEST_LOGS, then saved setting. This is operator override behavior, not silently changed in a catalog audit; UI should explain effective override. Existing `observability-flag-precedence-3515.test.js` covers it. |
| [#5268](https://github.com/decolua/9router/issues/5268): CommandCode advertised output above gateway 200k | Fixed for five over-advertised rows using the same 200,000-token ceiling as the executor. Unverified numeric limits remain unknown. |
| [#4819](https://github.com/decolua/9router/issues/4819)/[#4941](https://github.com/decolua/9router/issues/4941)/[#4544](https://github.com/decolua/9router/issues/4544)/[#5047](https://github.com/decolua/9router/issues/5047)/[#5031](https://github.com/decolua/9router/issues/5031)/[#5045](https://github.com/decolua/9router/issues/5045): local modalities, pattern context limits, combo limits and capability provenance | Sent to the full capability audit. User reports are investigative leads, not authority to replace explicit provider scope with a widest-model match. |
| [#4622](https://github.com/decolua/9router/issues/4622): per-call regex compilation in pricing | Kitsune already has precompiled pricing-pattern regression coverage; do not reintroduce upstream's older pricing architecture. |
| [#4700](https://github.com/decolua/9router/issues/4700),9500965: image-only tool results stringified | Existing typed-media translator work and vision/tool-output tests cover the route family. Native destination and account acceptance still need separate testing. |
| [#4670](https://github.com/decolua/9router/issues/4670): Claude PDF metadata | Provider/model-specific declared PDF contracts already exist. Do not set PDF true for every Claude-looking gateway route. |
| [#4917](https://github.com/decolua/9router/issues/4917),5a4e812: global NUL stripping at SQLite binding | Not copied. Globally deleting bytes changes identities/request values and can create collisions; upstream description alone is not proof the current driver stack has the same defect. Reproduce per-driver roundtrip before choosing a boundary-specific fix. |
| [#5294](https://github.com/decolua/9router/issues/5294)/[#5282](https://github.com/decolua/9router/issues/5282)/[#5275](https://github.com/decolua/9router/issues/5275)/[#5273](https://github.com/decolua/9router/issues/5273)/[#5253](https://github.com/decolua/9router/issues/5253)/[#5245](https://github.com/decolua/9router/issues/5245),3b7acf7/e70ea24: OpenCode native TLS/lazy runtime | Deferred. Kitsune lacks that exact upstream lazy-runtime module; platform-native binaries, selected proxy paths and published access restrictions need reviewed packaging/transport work. No claim that installing fingerprint dependencies verifies access. |
| [#5300](https://github.com/decolua/9router/issues/5300)/[#5201](https://github.com/decolua/9router/issues/5201),d7bb71c: DeepSeek Web packaging/PoW | The web/PoW module is absent from Kitsune's current direct DeepSeek API lane; not the same code path. Do not add a browser-auth provider as a bugfix. |
| [#5291](https://github.com/decolua/9router/issues/5291)/[#5270](https://github.com/decolua/9router/issues/5270): native macOS tray/MITM | Cannot verify native macOS behavior on this Linux machine; no speculative platform fix claimed. |
| [#5309](https://github.com/decolua/9router/issues/5309)/[#5302](https://github.com/decolua/9router/issues/5302)/[#5299](https://github.com/decolua/9router/issues/5299): trace export, route diagnostic headers, editable response rules | New features requiring privacy/redaction, accounting and routing design. Inventory recorded; not silently added as a catalog correction. |
| [#5303](https://github.com/decolua/9router/issues/5303): private vulnerability reporting | Repository settings are an external admin capability; no GitHub setting changed through this source audit. |
| 50dcaa0/72cb589: Pi model name/cap retention | The affected upstream Pi route/card is absent in this checkout. Do not create a new CLI integration merely to claim the fix was ported. |
| acb3c08,b1effa0: Terra and CommandCode request identity | Already integrated in current master after the earlier audit; avoided duplicate cherry-picks. |

The new Ollama adaptations preserve prompt-inclusive accounting and unknown
quota values. Their fixtures are synthetic; they do not prove an Ollama
subscription invoice or close an external GitHub issue. Upstream release,
package and branding commits were not copied into Kitsune.

## Final local verification

The completed offline regression run reports **9,922 passed, 100 skipped/todo,
zero failed tests or suites across 790 files**. The strict report gate, composed
lint with zero warnings, application production build, HTTP/2 compatibility,
provider/alias/OAuth baselines, branding and generated-data checks pass. The
documentation checks report 18 passing tests and a successful static build.

All **14 production Chromium browser tests pass**, covering responsive Usage,
navigation and focus, changing localized text and accessible labels, pricing
diagnostics, fractional-rate persistence and recoverable load errors. The
pricing editor renders bounded pages while retaining edits across search/pages;
reset refreshes its parent, and saving waits for refreshed state before restoring
focus to the invoker.

A separate authenticated standalone smoke check restores persisted pricing on
startup, observes another process's newly published observation and leaves a
removed model unknown. These checks make zero upstream model/provider calls.
They establish local source behavior, not remote CI, deployment, entitlement or
settled invoice accuracy.

## Reproduce the review

Use isolated state and synthetic credentials, with live-provider flags disabled,
as described in [tests/README.md](../../tests/README.md). Keep the full pinned
catalog payload for the exact comparison; a clipped preview or a compact
extraction cannot independently establish omitted rows.

```bash
node scripts/verify-catalog-against-modelsdev.mjs /absolute/path/models-dev.json \
  --json /tmp/kitsune-catalog-report.json
node scripts/generate-modelsdev-capabilities.mjs /absolute/path/models-dev.json \
  docs/audit/data/model-pricing-capability-source-20261029.json --check
node scripts/import-modelsdev-pricing.mjs /absolute/path/models-dev.json \
  docs/audit/data/model-pricing-capability-source-20261029.json --check
node scripts/audit-model-pricing.mjs --snapshot /absolute/path/models-dev.json \
  --json /tmp/kitsune-pricing-report.json
node scripts/verify-modelsdev-pricing.mjs --extraction-only
node scripts/audit-ui-i18n.mjs --json /tmp/kitsune-i18n-report.json
npm test -- --maxWorkers=4
npm run lint -- --max-warnings=0
npm run build
```

`verify-modelsdev-pricing.mjs` checks the historical 163-reference extraction;
its original snapshot hash is not the new source hash. Do not pass the fresh
payload to that historical hash verifier or change its expected checksum to
make it pass. The current observation is verified by the import/check command
above.

An exact-reference comparison, an offline fixture, a build, and an authenticated
local API read each demonstrate a different boundary. None of them establishes
live provider acceptance, upstream interpretation of an image, account access,
or a final cash invoice. Validation results for a final source revision should
state passed, failed and skipped outcomes separately.
