# ZenRouter 0.9.10 release notes

**2026-10-16** · Previous release: **0.9.9** · Requires **Node.js >=22.19.0**.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.10) · [Complete changelog](https://github.com/ZenRouter/ZenRouter/blob/v0.9.10/CHANGELOG.md)

Patch release for changes made while **re-verifying the audit findings against the code**,
after 0.9.9 had already been published. npm versions are immutable, so these were in no
released version until now. No breaking API change.

**Upgrading from 0.9.9 is optional but recommended** — 0.9.9 is not wrong, it simply does not
contain these six changes. Two database columns are added automatically on first boot.

> **Known issues and publication correction (2026-10-16):** The Gemini 2.5 Pro/Flash-Lite
> retirement conclusion below was incorrect. Google's [official lifecycle notice](https://ai.google.dev/gemini-api/docs/deprecations?hl=en)
> explicitly says these models are **not deprecated**; access is limited to projects with
> prior active use, and no shutdown date is announced. Version 0.9.10 incorrectly hides
> them for eligible users. Also, its `24h` TTFT query has an invalid SQL cutoff, so the
> metrics endpoint does not emit the promised TTFT samples. Corrections are being tested
> on `master`; **they are not in the published 0.9.10 artifacts**. The existing release
> tag and tarball are unchanged. No production deployment is performed by these notes.

## Highlights

- **Retired models are no longer advertised.** `gemini-2.5-pro` and `gemini-2.5-flash-lite`
  both answer 404 *"is no longer available to new users"*, reproduced 5/5 and 2/2 respectively
  and corroborated by 30 days of production logs. Both were listed and callable-looking.
  They are now hidden while the ids stay in the registry, so a stored combo resolves into a
  clear failure instead of a 404.
- **Fifteen `deprecated` models were still being offered.** The flag existed and was well
  documented, but was consumed only by the dashboard UI — no filter existed on the API path at
  all. Reproduced with one active deepseek connection: `/v1/models` returned two retired
  compatibility aliases. Now filtered, with the important distinction that a **provider-level**
  `deprecated: true` means a ToS risk notice for claude/codex/antigravity/… and must **not**
  hide that provider's models.
- **Gemini context windows were withheld, not unknown.** Eleven records declared the window
  unverified, which nulled it — and since `/v1/models` only emits `context_length` when the
  value is finite, **17 of 334 models** reached clients with no window at all. models.dev's
  official entries publish 1,048,576 for these ids and the routes are served, so withholding
  was the wrong call: raising the number is correct, removing it is the worst case. Now
  **12** models lack a window, and every remaining one is either genuinely rejected upstream or
  genuinely unverified.
- **TTFT is finally measurable.** The streaming handler already computed time-to-first-token
  and printed it, but never stored it — which is why the audit had to parse 304 log lines to
  report a 5,471 ms median. It is now persisted as nullable columns (written as **NULL, never
  0**, so unmeasured requests do not drag the median down) and exposed as
  `zenrouter_ttft_ms{quantile=...}` on `/api/metrics`.
- **Two silent-data-loss translation bugs fixed.** `openai-to-cursor` overwrote the client's
  `max_tokens` with a hardcoded 32000 — a client asking for 200 received 32000; that constant
  is now a floor, not an override. `openai-to-commandcode` turned malformed tool arguments into
  `{}` with no signal, so the model received a tool call with **no parameters** and nothing
  indicated the loss.

## A note on how these were found

Every item above came from re-checking a claim rather than trusting an earlier conclusion.
Three examples where the first answer was wrong:

- The audit reported **3** models with a null `context_length`. The real count was **17**.
- `gemini-3.5-flash-lite` appeared in the production logs alongside genuinely retired models,
  but returned **HTTP 200** when tested — an earlier 429 was quota, not retirement. Flagging it
  would have hidden a working model.
- I first asserted `anthropic/claude-sonnet-4-6` was 250,000. It is **1,000,000**; 250,000 is
  the *Antigravity bridge* cap for the same model id, which is a different route.

## Verification and caveats

- Full isolated suite: **1,454 files, 4,594 cases — 4,493 passed, 0 failed**. `npx eslint .`
  clean with zero warnings.
- Registry baselines (82 providers, 117 alias tokens, OAuth URLs) byte-for-byte equal.
- Runtime-verified on isolated `DATA_DIR`s: Gemini windows published (17 → 12 without one),
  deprecated ids hidden while all 19 `cx/` models remain listed, both retired Gemini ids hidden
  while `gemini-2.5-flash` and `gemini-3.5-flash-lite` remain, and TTFT aggregates with a NULL
  row correctly excluded (samples=3, median 210, p90 340).
- **Production is still 0.9.7.** No deploy has been performed; none of the audit fixes or these
  changes are live yet.
- The remaining `it.fails` known-bug markers in `tests/translator` were **not** re-verified and
  are not claimed fixed.
- Catalog work is metadata: it does **not** establish account entitlement or live availability.
