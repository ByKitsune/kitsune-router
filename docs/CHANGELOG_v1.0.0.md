# Kitsune Router 1.0.0 technical changelog — attempted, not published to npm/GHCR

**Status: immutable tag retained after a failed publication attempt.** `v1.0.0` points to `390a65677c06a30084386d2a2adf8b0c48709281`. The workflow failed on the non-root process-ownership scan; no npm 1.0.0 package or canonical GHCR 1.0.0 image was published. This document preserves the attempted release's scope, not a successful registry release. [Attempt record](../releases/RELEASE_NOTES_v1.0.0.md) · [1.0.1 attempt](CHANGELOG_v1.0.1.md) · [Current 1.0.2 follow-up](CHANGELOG_v1.0.2.md) · [Complete changelog](../CHANGELOG.md) · [Migration](MIGRATION.md).

## Identity contracts

- Product: **Kitsune Router — Your models. Your routes.** Maintained/sponsored by [ByKitsune](https://bykitsune.com), without a required account or provider priority.
- Repository target `ByKitsune/kitsune-router`; npm `@bykitsune/router`; binary `kitsune-router`; canonical image `ghcr.io/bykitsune/kitsune-router`.
- External-client provider identifier **`kitsunerouter`** is intentionally different from the executable. Codex tables use `[model_providers.kitsunerouter]`; OpenCode provider/model prefixes use `kitsunerouter`. No old binary/provider-key alias is required.
- Project environment prefix **`KITSUNE_ROUTER_*`** and extension headers **`x-kitsune-router-*`** replace project-specific old branding. Unprefixed secret values and `DATA_DIR` keep their meanings. Standard `/v1/*`, `/v1beta/*` and port **20128** stay stable.

## Data migration boundaries

`cli/hooks/dataDirectory.js` is the shared state resolver. It must run before database, runtime-secret or certificate initialization.

- Explicit `DATA_DIR` is authoritative and is not relocated.
- Default discovery selects `~/.zenrouter` or `~/.9router` (Windows equivalents under `%APPDATA%`) for migration to `~/.kitsune-router`.
- The source must be stopped, safe and unambiguous. Migration refuses symlinks/special files, busy/damaged sources, unresolved ownership and destination overwrite rather than silently creating an empty installation.
- A private staged copy includes persistent state, verifies copied content and uses an integrity-checked SQLite-consistent snapshot. A destination lock and incomplete marker keep partial state unavailable until destination publication is verified; existing directories are never overwritten. The original remains available. `.migration.json` records private verification inventory, not plaintext credential values.
- Preserve `secrets.json`, `machine-id`, auth keys and MITM roots/keys. Runtime dependencies, temporary files, stale PIDs/sockets and caches are regenerated, not copied as active state.
- Existing crypto derivation constants stay unchanged. Existing trusted certificate subjects/private keys are retained rather than replaced cosmetically.
- Containers retain their explicit `/app/data` mount. Host discovery does not migrate an invisible legacy mount. Rollback requires stopping the new writer; newer state is not merged backwards.
- Snapshotting supports the native APIs of supported Node (`node:sqlite`) and Bun runtimes, with no unsafe raw-file fallback when unavailable.
- Startup migration recognizes legacy-prefixed operator settings without rewriting environment files; explicit current names win, and process-only peer-proof tokens are never imported. Preserve the effective source-deployment secrets instead of generating new values for old state.
- Preserve an existing effective legacy SAML entity ID, including empty/null stored values that selected the old fallback. Use a transaction and settings-revision invalidation so concurrent settings updates are not lost. Fresh installations use `urn:kitsunerouter:sp`; nonempty custom issuers are unchanged.

## Documentation coverage

Root guides, translated READMEs, GitBook content, architecture/integration/operations references, changelog and release drafts are reconciled with these contracts. Unsupported unlimited-access, fixed-savings, invented cloud-sync and historical Kitsune 0.x publication claims are removed from current instructions. Dated audits/releases retain source names, hashes, evidence paths and original artifact records under archive notices; they are not fresh verification.

Fresh source recipes explicitly generate a strong private `JWT_SECRET` once: `next dev` is not the launcher secret-setup path, and missing/short secrets make dashboard login fail. Source migrations retain existing effective secrets and absolute state paths; `.env` stays private and uncommitted.

## Historical release gate ledger

| Gate | State |
| --- | --- |
| Retained 1.0.0 source tag | `390a65677c06a30084386d2a2adf8b0c48709281`; immutable, not moved for the follow-up |
| Recorded 1.0.0 candidate tests | 9,029 passed; historical candidate evidence, not 1.0.1 verification |
| Release workflow | Failed on the non-root process-ownership scan |
| npm 1.0.0 package publication | Not published by the attempt |
| Canonical GHCR 1.0.0 image publication | Not published by the attempt |
| Original tarball/image integrity and registry readback | No successful 1.0.0 publication established |

The supplied pre-change remote baseline of 8,845 passes, 100 pending/skipped and zero failures is planning context only. It does **not** certify renamed code, migration or a 1.0.0 artifact. No local costly suite/build, live inference, deployment, commit or publication is claimed. See [tests](../tests/README.md) and the [rebranding checklist](REBRANDING.md) for the final owner's verification workflow.

The earlier 9,028-pass frozen inventory remains a separate historical snapshot in the release notes. The first follow-up, **1.0.1**, retains its own immutable source tag and failed publication record. See the [current 1.0.2 evidence](CHANGELOG_v1.0.2.md): source verified, registry publication blocked. Production ownership remains fail-closed for unreadable same-UID state. Current pins move forward; old tags, source evidence and unpublished-target history do not.
