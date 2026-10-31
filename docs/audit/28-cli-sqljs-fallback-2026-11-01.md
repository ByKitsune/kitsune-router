# CLI SQL.js fallback package follow-up — 2026-11-01

Source base: `7496e20d8fad022b9e7a056e4f71282f8cb22683`. This records a
packaging fix and test evidence, not a published release or deployed artifact.

## Finding

The CLI build accepted a Next.js traced `sql.js` directory merely because it
existed. The trace contained `dist/sql-wasm.js` but not the adjacent
`dist/sql-wasm.wasm`. In isolated tests with `better-sqlite3` unavailable and
`node:sqlite` disabled, both the previous production package and the 1.0.5
candidate failed to start the explicitly enabled SQL.js fallback. The primary
production driver was `better-sqlite3`; this test does not imply that it failed.

The 1.0.5 candidate package used SQL.js 1.15.2 while the existing managed
runtime had 1.14.1. Substituting the older WebAssembly binary into the newer
JavaScript failed, so retaining that runtime alone is not a valid repair.
Separately, a minimal `npm pack` fixture confirmed that an adjacent `.wasm`
file is included when it is present; the omission occurs before packing.

## Repair and verification boundaries

The CLI build now copies the WebAssembly file from the installed, locked
SQL.js package into the traced module after confirming its version and
JavaScript bytes match. Missing or mismatched inputs stop the build.

The candidate and release workflows test the actual packed tarball: compare
its SQL.js files against the build dependency, disable both native paths,
start the SQL.js-backed server using synthetic state, create a synthetic
connection, restart, and verify persistence. No live credentials are used.

Before this source change, the test rejected the 1.0.5 candidate from
workflow run `41222031108` for the missing WebAssembly file. A synthetic-only
fixture made from that candidate and the lockfile-integrity-verified SQL.js
binary passed the fallback and restart test under Node 22 and Node 24. That
fixture is not a release artifact. Fresh CI and the actual newly built tarball
must pass independently before any deployment.
