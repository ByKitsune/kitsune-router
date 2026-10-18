# ZenRouter 0.9.13 technical changelog

Release date: **2026-10-19** · Previous release: **0.9.12**.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.13) · [Complete changelog](../CHANGELOG.md) · [Release notes](../releases/RELEASE_NOTES_v0.9.13.md)

## Thinking probes and persisted configuration

- Replace the dashboard's impossible 1,024-token Antigravity Claude probe with
  the bounded model/bridge output allowance. Preserve the selected thinking
  preset and leave ordinary clients' explicit cap validation unchanged.
- Admit `providerThinking` through both settings allowlists. Validate mode maps
  and reject prototype keys without exposing protected authentication settings.
- Store processing speed separately as `providerServiceTier`. Explicit native
  request fields, including Auto/Standard/null, take precedence over defaults.

## Native processing speed and account routing

- Add independent Auto/Standard/Fast/Ultrafast controls and dated capability
  evidence for OpenAI and Codex; do not manufacture model suffixes or lower
  reasoning effort to simulate faster processing.
- Keep public Fast/priority values and map Codex Fast to `priority`. Preserve
  `ultrafast`; Standard suppresses inferred Codex paid defaults while omitting
  the API-only sentinel upstream.
- Route public Ultrafast requests through Responses. Preserve uploaded
  `file_id`, inline `file_data`, history and attachments following tool replies.
- Distinguish account-local eligibility from a globally invalid request. Only
  trusted pre-dispatch metadata can trigger request-local account skipping, with
  no health writes/cooldowns and no fallback to a slower tier. Check caller abort
  between selections and retain existing soft-pinning semantics.
- Keep every account's configured residency intact. Exhausting eligibility is
  an actionable 400, not a fabricated quota/availability error.

## UI and accounting

- Scope asynchronous settings snapshots and test results to the current
  provider and thinking/speed generation; stale results cannot validate a new
  selection or clear a newer test's loading state.
- Preserve the previous selection on failed saves. Treat mixed-account
  capability information as unverified instead of applying one account's
  negative catalog to the whole provider.
- Retain requested and actual tiers in streaming/JSON responses and token
  metadata persisted in SQLite, including redacted request details.
- Until tier-specific tariffs exist, mark premium/unconfirmed costs unknown.
  Preserve historical Standard estimates without inventing premium prices.

## Verification and release scope

Implementation `15992be4` passed 6,248 ordinary cases per Node 22/24 run, plus
three intentional expected failures and 100 optional skips, across 595 files.
No unexpected cases or suites failed. Application/docs builds, composed lint,
compatibility and provider identity baselines, CLI packaging, extracted CLI
runtime tests on both Node versions, and actual browser/StrictMode checks passed.
The tests are synthetic and isolated, not proof of live entitlement or speed.

The release bump synchronizes all four manifests/lockfiles, publication
workflow defaults, release/install documentation and five localized changelogs.
Exact-tag CI, npm/GitHub Release/Docker publication and production deployment are
verified independently. No schema, credential, or unrelated-service changes
are required. Detailed evidence and limitations are recorded in the
[thinking/speed audit](audit/15-thinking-speed-2026-10.md) and
[processing-speed guide](PROCESSING-SPEED.md).
