# Kitsune Router 1.0.2 technical changelog — candidate

**Status: user-authorized next version; final SHA/tag, verification gates and npm/GHCR publication pending.** [Release notes](../releases/RELEASE_NOTES_v1.0.2.md) · [Complete changelog](../CHANGELOG.md) · [Migration](MIGRATION.md).

## Deterministic timestamp coverage, not a production ordering change

The 1.0.1 GHCR workflow failed at `db-scoped-cache:216`. A controlled real-SQLite, cross-process diagnostic at exact source **`745834026a5a9f55dffce40c0ad01bf3106e8237`** reproduced two valid orderings:

| Writer timestamps | Observed ordering |
| --- | --- |
| Two writes in the same millisecond | `first, third, sibling` |
| Writes in different milliseconds | `third, first, sibling` |

Both timestamp scenarios exposed the committed credential and active-state updates to the parent cache, including `isActive: false`. The assertion assumed a timestamp relationship that wall-clock scheduling did not guarantee. The 1.0.2 fix uses `node:test` to mock only `Date` in the child writer, covering equal timestamps and a 1 ms difference while retaining real repository writes and cross-process cache reads. Timers are not mocked; SQLite invalidation and production priority/`updatedAt` tie-breaking are unchanged. Targeted checks passed 14 cache cases plus 15 readback cases (29 total); eight repeats of the 14-case cache suite also passed. These are not final-source/tag gates; final suite counts remain pending.

## npm diagnostic follow-up

The 1.0.1 npm workflow passed the exact-source gate, documentation build and pack, then failed its publish command. Its verbose file list obscured the final error. The follow-up uses warning-level logging for `npm publish` only; pack output is unchanged. Keep the exact-source SHA, original packed-artifact identity and provenance guards. Do not repack different bytes, infer an authorization error from incomplete logs, or bypass two-factor/publishing policy.

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

## 1.0.2 gate ledger

| Gate | State |
| --- | --- |
| User authorization | 1.0.2 selected; deterministic test fix and release follow-up authorized |
| Final source SHA and immutable tag | Pending |
| Equal/different timestamp regression and full exact-source suite | Pending; report actual case and suite failures, do not inherit 1.0.1 counts |
| Strict lint, app/docs builds, original pack and packaged-runtime checks | Pending final-source evidence |
| npm permission, accepted publication, original tarball/provenance and public readback | Pending |
| Canonical GHCR access, linux/amd64 digest, provenance/SBOM and readback | Pending |
| GitHub Release and final release evidence | Pending |
| Production deployment / native Windows/macOS migration | Not performed / unverified |

No costly test/build or live-provider call was run for this documentation update. The main-owned [rebranding ledger](REBRANDING.md) records final external actions; a passing synthetic gate does not establish provider entitlement, availability or invoice parity.
