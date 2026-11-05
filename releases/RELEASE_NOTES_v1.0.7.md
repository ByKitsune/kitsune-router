# Kitsune Router 1.0.7 — stable publication follow-up

Date: **2026-11-05**. Root, CLI, tests and documentation versions are synchronized
to **1.0.7**. This patch carries the 1.0.6 provider/account integrity, catalog,
translation/SSE, CLI packaging and stable dependency work into the repaired
production publication path. The reviewed dependency graph still includes
Undici **8.12.4** and supports Node **>=22.19.0**.

## Corrected release environment

Both npm/GitHub Release and GHCR workflows install the locked Chromium after
isolating state and installing dependencies. Browser checks are mandatory and
the synthetic Usage prerequisite runs before the unchanged full source gate.
One real SQLite/filesystem test receives a bounded 30-second harness budget;
its assertions and production migration/ownership clocks remain unchanged.

The source CI and both original publication attempts for `v1.0.6` are distinct.
The tag remains at `f9d4c50c386d2757b0446f9c35c46daa8ac10b4c`; those publication
jobs stopped before creating a CLI artifact, npm package, GitHub Release or image.
The new patch preserves that history and keeps release source and workflow
provenance aligned under a fresh tag.

## Retained publication and upgrade guards

- Verify exact tagged source, strict lint, complete tests, browser prerequisites,
  application/docs builds and all package/lock versions before publishing.
- Retain the original release tarball before npm publication; verify its registry
  integrity and provenance. Retries reuse original bytes and latest never rolls
  back a newer release.
- Resolve GHCR absence through authenticated structured registry evidence,
  verify immutable digest/source labels/SLSA/SPDX, test the actual default image
  entrypoint with isolated state, then promote that original digest to latest.
- Preserve the complete effective `DATA_DIR`, JWT/API/identity secrets, keys,
  certificates and database through upgrades. Synthetic image checks use no real
  provider accounts or paid inference.

Actual per-channel acceptance, checksums, image visibility and runtime evidence
belong to the [publication record](../docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md).
A source-version change alone does not establish registry availability or a
production deployment. Earlier tags and registry artifacts remain unchanged.

See the [technical notes](../docs/CHANGELOG_v1.0.7.md),
[1.0.6 source scope](RELEASE_NOTES_v1.0.6.md),
[full changelog](../CHANGELOG.md#107--2026-11-05) and
[migration guide](../docs/MIGRATION.md).


## Actual 1.0.7 publication and known installer limitation

Source `b7f77d07` passed both source CI runs (11,013 passed, 99 gated skips,
32 browser cases each). **npm, canonical GHCR and GitHub Release all published
1.0.7.** The original npm bytes have SHA-256
`b5ae6a345f60012f878885923912c16ea532ea4b0b2e6fe1ed3d7e10614d8cc5`,
with matching registry integrity/signatures and provenance bound to the original
publisher run. The first readback timed out after publish exited zero; later
public readback succeeded without a second publish. Continuation 42080159497 is
cancelled overall, but Release creation succeeded at 18:08:21 UTC before
cancellation completed. All three asset API digests match the original bytes and
immutable scripts. Tags and published assets are not replaced.

The Docker digest is
`sha256:f355a82c6a4978f78df82e981af7a511b5bfe4ad01d9314e86172b8c589d450d`.
Authenticated source/provenance checks, default/custom-data runtime and latest
promotion pass. Anonymous pull-grant readback returned HTTP 401; that observation
does not prove a package visibility setting or workflow write failure.

**Known CLI installer issue:** sequential SQLite/tray `--no-save` installs prune
sibling dependencies in the shared runtime project, including during startup.
Normal registry installation exits zero, but the contained offline launcher did
not reach health within 30 seconds while silent synchronous self-healing made
four npm `ENETUNREACH` retries before server startup. The terminal outcome/default
driver was not observed; no hard database failure or SQL.js opt-in is established.
Further published help/version/upgrade checks were stopped. The successful Docker
entrypoint smoke is a separate execution path.

The [actual-outcome receipt](../docs/audit/data/publication-107-actual-outcomes-20261105.json)
and [publication record](../docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)
retain these boundaries. A separate **unpublished 1.0.8** source follow-up addresses
runtime retention and bounded registry readback; it does not rewrite 1.0.7 history
or establish 1.0.8 availability.
