# ZenRouter 0.9.13 release notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

**2026-10-19** · Previous release: **0.9.12** · Requires **Node.js >=22.19.0**.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.13) · [Complete changelog](https://github.com/ZenRouter/ZenRouter/blob/v0.9.13/CHANGELOG.md) · [Technical details](https://github.com/ZenRouter/ZenRouter/blob/v0.9.13/docs/CHANGELOG_v0.9.13.md)

This patch fixes dashboard thinking probes and introduces real, independent
processing-speed controls for OpenAI and Codex. It preserves custom routing,
reasoning choices and media. Earlier published versions remain unchanged.

## Highlights

- **Fix false thinking-budget errors.** Antigravity Claude model tests leave
  room for the selected thinking budget within the model/bridge output ceiling.
  Real clients' explicit output caps remain enforced.
- **Persist thinking defaults.** The HTTP and SQLite settings allowlists now
  save the intended provider choices, with malformed mode maps rejected.
- **Choose speed separately from reasoning.** OpenAI/Codex provider pages offer
  Auto, Standard, Fast and Ultrafast. Native `service_tier` overrides the provider
  default; Codex Fast uses `priority`, and Ultrafast stays `ultrafast`.
- **Use the correct transport without losing files.** Public API Ultrafast uses
  Responses; uploaded `file_id` and inline `file_data` attachments survive the
  conversion, including attachments in tool results.
- **Keep account decisions local.** Known tier ineligibility skips only the
  selected account for that request, without health penalties or lowering the
  tier. Global invalid requests still fail; upstream denials are not disguised
  as trusted eligibility metadata.
- **Avoid stale UI confirmations.** Delayed refreshes cannot replace a saved
  choice, and a test for an old selection cannot validate a newly selected tier.
  One account's catalog is not treated as proof about every active account.
- **Record requested and delivered tiers honestly.** Actual tier metadata is
  retained through JSON, streaming and SQLite. Premium or unconfirmed costs are
  unknown rather than incorrectly calculated at Standard prices.

## Upgrade

```bash
npm install -g @joyccn/zenrouter@0.9.13
zenrouter
```

Docker targets **linux/amd64** at `joyccn/zenrouter:0.9.13` and
`ghcr.io/zenrouter/zenrouter:0.9.13`; GHCR retains its existing access policy.
Examples require successful registry publication. Back up the configured data
directory and keep the same persistent volume when upgrading. This patch adds
no database schema migration and does not replace secrets or credentials.

See [Processing speed](https://github.com/ZenRouter/ZenRouter/blob/v0.9.13/docs/PROCESSING-SPEED.md)
for request examples, OpenCode V2 variants, provider differences and source links.

## Verification and limits

Before the release-only version bump, implementation `15992be4` passed **6,248
ordinary tests**, with **3 intentional expected-failure cases** and **100 optional
cases skipped**, across **595 files**, on both Node 22 and 24. There were zero
unexpected case or suite failures. Lint, compatibility and provider baselines,
documentation/application builds, CLI packaging, extracted-artifact runtime
checks and browser/StrictMode regressions also passed. Release-tag CI and
registry publication are separate checks, not implied by these local results.

Tests use isolated state and synthetic loopback providers, not live inference
or production accounts. They do not verify subscription entitlement, actual
throughput or upstream billing. Public API Ultrafast is currently documented for
GPT-6 Astra and GPT-6.1 Sol; Codex additionally requires an eligible account and
workspace permission. Faster tiers can consume more quota or cost more.
Tier-specific cost tariffs are not implemented: premium/unconfirmed estimates
remain `null`. An invalidated OAuth refresh token still requires reauthorization.
