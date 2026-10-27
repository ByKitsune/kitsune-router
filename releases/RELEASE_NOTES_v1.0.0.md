# Kitsune Router 1.0.0 — attempted release, not published to npm/GHCR

**Your models. Your routes.**

**Status: attempted tag retained; npm/GHCR publication failed.** Immutable tag [`v1.0.0`](https://github.com/ByKitsune/kitsune-router/tree/v1.0.0) points to `390a65677c06a30084386d2a2adf8b0c48709281`. The release workflow failed on the non-root process-ownership scan; no `@bykitsune/router@1.0.0` package or canonical GHCR 1.0.0 image was published. This source tag is not an installable registry release and will not be moved.

The first follow-up was [1.0.1](RELEASE_NOTES_v1.0.1.md), whose immutable tag is retained after failed publication workflows. The current **1.0.2 source is verified, with registry publication blocked**; see the [current notes](RELEASE_NOTES_v1.0.2.md) and [installation guide](../docs/INSTALLATION.md). The original 1.0.0 scope and intended targets below remain historical; the candidate's recorded **9,029 passing tests** do not certify publication or later source versions.

Kitsune Router continues ZenRouter and its 9Router lineage under the maintenance and sponsorship of [ByKitsune](https://bykitsune.com). It is a provider-neutral, local-first AI gateway. Choose your own upstream accounts and model/fallback order; no ByKitsune login, subscription or preferred routing destination is required. Configured upstreams still receive your inference requests.

## New identities

| Surface | 1.0.0 target |
| --- | --- |
| Repository | [`ByKitsune/kitsune-router`](https://github.com/ByKitsune/kitsune-router) |
| npm | `@bykitsune/router` |
| Executable | `kitsune-router` |
| Client provider key | `kitsunerouter` |
| Canonical container | `ghcr.io/bykitsune/kitsune-router` |
| Default local state | `~/.kitsune-router` / `%APPDATA%\kitsune-router` |
| Project environment prefix | `KITSUNE_ROUTER_*` |
| Extension headers | `x-kitsune-router-*` |

Standard `/v1/*`, `/v1beta/*` and port **20128** are unchanged. Provider keys are not shell commands: use `model_provider = "kitsunerouter"` and `[model_providers.kitsunerouter]` in Codex, not a hyphenated bare JavaScript identifier. Re-apply tool presets deliberately; old command/provider-key aliases are not required.

## Upgrade without losing state

1. Stop the original gateway, tray and MITM/tunnel helpers. Back up the **entire private data directory**, including SQLite, `secrets.json`, `machine-id`, `auth/` and `mitm/`.
2. If you already set `DATA_DIR`, keep it and the same container volume. Explicit `DATA_DIR` prevents automatic relocation.
3. Otherwise, first startup can discover `~/.zenrouter` or `~/.9router` and create `~/.kitsune-router`. It checks source ownership/safety, snapshots SQLite consistently, verifies retained files, and keeps originals. It never merges or overwrites an existing destination.
4. Verify accounts, keys, combos, usage and optional interception. Preserve existing encryption salts and trusted certificate roots; their historical names are not a reason to replace them.
5. Update environment names and external-tool configuration. Standard API base URLs need no protocol/port rename. Keep your backup until the installation has been checked.

Destination locks and an incomplete marker keep partial migration state unavailable until publication is verified. Native SQLite snapshotting supports supported Node and Bun runtimes; no unsafe raw-file fallback is used. Startup recognizes legacy-prefixed operator settings without rewriting files; current explicit names win and process-only peer-proof tokens are not imported. An existing implicit SAML entity ID is retained when no custom issuer was stored; fresh installations use `urn:kitsunerouter:sp`.

See [MIGRATION.md](../docs/MIGRATION.md) for custom sources, skip controls, refusal cases and rollback. Rollback does not merge new writes back into the old directory.

## Archived installation targets — not available from this attempt

These were the draft's intended 1.0.0 targets, not successfully published artifacts. Keep them as historical records; do not run them as current installation guidance. Use the current 1.0.2 instructions only after that version is actually published and verified.

Requires **Node.js >=22.19.0**:

```bash
npm install -g @bykitsune/router@1.0.0
kitsune-router
```

The container publication workflow targeted **linux/amd64 only** and `ghcr.io/bykitsune/kitsune-router:1.0.0`, with persistent `/app/data`. No canonical 1.0.0 image was published by this attempt. A Docker Hub mirror was optional, not guaranteed. See the current [installation](../docs/INSTALLATION.md) and [Docker](../DOCKER.md) guides for the follow-up.

Source `next dev` does not run the CLI's secret generator. Fresh source installs must generate and retain a private strong `JWT_SECRET` of at least 32 characters; existing installations must retain their effective JWT/API/identity secrets and state path instead. The [source recipe](../docs/INSTALLATION.md#source-checkout) distinguishes those cases and never uses a publicly known session secret.

## Documentation and provenance

Current docs use neutral multi-provider language, accurate package/command/provider-key examples and explicit cost/availability limits. Compression has no guaranteed savings percentage; estimates are not invoices; a listed model is not proof of entitlement or live access. Remote deployment requires an operator-managed authenticated HTTPS service, not an assumed hosted Kitsune endpoint.

Earlier 0.x release notes, audits, package names, artifact URLs, source hashes and evidence paths are preserved as archives. **Kitsune Router 0.x artifacts are not invented by this rebrand.** Existing upstream copyright/license notices and contributor credit remain.

## Historical verification and attempt outcome

- Retained source tag: `v1.0.0` at **`390a65677c06a30084386d2a2adf8b0c48709281`**. Creating that tag did not establish successful registry publication.
- An earlier frozen inventory passed **9,028 Router tests (100 skipped/todo)** with strict zero-warning lint, baseline and compatibility gates. The later recorded **1.0.0 candidate result was 9,029 passing tests**. Keep those snapshots distinct; neither count verifies 1.0.1. See [the rebrand ledger](../docs/REBRANDING.md). Intermediate smoke artifacts are not final published release bytes.
- Prior baseline supplied for planning: **8,845 passed, 100 pending/skipped, zero failures before rebrand changes**; this is not a verified result for 1.0.0 or the current tree.
- Attempt outcome: **workflow failure on the non-root ownership scan; npm 1.0.0 and canonical GHCR 1.0.0 not published**. Retain the tag and address the failure in 1.0.1, not by replacing the old tag's source.
- Original tarball integrity/provenance, image digests/SBOM and registry readback were not established as a successful 1.0.0 publication. Follow-up authentication/permission work is recorded with 1.0.1; it does not retroactively publish 1.0.0.
- Synthetic tests do not establish live provider entitlement, regional availability, delivered speed, quality or billing. No production deployment is implied.

See the [technical changelog](../docs/CHANGELOG_v1.0.0.md), [full changelog](../CHANGELOG.md) and [rebranding checklist](../docs/REBRANDING.md).
