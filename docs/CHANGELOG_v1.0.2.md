# Kitsune Router 1.0.2 technical changelog — source verified; publication blocked

**Status: source verified at immutable `v1.0.2` / `65c8b97d783becab3f1e1210d2ab9ce67992e13b`; npm/GHCR publication blocked.** PR #2 merged at `23375bf121e926f2d2b1330d3c2b8c124a639b40`. Recovery tooling is separately authorized with no version bump, tag move or production deployment. [Release notes](../releases/RELEASE_NOTES_v1.0.2.md) · [Complete changelog](../CHANGELOG.md) · [Migration](MIGRATION.md).

## Deterministic timestamp coverage, not a production ordering change

The 1.0.1 GHCR workflow failed at `db-scoped-cache:216`. A controlled real-SQLite, cross-process diagnostic at exact source **`745834026a5a9f55dffce40c0ad01bf3106e8237`** reproduced two valid orderings:

| Writer timestamps | Observed ordering |
| --- | --- |
| Two writes in the same millisecond | `first, third, sibling` |
| Writes in different milliseconds | `third, first, sibling` |

Both timestamp scenarios exposed the committed credential and active-state updates to the parent cache, including `isActive: false`. The assertion assumed a timestamp relationship that wall-clock scheduling did not guarantee. The 1.0.2 fix uses `node:test` to mock only `Date` in the child writer, covering equal timestamps and a 1 ms difference while retaining real repository writes and cross-process cache reads. Timers are not mocked; SQLite invalidation and production priority/`updatedAt` tie-breaking are unchanged. Initial targeted checks passed 14 cache cases plus 15 readback cases (29 total); eight repeats of the 14-case cache suite passed. Exact-source gates are now recorded below, separate from those initial checks.

## npm diagnostic follow-up

The 1.0.1 npm workflow passed the exact-source gate, documentation build and pack, then failed its publish command. Its verbose file list obscured the final error, which remains unknown. Version 1.0.2 uses warning-level logging for `npm publish` only; pack output is unchanged. Its own run exposed the E403 below. Preserve exact-source SHA, original packed-artifact identity and provenance guards; do not assign the new diagnostic retroactively to 1.0.1 or weaken publishing policy.

## Immutable 1.0.1 evidence

Tag `v1.0.1` remains at **`745834026a5a9f55dffce40c0ad01bf3106e8237`**. PR #1 merged into master at `ce752a9f` (the 1.0.2 branch base). These are historical results, not final 1.0.2 gates:

