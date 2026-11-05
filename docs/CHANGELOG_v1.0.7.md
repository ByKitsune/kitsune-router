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
