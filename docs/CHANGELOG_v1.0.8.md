# Kitsune Router 1.0.8 technical notes

Version **1.0.8** fixes managed runtime dependency retention and extends bounded
registry readbacks. The dependency graph remains the reviewed 1.0.7 graph,
including Undici **8.12.4** and Node **>=22.19.0**. Publication requires exact-source
CI and a normally installed CI-candidate smoke; actual channel availability and
final-artifact evidence are recorded in the [publication receipt](audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md).

## Managed runtime dependency retention

SQLite and tray share the launcher's private runtime project. The 1.0.8 change
atomically retains exact optional managed pins before fast paths, adopts existing
unsaved modules, validates installed versions and uses saved exact installs so
one component cannot prune the other. It preserves unrelated manifest fields and
invalid manifest bytes, reports optional unavailability, and retains transport,
authentication, CA and local-project boundaries. N-API/missing SQL.js repair paths
do not require native build tools.

The exact managed N-API lifecycle is explicitly denied for npm 11.17, which can
normalize an implicit native rebuild during a later sibling install. Unrelated
approvals/denials remain intact; invalid policy maps are preserved without writes.

The child npm boundary also removes the outer transaction's one-time approval
selector. npm 11.17 rejects that selector in a different project-scoped install.
Parent settings, persistent policy, strict script checks, auth, proxy, CA and
`ignore-scripts` remain intact; the managed native denial remains active.

Focused validation passes **34 tests under npm 11.17**, covering real npm
retention/upgrades, script-policy preservation and invalid manifests. Policy-only
and malformed-manifest cases intentionally avoid package installation; real npm
cases use local HTTP registry fixtures. Tiny tarballs and a fake native binary
that is never loaded do not certify
the final published native runtime. Successful retained fixtures have zero
second-start npm subprocesses.

## Read-only registry propagation budget

The default bounded readback policy permits **24 reads with 571 seconds of total
backoff**, with individual delays capped at 30 seconds. Publication/tag writes
are not repeated. Exhaustion preserves original release bytes, while authorization,
network and malformed responses remain terminal. **54 focused tests** pass using
controlled reads/waits; no registry publication is performed by that validation.

## Tagged-source and CI-candidate verification

Immutable `v1.0.8` identifies `1314af7b228e91226be4e8bbc3beff962dd5ae60`.
Both exact-source CI runs pass **11,042 tests, 99 gated skips and zero failures**
across 866 files, plus **32 browser cases without retries** each. The
[source-CI receipt](audit/data/publication-108-source-ci-20261105.json) records
strict lint, security/docs gates and the separate diagnostic boundaries.

The [fresh candidate proof](audit/data/publication-108-candidate-install-20261105.json)
records normal global installs on official Node 22.19 and Node 24.19/npm 11.17,
the latter using a reviewed exact-file own-CLI lifecycle approval. All four
offline CLI starts pass with retained managed dependencies/state, zero observed
startup npm calls and zero runtime warnings/errors. These results bind to the
exact committed CI candidate; actual registry/release archive and container
verification remain separate in the publication receipt. For registry installs,
use the [npm 11.17 guidance](INSTALLATION.md#npm-1117-script-review), not the
candidate's local-file selector.

## Historical working-tree verification boundary

The working-tree local normal-install precheck passes on official Node 22.19.0,
UID 1000, with lifecycle enabled and native 13.0.3/tray 2.1.4 retained. Two ordinary
network-none CLI starts reach health/login/catalog, preserve session/API-key/secret
bytes and 0600 modes, perform no observed startup npm calls, and stop gracefully
with cleanup and zero runtime warnings/errors. No injected native/NODE_PATH or
SQL.js opt-in is used. This is local worktree evidence based on b7 plus the recorded
changes, **not an exact final CI candidate or published 1.0.8 archive**.

## Actual publication and public-package verification

**npm, GitHub Release and canonical GHCR 1.0.8 are published.** Both official
workflows succeed on immutable source `1314af7b`. The original/public npm archive
SHA-256 is `71817f3bfba90e9cc66186ee114bb4069d1d87a08e5624a1b7ebba0f511aeed5`;
`latest` and `release-1.0.8` both resolve to 1.0.8. Public bytes, Sigstore source/run
binding and nine registry signatures/four attestations verify. All three actual
GitHub Release asset downloads match original or immutable-source bytes.

A fresh actual **public-registry** global install on Node 24.19/npm 11.17 uses
reviewed one-time approval for exact `@bykitsune/router@1.0.8`, then passes
help/version and two ordinary offline CLI starts. Managed native/tray pins,
key/session/secret bytes and 0600 modes persist; cleanup succeeds with zero
install/runtime warnings/errors and no observed startup npm calls. This result
does not substitute the CI candidate or its local-file selector for the public package.

The canonical image digest is
`sha256:b2d6206350b38c3ffb568b470640d57c740222a413e9e72f3b010a416c90cf5d`.
Authenticated default/custom-data runtime and latest promotion pass. Anonymous
pull grant returns HTTP 401 without establishing the visibility setting. Attached
SLSA/SPDX gates pass authentically; raw attached predicates are not independently
available. See the [final aggregate](audit/data/publication-108-final-verification-20261105.json),
[final npm proof](audit/data/publication-108-npm-final-20261105.json) and
[live publication receipt](audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) for original-byte,
registry-propagation, cryptographic, runtime and access boundaries.

## Published 1.0.7 history remains intact

Immutable source `b7f77d07`, npm bytes, Docker digest and all three GitHub Release
assets remain unchanged. All three channels published 1.0.7, but sequential
`--no-save` SQLite/tray installs prune siblings. The measured offline CLI did not
reach health within 30 seconds during synchronous npm self-heal; its terminal
outcome/default driver was not observed, so this is not a proven hard database
failure. The successful 1.0.7 Docker entrypoint smoke is separate from the CLI
installer path. Continuation 42080159497 was cancelled overall, yet Release
creation had already succeeded; cancellation did not undo publication.

The [runtime-retention proof](audit/data/publication-108-runtime-retention-20261105.json),
[readback proof](audit/data/publication-108-readback-budget-20261105.json) and
[local precheck](audit/data/publication-108-local-install-20261105.json) retain the
individual boundaries. The [publication record](audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)
records actual per-channel availability; do not infer a release from these source
changes. See [1.0.8 release notes](../releases/RELEASE_NOTES_v1.0.8.md),
[1.0.7 history](CHANGELOG_v1.0.7.md) and [migration](MIGRATION.md).
