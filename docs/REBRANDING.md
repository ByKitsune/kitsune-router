# Kitsune Router rebranding and migration

Status: source 1.0.2 is verified and merged; registry publication is blocked by
npm authorization and an identified GHCR preflight format mismatch. Source
verification is not a claim that registry artifacts have been published.

**Selected immutable release source: 1.0.2 at
`65c8b97d783becab3f1e1210d2ab9ce67992e13b`.** The user elected to retain the failed
`v1.0.0` tag immutably, rather than moving a public tag after GitHub's non-root
runner exposed an ownership-inspection limitation. The v1.0.0 npm/GHCR workflows
stopped before either registry was written. Earlier 1.0.0 candidate evidence below
remains historical proof of that revision, not certification of 1.0.2.

The immutable `v1.0.1` tag remains at
`745834026a5a9f55dffce40c0ad01bf3106e8237`. Its SSH source gate passed
**9,039 tests, 100 skipped/todo, zero failures**, and GitHub PR CI passed.
The separate container-publication gate exposed a millisecond timestamp
collision in `db-scoped-cache.test.js:216` and stopped before login/push.
The npm workflow passed verification/docs/pack, retained its original tarball,
then failed the publish command; the public registry still returned 404 after
that failure. No successful npm/GHCR 1.0.1 publication is claimed.

A real SQLite, cross-process diagnostic at that exact SHA reproduced both
timestamp outcomes while confirming fresh credentials and active status in the
parent cache. Version 1.0.2 controls only the child test clock and exercises both
outcomes; production priority and cache code are unchanged. Quieter npm notice
output preserves terminal publish errors without changing provenance, original
artifact recovery, authorization or immutable-version guards.

The changed cache/readback tests passed 29 targeted cases on SSH; the cache
suite then passed eight consecutive 14-case runs. These are focused intermediate
checks, not substitutes for the final SHA-bound 1.0.2 gate. Five known synthetic
preview runtimes were stopped using PID-bound signals after verifying their
executable, source directory, port and isolated `DATA_DIR`; no live service or
state was replaced.

## Identity contract

| Surface | Target |
| --- | --- |
| Product | Kitsune Router |
| Maintainer / sponsor | ByKitsune — https://bykitsune.com/ |
| Tagline | Your models. Your routes. |
| Description | A provider-neutral AI gateway |
| GitHub | `ByKitsune/kitsune-router` |
| npm | `@bykitsune/router` |
| CLI | `kitsune-router` |
| GHCR | `ghcr.io/bykitsune/kitsune-router` |
| Data directory | `~/.kitsune-router` / `%APPDATA%/kitsune-router` |
| Environment prefix | `KITSUNE_ROUTER_` |
| Extension headers | `x-kitsune-router-*` |
| Tool-provider configuration key | `kitsunerouter` |

The public provider APIs (`/v1/*`, `/v1beta/*`) retain their protocol-defined names. Provider identities and upstream attribution are not project branding.

## Scope

- App, CLI, installer, updater, tray, startup scripts and container distribution.
- All current-language documentation, UI translations, metadata, logos, favicons and share images.
- CI/release metadata and publication guards.
- Runtime storage, credentials and migration regressions.
- GitHub organization/repository profile, descriptions, topics, links and image settings where authenticated access permits.

## Safety boundaries

- Preserve upstream license notices and historical release/evidence records. Historical packages must not be described as newly branded artifacts.
- Never copy live production state to a test/build host. Verification uses synthetic accounts and disposable state.
- Do not rotate encryption/signing keys during a branding migration.
- Prefer a copied, verified migration with the original kept for rollback. Refuse concurrent writers, symlinks, ambiguous legacy sources, damaged state and existing target conflicts.
- An explicit `DATA_DIR` remains authoritative and is not relocated automatically.
- External name availability is point-in-time and does not reserve a name. npm/org registration and publishing require working authorization.
- GitHub organization handle renaming requires an owner action through GitHub settings; changing the display name is not the same operation.

## Initial external audit — 2026-10-27

- `gh` authenticated as `joyccn`; repository admin and organization-owner membership verified.
- GitHub `ByKitsune` and repository `ByKitsune/kitsune-router`: public API returned 404.
- npm `kitsune-router`, `@bykitsune/router`, `@bykitsune/kitsune-router`: registry returned 404. npm CLI authentication is not present on the editing host; existing Actions secret names were inventoried without reading their values.
- Docker Hub `bykitsune/kitsune-router`, PyPI `kitsune-router`, crates.io `kitsune-router`: no public listing returned. Their absence does not prove namespace ownership or registration eligibility.
- Composio Cloudflare connection **ByKitsune** verified by the active `bykitsune.com` zone. The account-list action has a header-format error; the zone-list action works. Do not switch to the unrelated connection to bypass it.
- Build host `172.232.237.191` is reachable; `172.233.81.214` timed out.

