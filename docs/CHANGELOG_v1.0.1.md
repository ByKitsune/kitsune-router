# Kitsune Router 1.0.1 technical changelog — candidate

**Status: selected next version, pending final tag/SHA verification and publication.** [Release draft](../releases/RELEASE_NOTES_v1.0.1.md) · [Complete changelog](../CHANGELOG.md) · [Migration](MIGRATION.md).

## Immutable attempt boundary

Keep `v1.0.0` at **`390a65677c06a30084386d2a2adf8b0c48709281`**. That release workflow failed on the non-root process-ownership scan; no npm 1.0.0 package or canonical GHCR 1.0.0 image was published. Moving the old tag would destroy the source/evidence boundary, so the user selected 1.0.1 for the follow-up.

The recorded **9,029 passing tests** belong to the 1.0.0 candidate. The preceding 9,028-pass frozen inventory is a separate historical result. Neither certifies the final 1.0.1 tree. Preserve [1.0.0 technical scope](CHANGELOG_v1.0.0.md) and its [attempt record](../releases/RELEASE_NOTES_v1.0.0.md); do not relabel them as new artifacts.

## Follow-up changes and safety constraints

### Deterministic process-isolated regression harness — production policy unchanged

The follow-up isolates tests to owned synthetic process inventories and adds denial coverage rather than weakening the production hook. Native/same-UID unreadable ownership **still fails closed**, and an unreadable scan is not proof that the source has stopped. This is not a general non-root migration allowance. Interim checks reported 58 regression cases plus eight denial cases; final all-source/tag-bound and packaged-artifact checks remain pending.

A bounded native Linux check ran as UID 65534: an open owned source was refused, the closed source migrated, and host-wide uninspectable ownership was refused. That bounded evidence does not certify arbitrary native/non-root environments or the final 1.0.1 tag.

Restricted operators can stop/back up old state, keep it in place with explicit `DATA_DIR` without relocating, or obtain privileged ownership review. Do not ignore permission errors, remove locks or treat synthetic inventory isolation as an authorization bypass.

### Mobile endpoint API-key rows — pending final integration/verification

Allow long keys and action controls to wrap within narrow endpoint layouts. Preserve copy, reveal and management behavior without cropping key content or losing actions. Review final mobile/tablet/desktop behavior and regressions against the final source; no current screenshot/test result is asserted here.

### Current docs

Move current package/image pins and release links to **1.0.1** while keeping 1.0.0 as an immutable failed attempt and 0.x records as original ZenRouter history. Distinguish authenticated npm identity, successful publication and artifact readback. The documentation preview is not a registry release.

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
| Final v1.0.1 tag and source SHA | Pending |
| Process-isolated regression harness and denial coverage | Final verification pending; production ownership hook unchanged/fail-closed |
| Bounded native Linux UID 65534 smoke | Open-source refusal, closed-source migration and uninspectable host-wide refusal reported; not general non-root certification or final-tag proof |
| Mobile wrapping integration | Pending final integration/review |
| Current tests, suite failures, lint/build and packaged-runtime checks | Pending final-source evidence; no costly local run in this docs pass |
| GitHub organization/repository | Confirmed |
| npm identity and Actions credentials | Authenticated as `bykitsune`; credentials updated |
| npm package/organization publishing permission, publication/readback | Pending; authentication is not sufficient proof |
| Canonical GHCR access, image digest, provenance/SBOM/readback | Pending final publication verification |
| Documentation preview | Exists at [rebrand candidate](https://rebrand-candidate.kitsune-router-docs.pages.dev/en/) on the verified official account/project; not final-release verification |
| Custom domain / DNS changes | None implied or performed by this documentation task |

No production deployment or live-provider entitlement/billing guarantee is claimed. See the main-owned [rebranding ledger](REBRANDING.md) for final evidence and external actions.
