# ZenRouter 0.9.10 technical changelog

> **Kitsune Router archive:** this dated ZenRouter record keeps its original names, artifacts and evidence; it is not current installation or verification guidance. See [current docs](INSTALLATION.md) and [migration](MIGRATION.md).

Release date: **2026-10-16** · Previous release: **0.9.9**.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.10) · [Complete changelog](../CHANGELOG.md) · [Release notes](../releases/RELEASE_NOTES_v0.9.10.md)

Patch release for changes made while **re-verifying the audit findings against the code**,
after 0.9.9 had already been published. npm versions are immutable, so none of these were in a
released version until now. Historical [0.9.9 documentation](CHANGELOG_v0.9.9.md) is unchanged.

## Why this release exists

0.9.9 answered the external audit. Publishing it exposed a gap in the process: work continued
after the tag, and npm cannot be overwritten. Six code changes accumulated with nowhere to go.
This release ships them.

It is also where the re-verification pass paid off. Rather than treating the audit's findings as
settled once fixed, each was re-checked against the code — and four of those re-checks found
something new, including two where the earlier answer was simply wrong.

## Retired models were being advertised

### `gemini-2.5-pro`

Reproduced 5 consecutive times against the live gateway, each returning 503 wrapping an
upstream 404:

```
This model models/gemini-2.5-pro is no longer available to new users.
Please update your code to use models/gemini-3.1-pro-preview ...
```

The **transcription** route answers the same 404, so this is a full retirement, not a
chat-only removal. Now `deprecated: true` in the registry with a notice quoting the upstream
message, plus `routeAvailable: false` and `routeUnavailableReason: "retired-by-google"` in
metadata. The reference figures (window, pricing) are **kept for provenance** rather than
deleted, and the note says so.

### `gemini-2.5-flash-lite`

Found by reading **30 days of production logs**, not by probing alone. The journal shows two
different upstream messages for this family, and conflating them would have produced a wrong
call in either direction:

```
"This model models/gemini-2.5-flash-lite is no longer available to new users"
"You exceeded your current quota"
```

Each candidate was probed twice, 25 seconds apart:

| model | result | flagged? |
|---|---|---|
| `gemini-2.5-pro` | 404 RETIRED | ✅ |
| `gemini-2.5-flash-lite` | 404 RETIRED | ✅ |
| `gemini-3.5-flash-lite` | **200 WORKS** | ❌ |
| `gemini-2.5-flash` | **200 WORKS** | ❌ |
| `gemini-3.1-pro-preview` | 429 quota only | ❌ |

That last row is the trap. An earlier 429 on `gemini-3.1-pro-preview` looked like failure, but
the model is alive — it is in fact the replacement Google's own retirement message recommends.
Flagging it would have hidden a working model, which is precisely the regression this work
exists to prevent.

## `deprecated` was a UI-only flag

Fifteen model-level `deprecated: true` entries exist, each with a written reason:

| provider | entries | reason recorded |
|---|---|---|
| clinepass | 4 | "no longer available on ClinePass" |
| codebuddy-cn | 5 | EOL entries kept so stored combos resolve |
| deepseek | 2 | "Compatibility alias served by DeepSeek V4.1 Flash" |
| perplexity | 4 | "Standalone Sonar ended September 27, 2026" |

Grepping `deprecated` across `src/` and `open-sse/` returned **no filter anywhere on the
`/v1/models` path** — the flag was consumed only by dashboard UI components. Reproduced with one
active `deepseek` connection:

```
deepseek models listed: 6
   deepseek/deepseek-flash
   deepseek/deepseek-v4-pro
   deepseek/deepseek-v4-pro-max
   deepseek/deepseek-v4-pro-none
   deepseek/deepseek-v4-flash              <- deprecated: true
   deepseek/deepseek-v4-flash-vision-exp   <- deprecated: true
```

After the fix, with the same fixture: **4 models, both deprecated ids gone.**

Two deliberate boundaries:

- The id **stays in the registry**, so a stored combo resolves into a clear failure rather than
  a 404.
- An operator's **custom declaration is never filtered** — an explicit declaration outranks a
  built-in deprecation.

### The provider-level flag means something different

`deprecated: true` on a **provider** record means `RISK_NOTICE` — *"This provider uses a
subscription/OAuth session not officially licensed for proxy/router use"* — for claude, codex,
antigravity, gemini-cli, github and kiro. Treating that as retirement would have hidden all 19
`cx/` models. The filter keys off a **model row's own** flag only, and a test asserts the
distinction. Verified after the fix: connecting codex still lists 19 models.

## Gemini windows were withheld, not unknown

Eleven metadata records declared `unverifiedCapabilityFields: ["contextWindow"]`, and
`applyReviewedCapabilities()` nulls any field listed there. Because `/v1/models` only writes
`context_length` when the value is finite, those models reached clients with **no window at
all** — an absent number, not a wrong one.

Measured against production 0.9.7: **17 of 334 models** had no numeric `context_length`.