## Completed external changes

- GitHub repository ID `1348441164` was renamed in place to `kitsune-router`;
  the owner then completed the organization-handle rename. Canonical URL is now
  https://github.com/ByKitsune/kitsune-router. Repository history and permissions
  remain on the same repository ID; organization ID `321756995` is unchanged.
- Organization display name, public description, website, and public support
  email identify ByKitsune. Both the display name and login are now `ByKitsune`,
  verified through the authenticated public API after the owner action.
- Repository description, homepage and topics now identify the provider-neutral
  Kitsune Router product. Local `origin` follows the actual current path.
- All 26 existing GitHub releases now carry a Kitsune Router archive title and
  migration notice. Their original tags, asset names, and attached bytes remain
  unchanged and are not advertised as rebranded builds.
- Editable SVG and derived PNG/ICO artwork were produced for product, PWA, tray,
  favicon and repository/social use. Uploading organization avatars and custom
  repository social previews requires a GitHub owner web session.

## External work still requiring authorization

- Organization handle rename is complete. Avatar and custom social-preview
  controls require an authenticated owner web session. The owner reported the
  profile/avatar complete and requested the ByKitsuneV2 favicon for the README
  header; that exact asset is included as `public/brand/bykitsune-favicon.png`.
  API readback still reports no custom repository Open Graph image, so a profile
  avatar is not being misreported as a custom social-preview upload.
- Authorize publication of `@bykitsune/router`. A user-authorized temporary token authenticated as
  `bykitsune` and replaced the official Actions `NPM_TOKEN` secret. Scope
  membership read returned 403; actual publishing permission remains a registry
  gate, not an inference from the username or secret's existence. The 1.0.1
  publish command failed; its verbose file listing obscured the terminal npm
  reason, so no cause is retroactively assigned to that attempt. Version 1.0.2
  produced readable **E403** diagnostics: npm requires two-factor authentication
  or a granular token configured for authorized non-interactive publication.
  The owner selected direct replacement of the repository Actions `NPM_TOKEN`,
  without disclosing its value here. Confirmation is still pending. Temporary
  credentials disclosed in chat must be revoked after use.
- Cloudflare account and Pages reads now succeed through Composio CLI toolkit
  `cloudflare_api_key`, alias **ByKitsune**, against official account
  `4f243094abd8315b58c0a850380dc457`. Its Pages project list was empty at readback.
  Toolkit `cloudflare` uses a different authentication format and still fails;
  DNS reads on `bykitsune.com` also returned an authorization error. No custom
  domain/DNS write is authorized by a successful account/Pages read alone.
  Never switch to the unrelated account to bypass this boundary.
- Documentation project `kitsune-router-docs` was created in that official
  account. The latest verified preview is deployment
  `d3544c04-2973-48dd-adce-aae654617129`, source `74583402`,
  at https://rebrand-candidate.kitsune-router-docs.pages.dev/en/. Composio
  performed account/project/asset operations and readback; its multipart proxy
  could not forward the final manifest. The user explicitly authorized Wrangler
  for that final deployment. Public readback confirmed the source SHA and
  successful preview stage. No production custom-domain or DNS record changed.

## Additional name checks

