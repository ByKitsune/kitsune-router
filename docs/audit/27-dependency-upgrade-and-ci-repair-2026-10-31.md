# Stable npm dependency refresh and CI repair — 2026-10-31

Review date uses **Asia/Jakarta**. Source base:
`52e74934351c5f07efd071c7f76628af971e159a`; all four source package versions
remain **1.0.5**. This follow-up incorporates the owner's request to repair CI
#158 and review/update every owned npm dependency before publication.

[Machine-readable evidence](data/dependency-refresh-105-20261031.json) contains
the complete direct inventory, package deltas, publisher sources/integrities,
changelog dispositions, independent reviews and final local checks.

## Exact update boundary

The final direct inventory has **67 entries across four packages, 56 unique
names**. All installed/locked direct versions match the captured publisher
`latest` stable snapshot; no prereleases were selected. The final comparison
was captured at **2026-10-31 07:21:19 UTC** and the last Ora update was verified
installed afterward. Future publisher releases are not inferred silently.

There are **28 direct version-entry updates**, plus removal of the now-unused
`selfsigned` development dependency. Root has 48 direct entries, CLI five, tests
two and documentation 12. Explicit runtime/override pins are also reviewed.
Compatible transitive nodes were refreshed with supported npm resolution,
followed by clean locked installation; their publisher parent contracts remain.
A nested dependency can therefore intentionally retain an older major than the
registry's global latest. No incompatible global ASN.1 override was imposed.

| Project | Dependency | Previous lock | Selected lock |
| --- | --- | --- | --- |
| root/ | `@next/third-parties` | 16.4.2 | 16.4.3 |
| root/ | `@node-saml/node-saml` | 5.1.0 | 5.2.0 |
| root/ | `@peculiar/x509` | 2.2.0 | 3.1.0 |
| root/ | `confbox` | 0.3.1 | 0.3.2 |
| root/ | `jose` | 6.2.12 | 6.2.14 |
| root/ | `lucide-react` | 1.63.0 | 1.66.0 |
| root/ | `material-symbols` | 0.47.6 | 0.48.2 |
| root/ | `motion` | 14.7.1 | 14.9.0 |
| root/ | `next` | 16.4.2 | 16.4.3 |
| root/ | `ora` | 9.4.1 | 10.0.0 |
| root/ | `react` | 19.3.0 | 19.3.1 |
| root/ | `react-dom` | 19.3.0 | 19.3.1 |
| root/ | `react-is` | 19.3.0 | 19.3.1 |
| root/ | `sql.js` | 1.14.2 | 1.15.2 |
| root/ | `uuid` | 14.0.2 | 14.0.3 |
| root/ | `zustand` | 5.0.15 | 5.0.16 |
| root/ | `eslint` | 10.12.0 | 10.14.0 |
| root/ | `globals` | 16.5.0 | 17.13.0 |
| root/ | `oxlint` | 1.88.0 | 1.90.0 |
| root/ | `postcss` | 8.5.29 | 8.5.32 |
| cli/ | `react` | 19.3.0 | 19.3.1 |
| cli/ | `react-dom` | 19.3.0 | 19.3.1 |
| tests/ | `vite` | 8.3.3 | 8.3.5 |
| tests/ | `vitest` | 5.0.3 | 5.0.5 |
| gitbook/ | `lucide-react` | 1.52.0 | 1.66.0 |
| gitbook/ | `next` | 16.4.2 | 16.4.3 |
| gitbook/ | `react` | 19.3.0 | 19.3.1 |
| gitbook/ | `react-dom` | 19.3.0 | 19.3.1 |

## Failed CI #158 and the patched matcher migration