The original reasoning — *"Google does not document a combined input+output window"* — is true,
but withholding was the wrong call:

1. **models.dev's official google entries publish 1,048,576** for every one of these ids.
2. **The routes are served.** Verified live: `gemini/gemini-2.5-flash` and
   `gemini/gemini-3.8-flash` both returned **HTTP 200**. This is the opposite of `cx/gpt-5.4`,
   which is genuinely rejected upstream and where withholding *is* correct.
3. **The owner's principle:** raising the number is correct, lowering it harms ByKitsune. A null
   removes it entirely — the worst of the three.

Result: models without a numeric window drop **17 → 12**, and every remaining one is genuinely
unservable (`cx/gpt-5.4`, `cx/gpt-5.4-mini`, `cx/gpt-5.3-codex-spark`) or genuinely unverified
(`grok-build`, the morph routes). No number was invented.

## TTFT was computed, printed, and thrown away

The streaming handler already calculated `ttftAt - requestStartTime`. It appeared on the
`📊 done` log line and nowhere else — which is why the audit had to parse **304 log lines** to
report a 5,471 ms median and an 18,067 ms p90.

- `usageHistory` gains nullable `ttftMs`/`totalMs`. Additive by construction: `migrate.js`
  already runs `ALTER TABLE ... ADD COLUMN` for any column missing from an existing table, so
  production picks them up on boot without touching existing rows. Verified on a fresh
  `DATA_DIR`.
- Written as **NULL, never 0**, when unmeasured. A zero would read as "measured, instant" and
  drag the median down — the one number an operator needs to trust.
- `getUsageStats()` reports min/mean/median/p90/max plus a **sample count**, filtering
  `ttftMs IS NOT NULL` throughout.
- `/api/metrics` emits `zenrouter_ttft_ms{quantile=0|0.5|0.9|1|mean}` plus
  `zenrouter_ttft_samples_total`, **gated on having at least one sample** so a scrape never
  records a misleading 0.

Verified with three measured rows (120/210/340 ms) plus one NULL row: `samples=3`, min 120,
mean 223, median **210**, p90 **340**, max 340 — the NULL correctly excluded.

## Two silent-data-loss translation bugs

Both were `it.fails` known-bug markers, re-verified and fixed.

**`openai-to-cursor.js` overwrote the client's `max_tokens`.** Reproduced: a client asking for
**200** received **32000**, because the translator unconditionally assigned `DEFAULT_MIN_TOKENS`.
That silently ignores an explicit client instruction — the same defect class as the dropped
sampling parameters fixed in 0.9.9. The constant is now a **floor**: an explicit larger request
is honoured, anything absent/invalid/smaller still gets the floor, since Cursor's backend needs
a real budget rather than an empty completion.

**`openai-to-commandcode.js` lost tool arguments silently.** A malformed `arguments` string
became `{}` with no signal, so the model received a tool call with **no parameters** and nothing
indicated anything was lost — the call looked valid and simply did the wrong thing. The
fail-open fallback is **deliberately kept** (throwing would fail the whole request, and partial
JSON is routine from weaker models), but the loss is now logged. The translator still does not
fabricate parameters the model never produced, and the tests assert that honest contract: the
call survives, arguments stay empty rather than invented, and the discard is observable.

## Verification

- Full isolated suite: **1,454 files, 4,594 cases — 4,493 passed, 0 failed**.
- `npx eslint .` — zero errors, zero warnings.
- Registry baselines byte-for-byte equal: 82 providers, 117 alias tokens, OAuth URLs.
- Production build succeeds; the standalone reports 0.9.10.
- Runtime-verified on isolated `DATA_DIR`s: Gemini windows published (17 → 12), deprecated ids
  hidden while all 19 `cx/` models remain, both retired Gemini ids hidden while
  `gemini-2.5-flash` and `gemini-3.5-flash-lite` remain listed, TTFT aggregates with the NULL
  row excluded, and the release gate resolving `{"tag":"v0.9.10","version":"0.9.10"}`.

## Upgrade notes

- **No configuration change required. No API shape changed.**
- Two database columns are added automatically on first boot. Existing rows get NULL, which is
  read as "not measured" — never as zero.
- **0.9.9 remains valid.** This release is additive; nothing in 0.9.9 was wrong, it simply did
  not contain these changes.
- **Production is still 0.9.7.** None of the 0.9.9 or 0.9.10 changes are live; deployment still
  requires the owner's confirmation.

## Limitations

- The remaining `it.fails` known-bug markers in `tests/translator` were **not** re-verified and
  are not claimed fixed.
- `morph/*` and `gcli/grok-build` capabilities remain unverified (404 no-credential, 402
  spending-limit) and are left unset rather than guessed.
- Catalog work is metadata. It does not establish account entitlement or live availability.
- The `node-forge` advisory (GHSA-86w9-cpqp-85rv) still has no upstream fix; its affected
  signature-verification path is unreachable from this codebase, asserted by a test.
