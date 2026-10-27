# Kitsune Router 1.0.1 — attempted release; publication not established

**Your models. Your routes.**

**Status: immutable source tag retained after failed publication workflows.** [`v1.0.1`](https://github.com/ByKitsune/kitsune-router/tree/v1.0.1) remains at **`745834026a5a9f55dffce40c0ad01bf3106e8237`**. No canonical GHCR 1.0.1 image was published; the npm publish command failed and public readback returned HTTP 404 on 2026-10-27. No GitHub Release 1.0.1 was created. The next authorized version is [1.0.2](RELEASE_NOTES_v1.0.2.md), not a replacement of this tag.

Kitsune Router is the provider-neutral, local-first continuation of ZenRouter/9Router, maintained and sponsored by [ByKitsune](https://bykitsune.com). You choose models, accounts and routing order. No ByKitsune account or hosted API purchase is required; configured upstreams still receive your inference requests.

## Why 1.0.1 instead of replacing 1.0.0?

The immutable [`v1.0.0` tag](https://github.com/ByKitsune/kitsune-router/tree/v1.0.0) remains at **`390a65677c06a30084386d2a2adf8b0c48709281`**. Its workflow failed on the non-root process-ownership scan, before npm/GHCR publication. **No npm 1.0.0 package or canonical GHCR 1.0.0 image was published.** A source tag is not a published registry artifact.

The recorded **9,029 passing tests** belong to that 1.0.0 candidate, not the 1.0.1 follow-up. The earlier 9,028-pass frozen inventory is also retained as its own snapshot. Neither count may be reused as final v1.0.1 proof. See the [1.0.0 attempt record](RELEASE_NOTES_v1.0.0.md).

## Scope of the 1.0.1 attempt

- **Ownership regression harness:** isolate tests to owned synthetic process inventories and include denial coverage after the 1.0.0 workflow failure. **Production migration ownership checks are unchanged**: native/same-UID unreadable state still fails closed. This is not a general non-root migration allowance.
- **Mobile API-key row wrapping:** retain long endpoint keys and their controls on narrow screens. Recorded source test results do not independently certify every responsive layout.
- **Documentation at the attempt:** target 1.0.1 while preserving the immutable 1.0.0 attempt and original 0.x archives. Current installation instructions now target 1.0.2.

PR #1 merged to master at `ce752a9f`. The source checks and publication outcomes below are distinct; the merge does not establish registry availability or a production deployment.

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

## Historical installation targets — not current guidance

These were the attempted 1.0.1 targets, not evidence of an installable release. Use [current installation](../docs/INSTALLATION.md) and the pending [1.0.2 notes](RELEASE_NOTES_v1.0.2.md) instead.

Requires **Node.js >=22.19.0**:

```bash
npx @bykitsune/router@1.0.1
# Or:
npm install -g @bykitsune/router@1.0.1
kitsune-router
```

The attempted image target was `ghcr.io/bykitsune/kitsune-router:1.0.1`, **linux/amd64 only**. The workflow did not reach login/push. A Docker Hub mirror is optional, not assumed. See current [Docker guidance](../DOCKER.md).

## Recorded verification and publication outcomes

Historical migration checks covered **58 total cases, including eight denial cases**. A bounded native Linux check as **UID 65534** refused an open owned source, migrated after it was closed, and preserved the refusal when host-wide ownership could not be inspected. This is not general non-root migration certification; native Windows/macOS migration remains unverified.

- SSH source verification: **9,039 passed, 100 skipped, zero failures**. [CI 40463259397](https://github.com/ByKitsune/kitsune-router/actions/runs/40463259397) passed. Do not reuse these as final 1.0.2 counts.
- [GHCR workflow 40465152324](https://github.com/ByKitsune/kitsune-router/actions/runs/40465152324): exact-source gate failed with **9,038 passed and one failed** at `db-scoped-cache:216`, before registry login/push. **No canonical GHCR 1.0.1 image was published.**
- [npm workflow 40465152995](https://github.com/ByKitsune/kitsune-router/actions/runs/40465152995): exact-source gate, docs build and pack passed; **publish command failed**. Original CI artifact **`12716498091`** was saved; tarball SHA-256 **`f00e2f581631065a9afa4719999487bf2f5eba31c096393d2a9141fb13bd55e8`**.
- npm's final error was obscured by truncated verbose file-list output; **cause not yet known**. Do not claim E401, E403 or a two-factor-policy cause. npm authenticates as `bykitsune`, but this does not prove accepted publication. Public npm readback after failure on **2026-10-27 returned HTTP 404**.
- No GitHub Release 1.0.1 was created. The source tag and saved CI tarball are not published registry artifacts; image digest/SBOM and successful npm provenance/readback were not established.
- Exact-source real-SQLite cross-process diagnostics produced `first, third, sibling` for same-millisecond writes and `third, first, sibling` for different milliseconds. Both timestamp scenarios exposed the committed credential and active-state updates to the parent cache. The [1.0.2 follow-up](../docs/CHANGELOG_v1.0.2.md) controls the child `Date` clock without changing production priority/`updatedAt` ordering.
- [Cloudflare documentation preview](https://rebrand-candidate.kitsune-router-docs.pages.dev/en/) exists on the verified official account/project. It is not registry or production-deployment evidence; no custom-domain/DNS write is implied.
- Compression savings, model access, speed and upstream billing are not guaranteed by synthetic tests. Cost estimates are not invoices and unknown prices are not free.

The original license notices, contributor credit and 0.x artifact evidence remain unchanged. See [technical changelog](../docs/CHANGELOG_v1.0.1.md), [full changelog](../CHANGELOG.md) and the main-owned [release ledger](../docs/REBRANDING.md).
