# Kitsune Router 1.0.1 technical changelog — attempted release

**Status: immutable tag retained; publication not established.** `v1.0.1` remains at **`745834026a5a9f55dffce40c0ad01bf3106e8237`**. PR #1 merged to master at `ce752a9f`. No canonical GHCR 1.0.1 image was published, npm's publish command failed, and no GitHub Release 1.0.1 was created. [Attempt record](../releases/RELEASE_NOTES_v1.0.1.md) · [Current 1.0.2 follow-up](CHANGELOG_v1.0.2.md) · [Complete changelog](../CHANGELOG.md) · [Migration](MIGRATION.md).

## Immutable attempt boundary

Keep `v1.0.0` at **`390a65677c06a30084386d2a2adf8b0c48709281`**. That release workflow failed on the non-root process-ownership scan; no npm 1.0.0 package or canonical GHCR 1.0.0 image was published. Moving the old tag would destroy the source/evidence boundary, so the user selected 1.0.1 for the follow-up.

The recorded **9,029 passing tests** belong to the 1.0.0 candidate. The preceding 9,028-pass frozen inventory is a separate historical result. Neither certifies the final 1.0.1 tree. Preserve [1.0.0 technical scope](CHANGELOG_v1.0.0.md) and its [attempt record](../releases/RELEASE_NOTES_v1.0.0.md); do not relabel them as new artifacts.

## Follow-up changes and safety constraints

### Deterministic process-isolated regression harness — production policy unchanged

The follow-up isolates tests to owned synthetic process inventories and adds denial coverage rather than weakening the production hook. Native/same-UID unreadable ownership **still fails closed**, and an unreadable scan is not proof that the source has stopped. This is not a general non-root migration allowance. Historical migration checks covered **58 total cases including eight denials**, not 58 plus eight.

A bounded native Linux check ran as UID 65534: an open owned source was refused, the closed source migrated, and host-wide uninspectable ownership was refused. That bounded evidence does not certify arbitrary native/non-root environments; native Windows/macOS migration remains unverified.

Restricted operators can stop/back up old state, keep it in place with explicit `DATA_DIR` without relocating, or obtain privileged ownership review. Do not ignore permission errors, remove locks or treat synthetic inventory isolation as an authorization bypass.

### Mobile endpoint API-key rows

Allow long keys and action controls to wrap within narrow endpoint layouts. Preserve copy, reveal and management behavior without cropping key content or losing actions. Source test results are not independent proof of every mobile/tablet/desktop layout.

### Current docs

At this attempt, package/image pins and release links targeted **1.0.1** while keeping 1.0.0 and 0.x history intact. Current instructions now target **1.0.2**. Authentication, source tags, saved CI artifacts and accepted registry publication remain distinct.

## Unchanged rebrand and migration contracts

- **Kitsune Router — Your models. Your routes.** ByKitsune maintains/sponsors the neutral multi-provider local-first gateway; no mandatory account, purchase or provider ordering.
- Repository `ByKitsune/kitsune-router`, npm `@bykitsune/router`, executable `kitsune-router`, client provider key `kitsunerouter`, canonical image `ghcr.io/bykitsune/kitsune-router`.
- Standard `/v1/*`, `/v1beta/*` and port **20128** stay stable. Project settings/headers use `KITSUNE_ROUTER_*` / `x-kitsune-router-*`.
- Explicit `DATA_DIR` is authoritative. Stop source/helpers, back up all state, verify consistent SQLite and retained files, keep originals, and refuse overwrite/unsafe/incomplete migration. Preserve secrets/auth/machine identity, crypto derivation constants, SAML issuer and trusted certificate roots.
- Containers keep the same existing volume/mount at the effective absolute `DATA_DIR`: `/app/data` by default or a supported custom path. Fresh source setups generate private stable JWT secrets; upgrades keep effective existing values. See [installation](INSTALLATION.md), [operations](OPERATIONS.md) and [migration](MIGRATION.md).

## Gate ledger

| Gate | State |
| --- | --- |
| v1.0.0 source/evidence | Retained at `390a65677c06a30084386d2a2adf8b0c48709281`; no npm/GHCR publication |
| v1.0.1 tag and source SHA | `745834026a5a9f55dffce40c0ad01bf3106e8237`; immutable |
| SSH source suite | 9,039 passed, 100 skipped, zero failures |
| [CI 40463259397](https://github.com/ByKitsune/kitsune-router/actions/runs/40463259397) | Passed |
| Process-isolated migration regressions | 58 total including eight denials; production ownership hook unchanged/fail-closed |
| Bounded native Linux UID 65534 smoke | Open-source refusal, closed-source migration and uninspectable host-wide refusal reported; not general non-root certification or final-tag proof |
| [GHCR 40465152324](https://github.com/ByKitsune/kitsune-router/actions/runs/40465152324) | Exact-source gate failed: 9,038 passed, one failed at `db-scoped-cache:216`; before login/push, no canonical 1.0.1 image published |
| [npm 40465152995](https://github.com/ByKitsune/kitsune-router/actions/runs/40465152995) | Exact-source gate, docs build and pack passed; publish command failed |
| Original saved CI artifact | `12716498091`; tarball SHA-256 `f00e2f581631065a9afa4719999487bf2f5eba31c096393d2a9141fb13bd55e8` |
| GitHub organization/repository | Confirmed |
| npm identity and Actions credentials | Authenticated as `bykitsune`; credentials updated |
| npm failure cause / public readback | Cause not yet known (final error obscured by truncated verbose file list); HTTP 404 after failure on 2026-10-27 |
| Canonical GHCR digest, provenance/SBOM/readback | No published canonical 1.0.1 image established |
| GitHub Release 1.0.1 | Not created |
| Documentation preview | Exists at [rebrand candidate](https://rebrand-candidate.kitsune-router-docs.pages.dev/en/) on the verified official account/project; not final-release verification |
| Custom domain / DNS changes | None implied or performed by this documentation task |

The exact-source real-SQLite diagnostic reproduced `first, third, sibling` for same-millisecond writes and `third, first, sibling` for different milliseconds. Both timestamp scenarios exposed the committed credential and active-state updates to the parent cache. This is a timestamp-dependent assertion, not demonstrated stale-cache behavior. The [1.0.2 fix](CHANGELOG_v1.0.2.md) controls only the child `Date` clock and covers both cases without changing production ordering.

Do not infer E401, E403 or a two-factor-policy cause from incomplete npm logs. No production deployment or live-provider entitlement/billing guarantee is claimed. See the main-owned [rebranding ledger](REBRANDING.md) for final evidence and external actions.
