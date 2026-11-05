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