Public checks also found no listings for `kitsune-router-app`,
`kitsune-router-docs`, JSR scope `bykitsune`, Packagist `bykitsune/router`,
NuGet `KitsuneRouter`, or RubyGems `kitsune-router`. These registries are not
publication targets for this JavaScript project. Docker namespace ownership
could not be established. The bare word **Kitsune** is used by unrelated
software projects (including Mozilla's support platform); no trademark/legal
clearance is implied by an exact compound-name registry lookup.

## Release gate

Do not call this complete until names are owned, source consistency checks pass, migration tests pass, all required offline suites/lint/build/docs/package checks pass, screenshots have been reviewed at desktop/tablet/mobile sizes, and remaining external owner-only steps are explicitly recorded.

## Initial candidate verification — 2026-10-27

All expensive work ran on the isolated SSH verification host, not the editing
server. No production database, provider credential or environment file was
copied into these fixtures.

- Source inventory SHA-256 before this evidence update:
  `937364bfd696be61e6c3d33a9aee4c2741983a08aeebe28620670333f77b1c50`.
  This identifies file contents, not a Git revision or a published artifact.
- Full Router suite: **9,028 passed, 100 skipped/todo, 731 files, zero failed
  assertions or suites**. The unchanged report gate accepted the results.
- Strict composed lint: **zero warnings, zero errors**. Brand and release
  identity/version gates passed for all four manifests/locks and the CLI bin.
- Baseline provider definitions (82), aliases (117), and OAuth URLs remained
  byte-for-byte equal; the separate CJS h2c compatibility test passed.
- Dependency entries/ranges/resolutions/integrities are unchanged in all four
  projects. `npm audit --audit-level=low` reported zero vulnerabilities for
  root, CLI, tests and documentation at the time checked; this is not an OS
  container scan or a permanent security guarantee.
- Documentation: 18 tests and static export passed. Desktop/tablet/mobile
  landing inspection reported zero blocking findings; approved-family palette
  and software UI imagery advisories are explained in `BRAND.md`.
- Native Linux Bun 1.4.4 migration smoke used its real `bun:sqlite`, retained
  SQLite content and keys/secrets, and preserved the source. Native Windows and
  macOS migration/trust-store execution remain unverified.
- A bounded native Node 22.23.4 smoke as UID 65534 detected a real open fixture
  database and migrated it safely after close with a fixture-owned process
  inventory. The unmodified host-wide scan correctly refused beside a controlled
  same-UID process with uninspectable descriptors. This is evidence of the
  fail-closed policy, not a general non-root automatic-migration guarantee.
- Earlier isolated tarball install/runtime/upgrade and Docker restart smokes
  passed, but **those intermediate bytes are not final release artifacts**.
  Rebuild/repack/container checks must be tied to the frozen source revision
  after the final fixes, including shared CLI/container secret resolution.

The separate ByKitsune integration candidate is in
`/root/ByKitsune-router-integration`; `/root/ByKitsuneV2` was not modified. Its
source inventory is
`2e7c2402d8ada9710e666f6adb5a42b03dc2e0d429024a5ab6ca7e773d1d91b4`.
Strict lint/build, 61 immutable migration definitions, 153 schema objects,
1,276 server tests (plus the existing Windows exclusion), 20 infrastructure
tests and six browser-infrastructure tests passed. Complete browser lanes also
passed: **1,164 production cases and 141 development cases**, with the configured
fail-on-flaky policy unchanged. Server results were rerun successfully against
integration commit `21bfb3312af80150e43b79a82bc919756d4d4dee`.

The initial Router candidate was commit
`9dd5e1f8b2e9fb24b783a3680b1cc5ad1f50b167`; a follow-up fixes verified native-dialog
focus return and records the completed organization rename. Re-run the shared
commit-bound source gate and rebuild artifacts at the follow-up revision before
promoting it. Those early branch pushes did not replace production services.

## Merges and immutable attempt evidence

- Router [PR #1](https://github.com/ByKitsune/kitsune-router/pull/1) merged to
  `master` at `ce752a9fa0385a58a70c25865b21219f7416876d`, after GitHub CI
  [40463259397](https://github.com/ByKitsune/kitsune-router/actions/runs/40463259397)
  passed. The v1.0.1 tag remains on its verified ancestor `74583402`.
- Companion [PR #6](https://github.com/joyccn/ByKitsuneV2/pull/6) merged to
  `main` at `73a14982f6ae7aa438268f2c654438940cf3c3e0`, after its full gate
  passed. `/root/ByKitsuneV2` and live production processes were not updated or
  restarted.
- v1.0.1 exact SSH source report SHA-256:
  `111d3c2dbac4de647493900bddfb552e80114e036f0359fd9e9b01e36ea3007f`.
  Separate locally built tarball SHA-256:
  `2067e23982b245f3c063aaaf9f880b967b1a50dbce82b900cc0e4242fa340dfd`;
  isolated install/runtime/upgrade and container restart smokes passed. These
  bytes are not the original GitHub publication artifact.
- Original npm CI artifact ID `12716498091`, workflow
  [40465152995](https://github.com/ByKitsune/kitsune-router/actions/runs/40465152995),
  tarball SHA-256
  `f00e2f581631065a9afa4719999487bf2f5eba31c096393d2a9141fb13bd55e8`.
  It is retained privately after the failed publish, not relabeled as 1.0.2.
- Container workflow
  [40465152324](https://github.com/ByKitsune/kitsune-router/actions/runs/40465152324)
  reported 9,038 passing assertions and one timestamp-order assertion failure;
  its report is retained separately from the successful SSH/PR reports.
- Version 1.0.2 requires its own final source SHA, complete gates, original
  publication tarball, registry readback, container digest/provenance/SBOM, and
  published-artifact smokes. Earlier pass counts cannot certify that revision.

## Verified 1.0.2 source and blocked publication

- Immutable tag `v1.0.2` points to `65c8b97d783becab3f1e1210d2ab9ce67992e13b`.
  [PR #2](https://github.com/ByKitsune/kitsune-router/pull/2) merged to `master`
  at `23375bf121e926f2d2b1330d3c2b8c124a639b40` after all checks passed.
- Exact SSH gate: **9,041 tests passed, 100 skipped/todo, zero failed assertions
  or suites**; strict lint, identity/baseline/provider/alias/OAuth/h2c checks,
  root build, 18 docs tests, static export and CLI pack passed. Source report
  SHA-256: `a892d4549459b8de6de8d97a8a3ad397e257733f543a02a23fcfa60a5f535840`.
  [GitHub CI 40468830176](https://github.com/ByKitsune/kitsune-router/actions/runs/40468830176)
  passed the same counts on PR merge SHA `641d13ef`, whose tree matches the
  selected source. These are distinct source reports, not interchangeable SHAs.
- Local tarball SHA-256
  `9b98ba6a4bfdd92e6b3ad99d077f511e67ce921476048fce9c93fc44b1cfb4b2` passed
  isolated install/help/version/video-help/runtime/upgrade checks. Originals and
  keys were retained, secrets were `0600`, runtime exited gracefully. The local
  container passed six start/restart scenarios across `/app/data` and custom
  `/var/lib/kitsune-router`; image ID
  `sha256:92aeda74d937e440bae4643523beaac9bc33addab1e9d5b18544c0ce6d0dfbec`.
  These are local evidence, not registry artifacts.
- Browser login and native-dialog focus return passed. At 390 px,
  `scrollWidth` was 390; reduced motion had zero active animations. Rendered
  desktop/light/dark/mobile screenshots were reviewed. Preview test processes
  and smoke containers were stopped; no production service was changed.
- [npm workflow 40469972263](https://github.com/ByKitsune/kitsune-router/actions/runs/40469972263)
  passed source/docs/pack and saved original CI artifact **`12718343077`**,
  tarball SHA-256
  `a52d736ade6b8cbcf17ba114c9b55018956a7f1b35c4280edcae2912de8a3114`.
  npm rejected publication with E403 two-factor/granular-token policy; public
  readback remained 404. GitHub Release creation was not reached. Recovery must
  reuse those original bytes, not the independently built SSH tarball. The
  recovered original CI bytes independently passed install/help/runtime/upgrade
  smoke on SSH, with originals/keys retained, secrets `0600`, and graceful exit 0.
- [GHCR workflow 40469972099](https://github.com/ByKitsune/kitsune-router/actions/runs/40469972099)
  passed source verification and login, then stopped before build/push: Buildx
  emitted `not found`, while the original guard accepts only `manifest unknown`.
  A separate authenticated registry read returned grant HTTP 200 followed by
  manifest HTTP 404 with structured **`MANIFEST_UNKNOWN`**; the authenticated
  organization container inventory was empty. Generic 404s remain ambiguous.
- The owner authorized a separate reviewed recovery workflow. Its tooling source
  and immutable runtime source are checked out and verified separately; it
  classifies absence only from authenticated structured registry evidence,
  retains original digest/config/source/provenance/SBOM checks, and builds from
  the full release commit. This changes release tooling, not the v1.0.2 tag or
  runtime. Registry publication/readback remain pending until actually verified.
  Focused registry/recovery checks include real annotated Git references and the
  actual workflow validation shell; denied grants, unsafe refs, HTML/malformed
  JSON, mixed registry error codes, oversized responses and digest mismatches are
  rejected. No broad interpretation of Buildx `not found` is added.

Recovery tooling PR #3 merged at
`487d7934a4bea92bb046382ee39dc474dc8f7711` after **9,084 passing tests,
100 skipped/todo, zero failures**, strict lint/build, 18 docs tests and export.
Those tooling results are separate from the runtime tag's 9,041-case gate.
Its first dispatch, `40483141695`, stopped before registry access because the
source gate received the reserved GitHub tooling SHA despite a step environment
override. The follow-up passes a validated source context directly to the
immutable source's original `verifySource` API; it does not change the source
tag, weaken the SHA assertion or rely on overriding GitHub's default variables.
