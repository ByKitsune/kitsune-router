# Kitsune Router rebranding and migration

Status: implementation candidate verified offline; final artifact gates and
external namespace authorization remain separate. No release publication is
implied by this document.

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
  current URL is https://github.com/ZenRouter/kitsune-router until the owner
  completes the organization-handle rename. Repository history and permissions
  remain on that same repository ID.
- Organization display name, public description, website, and public support
  email now identify ByKitsune. The **login is still `ZenRouter`**, not
  `ByKitsune`; a display-name update does not satisfy that remaining step.
- Repository description, homepage and topics now identify the provider-neutral
  Kitsune Router product. Local `origin` follows the actual current path.
- All 26 existing GitHub releases now carry a Kitsune Router archive title and
  migration notice. Their original tags, asset names, and attached bytes remain
  unchanged and are not advertised as rebranded builds.
- Editable SVG and derived PNG/ICO artwork were produced for product, PWA, tray,
  favicon and repository/social use. Uploading organization avatars and custom
  repository social previews requires a GitHub owner web session.

## External work still requiring authorization

- Rename the organization handle through GitHub's owner settings. The public
  organization update REST API and GraphQL mutations do not support changing
  this login; do not claim completion or invent an undocumented write route.
- Create/claim npm organization `bykitsune` and authorize publication of
  `@bykitsune/router`. No npm authentication is available on the editing host.
  An existing secret's name is not evidence of its scope or validity.
- Cloudflare zone reads work via the ByKitsune Composio CLI connection, but
  account/Pages/DNS operations returned authentication/header errors. No DNS or
  deployment mutations have been attempted. Reauthorize that same connection;
  never switch to an unrelated account just because it accepts a request.

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

## Candidate verification — 2026-10-27

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
tests, six browser-infrastructure tests, and targeted browser lanes (74
production / 25 development) passed. Complete browser-lane verification and
commit-bound evidence remain separate from those targeted results.
