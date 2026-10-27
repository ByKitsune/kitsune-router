# Kitsune Router 1.0.1 — release candidate

**Your models. Your routes.**

**Status: user-selected next version; pending final tag/SHA verification and publication.** This draft does not establish a v1.0.1 tag, a passing final suite, an npm package, a GHCR image or a production deployment.

Kitsune Router is the provider-neutral, local-first continuation of ZenRouter/9Router, maintained and sponsored by [ByKitsune](https://bykitsune.com). You choose models, accounts and routing order. No ByKitsune account or hosted API purchase is required; configured upstreams still receive your inference requests.

## Why 1.0.1 instead of replacing 1.0.0?

The immutable [`v1.0.0` tag](https://github.com/ByKitsune/kitsune-router/tree/v1.0.0) remains at **`390a65677c06a30084386d2a2adf8b0c48709281`**. Its workflow failed on the non-root process-ownership scan, before npm/GHCR publication. **No npm 1.0.0 package or canonical GHCR 1.0.0 image was published.** A source tag is not a published registry artifact.

The recorded **9,029 passing tests** belong to that 1.0.0 candidate, not the 1.0.1 follow-up. The earlier 9,028-pass frozen inventory is also retained as its own snapshot. Neither count may be reused as final v1.0.1 proof. See the [1.0.0 attempt record](RELEASE_NOTES_v1.0.0.md).

## Follow-up scope under finalization

- **Deterministic ownership regression harness:** isolate tests to owned synthetic process inventories and add denial coverage after the workflow failure. **Production migration ownership checks are unchanged**: native/same-UID unreadable state still fails closed. This is not a general non-root migration allowance. Scoped interim evidence is recorded below; final all-source/tag-bound verification remains pending.
- **Mobile API-key row wrapping:** keep long endpoint keys and their controls usable on narrow screens. Integration, responsive inspection and regression checks must be completed against the final source.
- **Current documentation:** pin installation examples to 1.0.1, distinguish authenticated npm identity from publishing authorization, and preserve the immutable 1.0.0 attempt and original 0.x archives.

These are candidate changes, not verified final-release claims. This docs-only pass runs no costly suite/build or live-provider inference.

## Identity and migration contract

| Surface | Identity |
| --- | --- |
| Repository | [`ByKitsune/kitsune-router`](https://github.com/ByKitsune/kitsune-router) |
| npm package | `@bykitsune/router` |
| Executable | `kitsune-router` |
| Client provider key | `kitsunerouter` |
| Canonical container | `ghcr.io/bykitsune/kitsune-router` |
| Default state | `~/.kitsune-router` / `%APPDATA%\kitsune-router` |
| Project environment / extension headers | `KITSUNE_ROUTER_*` / `x-kitsune-router-*` |

Standard `/v1/*`, `/v1beta/*` and port **20128** are unchanged. Stop the old gateway and helpers and back up the entire private state before switching. Explicit `DATA_DIR` stays authoritative; default migration can verify/copy stopped `~/.zenrouter` or `~/.9router` while keeping originals and refusing destination overwrite. Preserve SQLite, `secrets.json`, `machine-id`, `auth/`, `mitm/`, effective encryption derivation inputs, SAML issuer and trusted roots. Keep the existing container volume/mount at the effective absolute `DATA_DIR`, `/app/data` by default or a supported custom path.

On restricted Linux, do not ignore unreadable ownership. Stop/back up the old state, retain it in place with explicit `DATA_DIR` (no relocation), or obtain privileged review. The regression-harness change does not bypass the production safety check.

Read [MIGRATION.md](../docs/MIGRATION.md), [installation](../docs/INSTALLATION.md) and [integrations](../docs/INTEGRATIONS.md). Fresh source `next dev` requires a private strong `JWT_SECRET` of at least 32 characters; it does not use the launcher's secret generator. Existing installations must keep their effective secrets, not regenerate them for a version change.

## Install only after publication

Requires **Node.js >=22.19.0**:

```bash
npx @bykitsune/router@1.0.1
# Or:
npm install -g @bykitsune/router@1.0.1
kitsune-router
```

The image target is `ghcr.io/bykitsune/kitsune-router:1.0.1`, **linux/amd64 only**, subject to successful publication and digest/access verification. A Docker Hub mirror is optional, not assumed. See [Docker](../DOCKER.md).

## External status and final gates

Interim targeted checks reported **58 regression cases plus eight denial cases**. A bounded native Linux check as **UID 65534** refused an open owned source, migrated after it was closed, and preserved the refusal when host-wide ownership could not be inspected. These checks do not certify arbitrary Linux process visibility, general non-root migration, other platforms or the final 1.0.1 source tag.

- GitHub organization/repository are confirmed; their registration is not still an assumed future step.
- npm now authenticates as **`bykitsune`** and Actions credentials were updated. This does **not** prove organization/package publishing permission, an accepted publish or a readable package version. Those checks remain pending.
- Final **v1.0.1 tag and source SHA**, tests/suite failures, lint/build, packed CLI/container migration and responsive verification: **pending**. Keep all evidence tied to that final source/artifact.
- npm original tarball integrity/provenance and readback, canonical GHCR visibility/digests/SBOM and any mirror: **pending**. Do not announce availability from authentication or tag creation alone.
- [Cloudflare documentation preview](https://rebrand-candidate.kitsune-router-docs.pages.dev/en/) exists on the verified official account/project. It is a preview, not v1.0.1 artifact verification; no custom-domain/DNS write is implied.
- Compression savings, model access, speed and upstream billing are not guaranteed by synthetic tests. Cost estimates are not invoices and unknown prices are not free.

The original license notices, contributor credit and 0.x artifact evidence remain unchanged. See [technical changelog](../docs/CHANGELOG_v1.0.1.md), [full changelog](../CHANGELOG.md) and the main-owned [release ledger](../docs/REBRANDING.md).