| Check | Outcome |
| --- | --- |
| SSH suite | 9,039 passed, 100 skipped, zero failures |
| [CI 40463259397](https://github.com/ByKitsune/kitsune-router/actions/runs/40463259397) | Passed |
| [GHCR 40465152324](https://github.com/ByKitsune/kitsune-router/actions/runs/40465152324) | Exact-source gate: 9,038 passed, one failed (`db-scoped-cache:216`); no registry login/push reached, no canonical 1.0.1 image published |
| [npm 40465152995](https://github.com/ByKitsune/kitsune-router/actions/runs/40465152995) | Exact-source gate/docs build/pack passed; publish command failed, cause not yet known |
| Original CI artifact | `12716498091`, tarball SHA-256 `f00e2f581631065a9afa4719999487bf2f5eba31c096393d2a9141fb13bd55e8` |
| Public npm readback after failure, 2026-10-27 | HTTP 404 |
| GitHub Release 1.0.1 | Not created |

Do not claim E401, E403 or a two-factor-policy cause without the final error. Source tags and saved CI artifacts are not published registry artifacts. See [1.0.1 details](CHANGELOG_v1.0.1.md).

## Unchanged safety and history boundaries

- `v1.0.0` stays at `390a65677c06a30084386d2a2adf8b0c48709281`; the non-root ownership-test failure preceded npm/GHCR publication. Keep its original scope, 9,029-pass candidate evidence and earlier 9,028-pass inventory separate. Neither old tag is moved or relabeled.
- Historical migration coverage was **58 total cases including eight denials**. Production ownership checks remain fail-closed for unreadable same-UID state. Bounded Linux UID 65534 evidence does not certify arbitrary non-root relocation; native Windows/macOS migration is unverified.
- Stop/back up legacy state. Explicit `DATA_DIR` is authoritative; retain originals, SQLite consistency checks, secrets/auth/machine identity, crypto derivation inputs, SAML issuer and trusted roots. Containers keep the same existing volume at the effective absolute path. Restricted Linux operators use explicit state without relocation or privileged review, not ignored denials.
- Provider-neutral routing, user-selected accounts/order, package `@bykitsune/router`, binary `kitsune-router`, provider key `kitsunerouter`, `KITSUNE_ROUTER_*` / `x-kitsune-router-*`, standard API paths and port 20128 are unchanged. See [installation](INSTALLATION.md) and [operations](OPERATIONS.md).
- ByKitsune integration PR #6 merged at `73a14982`, with no production deployment. The docs preview is not registry publication or a custom-domain/DNS change. Original 0.x artifacts, dated numeric evidence, contributor credit and legal notices remain historical.

## 1.0.2 source and artifact evidence

| Gate | State |
| --- | --- |
| Immutable source tag | `v1.0.2` at `65c8b97d783becab3f1e1210d2ab9ce67992e13b` |
| PR #2 master merge | `23375bf121e926f2d2b1330d3c2b8c124a639b40` |
| Exact-tag SSH suite | 9,041 passed, 100 skipped, zero failed assertions and zero failed suites |
| SSH report SHA-256 | `a892d4549459b8de6de8d97a8a3ad397e257733f543a02a23fcfa60a5f535840` |
| [CI 40468830176](https://github.com/ByKitsune/kitsune-router/actions/runs/40468830176) | All green; 9,041 passed, 100 skipped, zero failures on `641d13efc407e302bddce69d984a8660e2286b03`, whose source tree matches the tag |
| Strict lint / builds / pack | Zero warnings/errors; 18 docs tests, docs static export, app build and pack passed |
| Local tarball SHA-256 | `9b98ba6a4bfdd92e6b3ad99d077f511e67ce921476048fce9c93fc44b1cfb4b2`; archive inventory 3,197 entries |
| Local tarball smoke | Install/help/runtime/upgrade passed, original private secrets retained at mode 0600, graceful exit 0 |
| Local image ID | `sha256:92aeda74d937e440bae4643523beaac9bc33addab1e9d5b18544c0ce6d0dfbec`; not a GHCR digest |
| Local container restart matrix | Six scenarios: default `/app/data` and custom `/var/lib/kitsune-router`, each with fresh JWT / CLI JSON / legacy ENV secrets; all keys retained at mode 0600 across restarts |
| Exact-source browser checks | Login; Escape restored Create Key trigger focus; viewport/scroll width 390/390 px; zero active animations under reduced motion |
| Original npm CI artifact | `12718343077`, tarball SHA-256 `a52d736ade6b8cbcf17ba114c9b55018956a7f1b35c4280edcae2912de8a3114` |
| Retained original CI tarball smoke | Independently passed install/help/runtime/upgrade, originals and keys retained, secrets 0600, graceful exit 0; not proof of registry acceptance |
| npm publication / public readback | E403 denied; subsequent public readback HTTP 404 |
| Canonical GHCR 1.0.2 | Preflight stopped before build/push; no published digest/SBOM/readback |
| GitHub Release 1.0.2 | Not created; the existing Create GitHub Release step was not reached |
| Production deployment / native Windows/macOS migration | Not performed / unverified |

## Known publication blockers; separate recovery tooling

[npm workflow 40469972263](https://github.com/ByKitsune/kitsune-router/actions/runs/40469972263) passed the exact-source gate/docs build/pack, then received **E403**: `Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.` The user will replace a limited granular `NPM_TOKEN` directly in GitHub's Actions-secret UI; completion is not confirmed. Do not request or echo the credential. Accepted publication, original-tarball identity/provenance and public registry readback remain blocked, not successful.

[GHCR workflow 40469972099](https://github.com/ByKitsune/kitsune-router/actions/runs/40469972099) passed all source gates and login, then its immutable-tag preflight stopped on Buildx `ERROR: ghcr.io/bykitsune/kitsune-router:1.0.2: not found`. The guard recognized only `manifest unknown`; **no image build or push ran**. An authenticated official-owner read separately returned grant HTTP 200, then manifest HTTP 404 with JSON error code `MANIFEST_UNKNOWN`; inventory was empty. This distinguishes a missing manifest from denied access; it is not proof of publication.

The authorized recovery PR introduces structured registry checks and a separate `container-recovery.yml` tooling workflow. It keeps release source pinned to **`65c8b97d783becab3f1e1210d2ab9ce67992e13b`** while reviewing/testing tooling separately; no version bump or tag move is needed. Tooling CI/merge, recovery execution, digest/provenance/SBOM and registry readback still require their own evidence. See [operations](OPERATIONS.md#publication-recovery-without-moving-the-tag) and the main-owned [rebranding ledger](REBRANDING.md).

No costly test/build or live-provider call was run for this documentation update. The existing docs preview has not been refreshed to this source. Recorded source checks and local artifacts do not establish registry availability, provider entitlement, invoice parity or production deployment.