[Run 41174137356](https://github.com/ByKitsune/kitsune-router/actions/runs/41174137356)
ran on source `52e7493`. Public job observations show test, documentation and
candidate-package succeeded; only `dependency-security` failed. The owner's
pasted authenticated job transcript explicitly confirms `npm audit
--audit-level=low`, GHSA-g3hv-75wg-m249, minimatch `<11.0.1`, eight moderate
cascade entries and exit 1. That matches the locally reproduced graph; the
private log transcript was supplied by the owner rather than fetched anonymously.

All installed matcher nodes now resolve patched **11.0.3**. Existing legacy
plugins still call a function export, and import/no-internal-modules uses the
removed `makeRe(...).test(...)` interface. A small dev-only adapter preserves the
observed calls using the patched publisher matcher, including its `match`
implementation rather than an older regex engine.

A synchronous public Node loader hook redirects only minimatch imports originating
inside the three actual legacy plugin roots. ESLint/config-array and application
imports retain the native modern exports. Registration is idempotent, plugin
loading is explicit, and the adapter is documented as the audited subset rather
than a universal minimatch 3 replacement. The project minimum Node 22.19 supports
the public hook API introduced in 22.15.

Actual callable/plugin rule fixtures failed before adaptation, then **127 tests
passed on both Node 22.19.0 and 24.19.0**. The real React, accessibility and import
allow/deny policies remain effective. All four original full low-threshold audit
commands now exit zero with no known findings. No audit severity, assertion,
policy, dev-dependency coverage or CI step was weakened. The old run remains a
historical failed SHA; new remote outcomes must be checked against the new push.

## Reviewed breaking and semantic changes

### SAML 5.2 and browser bearer proof

The updated library consumes request IDs through a documented cache operation.
An extra fallback lookup invalidated the former lookup-count heuristic; real
signed fixtures reproduced missing/expired/uncorrelated bearer acceptance. The
application now implements atomic consumption and examines the public accessor
for the signature-verified assertion after native cryptographic verification.

The existing first-timely confirmation policy requires bearer method, exact
initiated request ID, finite expiry and the canonical assertion-consumer URL,
retaining clock skew. A holder-of-key alternative cannot provide browser proof
for an invalid bearer. Response/assertion signing, origin-scoped one-time state,
concurrent/replay denials, invalid-signature consumption and cookie behavior
remain protected. No private library method or unsigned-response reparse is used.

### x509 3 and same-process fixture compatibility

x509 3 is ESM-only and requires a modern Node runtime; actual CJS require(ESM)
and crypto fixtures passed on supported Node 22.19 and 24.19. Its public generation
API remains suitable for the existing certificate generator and retained roots;
the required production loader correction is recorded below.

An initial assumption that PEM-only exchange would isolate selfsigned's older
x509 generation was disproved. Both import orders in one process failed on shared
DI string registrations for `AlgorithmIdentifier`. That earlier review conclusion
was withdrawn explicitly. Both fixture consumers now reuse the existing project
certificate helper; removing unused `selfsigned` eliminates the legacy PKI/ASN.1
subtree. No production certificate/secret migration or forced ASN.1 major was used.

Both-order fixtures exercise actual root/helper generation, signed XML and tamper
denial, SAML metadata and TLS trusted/untrusted/hostname behavior. The production PKI correction is limited to a cached native async import of
the ESM-only dependency inside existing async functions; renewal, generation,
key permissions and trusted-state semantics are unchanged. Actual Next Webpack
initially rejected the old module-evaluation require despite native Node support;
the production build and unpacked-package PKI smoke passed after this bundler
correction. The runtime group passed **222 cases on Node 24** and
**54 crypto cases on Node 22.19**; the latter excludes incompatible Node 24 native
SQLite ABI cases rather than claiming a full Node22 native-install matrix.

### Framework, state, renderer and database behavior

- Next 16.4.3 and its third-party workspace patch are paired with exact React and
  ReactDOM 19.3.1. React's published patch body describes the RSC transport change;
  its tagged CHANGELOG is stale and is not falsely presented as patch evidence.
  Next backports proxy/standalone bootstrap, request-tracing and bundler fixes.
- Globals 17 splits audio-worklet names out of the browser map. The application
  does not use those names as ambient globals; existing browser/node policy is
  retained without broadening its environment.
- Ora 10 was published at 07:01 UTC during this review, then caught by the final
  registry check. It requires Node >=22, compatible with the project >=22.19.
  Actual spinner factory/start/stop/succeed/fail behavior and output/hook/timer
  cleanup passed under Node22/24.
- SQL.js 1.15.2 preserves connection state during export and refuses export within
  an active write transaction. Real export/transaction/durable-adapter regressions
  passed without changing the database adapter or its ownership guarantees.
- Motion/Zustand updates include remount/subscription/timer/SSR behavior. Existing
  focused UI fixtures passed 53 cases; real SSR/store smoke was also exercised.
  All 33 imported Lucide names and 101 statically enumerated font ligatures remain.
  Dynamic icon expressions and actual layout still require the production browser
  gate; font/source comparison alone is not universal UI certification.

## Transitive source and security review

Each group records exact intervals and parent edges. Babel, lint/resolver/shim,
UI/store, crypto/XML, browser data and utility families were reviewed against
publisher release bodies, shipped changelogs, source history or artifact diffs.
Native binding variants share their publisher family source; they are not claimed
executed on every OS/architecture.

The selected es-toolkit 1.53.1 contains publisher fixes for template injection,
prototype operations and timeout cleanup. The old nested WSL powershell-utils
0.1.0 is gone; resolved 0.2.1 is patched for GHSA-x2gq-3jjh-794h. The inspected old
WSL consumer used a constant registry-query command and open already used patched
0.2.1, so removing the affected closure is not evidence of a reachable prior
remote exploit in Kitsune.

Not every publisher provides authored release prose. Empty Material Symbols
bodies, missing standalone helper notes and source-only browser data increments
are identified explicitly. The browser-family report distinguishes ten authored
bodies from 93 empty/source-reviewed release pages; Baseline includes lazy parser
code and is not called pure data. Exact before/target artifacts and API/engine
comparisons supplement these gaps without inventing changelog statements.

Managed CLI runtime pins select SQL.js 1.15.2, supported native SQLite 13.0.3 and
systray2 2.1.4; their isolated supported/legacy graphs audit clean. The existing
unsupported Node<22 helper branch uses latest compatible SQLite 12.11.1, whose
publisher removed Node20/23 prebuilts. That can require compilation and is not a
new claim that the application supports Node20. Existing valid runtime DLL/WASM
is not forcibly replaced under active private state; pins govern fresh/repair
installation. Native Windows/macOS/WSL acceptance remains unrun.

## Final verification and publication boundary

The final full Vitest run passed **10,434 tests, 100 skipped, zero failures across
830 files** (10,534 total cases); the strict report validator confirmed collection
and counts. Full composed lint passed with zero warnings and all four mandatory
full low-threshold npm audits passed with zero known findings. The actual
production Webpack build and CLI pack passed. The unpacked package generated and
verified a certificate with x509 3.1, served a healthy isolated database with
version 1.0.5, and exited cleanly on SIGTERM. The final documentation content
exported 109 HTML pages. Provider, alias and OAuth baselines, package/executable
identity, installed-dependency guards, version consistency and HTTP/2 compatibility
also passed. Indonesian UI coverage has no missing literals among 1,892 checked.

The browser preflight initially exposed that workspace CLI builds skipped the
postbuild runtime-asset copy into the raw standalone directory. The postbuild now
resolves the actual flat or nested generated server before copying its runtime,
static and public closure; missing generated servers fail explicitly. Its existing
private-state scan covers the whole trace, including hoisted dependencies. Browser
path and environment-file checks remain active, with no fallback to a stale output.
Two new regressions reproduced the omission before the fix; all **26 focused
packaging/fixture cases** passed afterward. The complete production Chromium
gate then passed **27/27 cases**, including navigation, routing animation, reduced
motion, pricing, recorded-request detail and discovered account-model selection.
The final 10,434-case full run was repeated after this packaging correction and
includes both added regressions. The mandatory synthetic Usage browser gate
also passed all 19 cases before that full run. An initial runner attempt omitted
the installed Chromium path; its preflight failure is retained in the evidence,
then corrected through the execution environment without changing source.

No real provider login, paid inference or customer database was used. A local
source/tarball or new CI run is separate from npm/GHCR publication, registry
`latest` promotion and production deployment; none of those publication actions
is performed here. Old tags, artifact identities and effective private state stay
intact. See the [closing source review](26-security-stability-and-1.0.5-closing-2026-10-31.md)
and [release notes](../../releases/RELEASE_NOTES_v1.0.5.md).
