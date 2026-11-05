# Kitsune Router 1.0.6 — provider safety, routing and runtime follow-up

Date: **2026-11-05**. The root, CLI, tests and documentation packages are
synchronized to **1.0.6**. This source revision consolidates changes since the
October 31 source closing and the reviewed Codex model-plan routing follow-up.

- Preserve original opaque Claude/Google signed histories and request/account
  ownership; reject missing continuity without fabricated signatures or identities.
- Validate real Google project binding, OAuth/Kiro responses and credential
  destinations. Tie Check/Save results to the current connection draft.
- Review all 121 provider catalogs, add 52 verified rows and flag 59 newly
  deprecated rows while retaining explicit custom models and historical routes.
- Preserve native OpenAI search and Jina/Tavily format intent; render structured
  Usage response content safely.
- Reduce measured request/SSE CPU work while preserving tool aliases, signed
  payloads, media, delivery order, cancellation and terminal usage.
- Include matching SQL.js JS/WASM in the CLI and force runtime repair installs
  into their local project without changing parent proxy/TLS/auth configuration.
- Remember only matching-model canonical Codex plan denials in scoped, hashed,
  bounded hints. Apply quota/lock eligibility first. Cancelled/stale entitlement
  failures cannot publish hints for replacement credentials; stale Codex successes
  cannot clear newer hints or health across import or reauthentication. Existing
  generic failure-health semantics are unchanged.
- Review all 67 direct dependency declarations / 56 packages against the November
  5 stable snapshot. Update 18 declarations / 14 packages and 165 of 885 locked
  locations, including Next 16.4.5, Undici 8.12.4, Vite 8.3.6 and Vitest 5.1.0. Keep required
  transitive/runtime pins and the minimatch 11.0.4 compatibility coverage.

See the [technical notes](../docs/CHANGELOG_v1.0.6.md),
[readiness audit](../docs/audit/32-pr6-codex-entitlement-and-106-readiness-2026-11-05.md)
and [full changelog](../CHANGELOG.md#106--2026-11-05).

## Stable publication preparation

The later November 5 stable readback adds Undici 8.12.4. Canonical Docker
publication uses authenticated structured registry evidence and verifies the
actual immutable image with synthetic state before promoting latest. The
[publication review](../docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)
records the source and distribution boundaries. Existing version tags and
published bytes are preserved; retries reuse verified original artifacts.

## Verification scope

Before the source bump, [CI run 41997372229](https://github.com/ByKitsune/kitsune-router/actions/runs/41997372229)
passed all four jobs on `17be4150`: **10,975 tests passed, 99 gated skips, zero
failures**, **32 browser cases**, **18 docs tests**, strict lint, builds, all four
audits and the unpublished CLI package. The verified pre-bump archive also passes
health/login/models and session/API-key persistence on actual Node 22.19.0 and
22.23.4. The readiness audit records provenance, source-version ordering and
runtime boundaries. Post-bump exact-SHA evidence is retained in CI artifacts.

The local pre-bump preflight recorded **10,973 passed tests, 99 gated skips and
zero failures**, **32 production-dashboard browser cases** and **18 documentation
tests**, with application/documentation builds. Four locked dependency installs,
installed checks and low-threshold audits passed with zero audit findings.
Focused proofs include 132 Codex routing/lifecycle tests and 167 dependency
compatibility tests. These are dated observations from their recorded revisions;
the readiness audit keeps local preflight, exact-source CI and packaged-runtime
checks distinct. It records source identities, artifacts and remaining limits.

## Distribution and private state

This source revision does not by itself publish npm/GHCR artifacts, promote
registry `latest`, create a GitHub Release or deploy production. GitHub reads on
November 5 found no v1.0.5 Release or source tag. The earlier
[1.0.2 artifact record](RELEASE_NOTES_v1.0.2.md) remains historical; its npm blocker
and private-container access observations are not new 1.0.6 publication evidence.
No old tag or artifact is relabeled by this source bump.

Retain the effective absolute `DATA_DIR`, complete database/state and existing
JWT/API/identity secrets, certificates and authentication during upgrades. Follow
the [migration guide](../docs/MIGRATION.md). Synthetic checks do not establish live
provider entitlement, paid inference, native Windows/macOS installation or
provider invoice accuracy.
