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

## Verification boundary

The working-tree local normal-install precheck passes on official Node 22.19.0,
UID 1000, with lifecycle enabled and native 13.0.3/tray 2.1.4 retained. Two ordinary
network-none CLI starts reach health/login/catalog, preserve session/API-key/secret
bytes and 0600 modes, perform no observed startup npm calls, and stop gracefully
with cleanup and zero runtime warnings/errors. No injected native/NODE_PATH or
SQL.js opt-in is used. This is local worktree evidence based on b7 plus the recorded
changes, **not an exact final CI candidate or published 1.0.8 archive**.

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
