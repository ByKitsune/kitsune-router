# Kitsune Router 1.0.7 technical notes

Version **1.0.7** repairs the production publication environment while retaining
the provider/request, credential, catalog, translator/SSE and dependency behavior
from [1.0.6](CHANGELOG_v1.0.6.md). Undici remains **8.12.4**; the supported runtime
floor remains **Node >=22.19.0**.

Both publishers now install their exact locked Playwright Chromium and require
browser checks before the full source gate. A real SQLite/filesystem fixture gets
a bounded 30-second test budget, with identical assertions and no production
migration/ownership/clock changes. Current and translated installation guides
point to the 1.0.7 target, conditional on each registry's actual readback.

Immutable `v1.0.6` stays at `f9d4c50c`; its original release runners stopped at
verification before any artifact publication. The new patch binds the corrected
workflow to its own source tag. Original npm release bytes, integrity/provenance,
GHCR source/digest/SLSA/SPDX, real image runtime checks and monotonic latest guards
remain required. The [publication record](audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)
keeps source CI, failed attempts, actual registry outcomes, candidate artifacts,
original release artifacts and access boundaries separate.

See [release notes](../releases/RELEASE_NOTES_v1.0.7.md) and preserve existing
private state using the [migration guide](MIGRATION.md). No live-provider
entitlement, native Windows/macOS execution or production deployment is inferred
from synthetic checks or registry acceptance.


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

The [actual-outcome receipt](audit/data/publication-107-actual-outcomes-20261105.json)
and [publication record](audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)
retain these boundaries. A separate **unpublished 1.0.8** source follow-up addresses
runtime retention and bounded registry readback; it does not rewrite 1.0.7 history
or establish 1.0.8 availability.
