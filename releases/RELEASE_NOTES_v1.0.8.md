# Kitsune Router 1.0.8 — runtime retention and publication-readback follow-up

Date: **2026-11-05**. Version **1.0.8** fixes managed runtime dependency retention
and extends bounded registry readbacks. Publication requires full exact-source
CI and a normally installed final-candidate smoke. See the [publication receipt](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)
for actual channel availability and final-artifact verification.

- Retain exact optional SQLite/tray pins atomically before runtime fast paths,
  adopt existing unsaved states and validate installed versions. Saved exact
  installs preserve siblings; supported N-API paths avoid native build tools.
- Deny only the exact managed native N-API build lifecycle under npm 11.17;
  preserve unrelated script decisions and reject malformed policy maps unchanged.
- Isolate a one-time global script approval from nested local runtime installs,
  preserving parent/persistent policy, strict checks, registry auth, proxy and CA.
- Preserve unrelated/invalid runtime manifests, local-project selection and
  existing registry/proxy/authentication/CA settings; optional failures remain
  visible. The dependency graph is unchanged, including Undici **8.12.4**.
- Allow **24 bounded registry readbacks / 571 seconds of total backoff**, capped
  at 30 seconds per delay. Do not repeat publish/tag writes; retain original bytes
  on exhaustion and keep auth/network/malformed failures terminal.

## Recorded validation and release gates

The retention/script-policy cluster passes **34 focused tests under npm 11.17**,
covering real npm retention/upgrade, policy preservation and invalid manifests.
Policy-only and malformed-manifest cases intentionally avoid package installation;
real npm cases use local fixture registries. Successful retained cases have zero
second-start installs. The registry-readback cluster passes **54 focused tests**. These
controlled fixtures do not establish a published 1.0.8 package or native runtime.

A separate working-tree local precheck passes ordinary lifecycle-enabled install
and two offline CLI starts on official Node 22.19.0 as UID 1000: native 13.0.3 and
tray 2.1.4 retained, health/login/1,082 models, session/key/secret persistence,
0600 modes, no observed startup npm calls or dependency/cache changes, zero runtime
diagnostics, graceful stops and cleanup. It uses no injected native, NODE_PATH or
SQL.js opt-in. That local proof is based on b7 plus recorded changes, not the final
CI candidate or release artifact. Final committed-source CI/runtime and
publication results are recorded separately in the publication receipt.

## Tagged-source and CI-candidate verification

Immutable `v1.0.8` identifies `1314af7b228e91226be4e8bbc3beff962dd5ae60`.
Both exact-source CI runs pass 11,042 tests with 99 gated skips, zero failures,
866 files and 32 browser cases without retries each. Fresh normal global-install
candidates on Node 22.19 and Node 24.19/npm 11.17 pass all four offline CLI starts
with retained state, no observed startup npm calls and zero runtime diagnostics.
The npm 11.17 lane reviews the exact local-file own-CLI lifecycle only. Actual
published artifacts retain their separate verification in the live receipt;
see the [registry installation guidance](https://github.com/ByKitsune/kitsune-router/blob/v1.0.8/docs/INSTALLATION.md#npm-1117-script-review)
for the one-time exact-version global approval. No such flag is added to NPX or
source/project installs.

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
available. See the [final aggregate](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/data/publication-108-final-verification-20261105.json),
[final npm proof](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/data/publication-108-npm-final-20261105.json) and
[live publication receipt](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) for original-byte,
registry-propagation, cryptographic, runtime and access boundaries.

## Why this is a new patch

npm, canonical GHCR and GitHub Release **did publish 1.0.7** from immutable
`b7f77d07`; its original archive/assets and Docker digest are preserved. Normal
installation exposed sequential `--no-save` SQLite/tray installs pruning each
other. The measured offline CLI did not reach health in 30 seconds during silent
synchronous self-healing; no terminal/default-driver or hard database failure was
proven. Overall cancellation of continuation42080159497 occurred after Release
creation succeeded and does not undo that publication. The 1.0.8 source follow-up
does not rename, replace or conceal those published bytes or known issue.

See the [technical notes](https://github.com/ByKitsune/kitsune-router/blob/v1.0.8/docs/CHANGELOG_v1.0.8.md),
[actual publication/issue record](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md),
[1.0.7 notes](https://github.com/ByKitsune/kitsune-router/blob/v1.0.7/releases/RELEASE_NOTES_v1.0.7.md), [full changelog](https://github.com/ByKitsune/kitsune-router/blob/v1.0.8/CHANGELOG.md#108--2026-11-05)
and [migration guide](https://github.com/ByKitsune/kitsune-router/blob/v1.0.8/docs/MIGRATION.md). Preserve complete existing private
state and secrets. Actual GitHub/npm/GHCR 1.0.8 outcomes are recorded separately;
no live-provider acceptance, production deployment or native Windows/macOS result
is claimed here.
