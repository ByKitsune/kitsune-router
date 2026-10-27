# Kitsune Router 1.0.2 — container published privately; npm blocked

**Your models. Your routes.**

**Status: source verified and canonical GHCR 1.0.2 published, but the container package is private; anonymous pulls are not yet available. npm remains blocked.** Runtime source is immutable `v1.0.2` / `65c8b97d783becab3f1e1210d2ab9ce67992e13b`; PR #2 merged at `23375bf121e926f2d2b1330d3c2b8c124a639b40`. Recovery used separate tooling without a version bump or tag move. The owner selected making the package Public but has not confirmed completion; anonymous grants still return HTTP 401. Use authorized private container access or [source installation](../docs/INSTALLATION.md#source-checkout). npm publication, a GitHub Release and production deployment are not established.

## Changes in the verified source

- **Deterministic cross-process cache regression:** mock only `Date` via `node:test` in the writer child to cover equal timestamps and a 1 ms difference, while retaining real cache reads and SQLite repository writes. The diagnostic at the exact 1.0.1 source showed same-millisecond writes produced `first, third, sibling`, whereas different milliseconds produced `third, first, sibling`. Both timestamp scenarios exposed the committed credential and active-state updates to the parent cache. This is a timestamp-sensitive test expectation, not evidence of stale credentials. Production priority/`updatedAt` ordering is unchanged.
- **Readable npm failure diagnostics:** use warning-level `npm publish` logging so the final publish error is not obscured by the verbose file list. Pack output is unchanged. Preserve exact-SHA verification, the original packed artifact and provenance guards; do not rebuild different release bytes or bypass publishing policy.
- **Current documentation:** advance installation and container targets to 1.0.2, record both previous attempts accurately, and retain original 0.x identities and evidence.

Initial targeted checks passed 14 cache cases plus 15 readback cases (29 total), and eight repeats of the 14-case cache suite. Exact-source verification below supersedes the earlier pending gate status without relabeling those bounded checks.

## Verified source and distinct artifacts

| Evidence | Recorded result |
| --- | --- |
| Exact-tag SSH suite | **9,041 passed, 100 skipped, zero failed assertions and zero failed suites** |
| Strict lint / builds / pack | Zero warnings/errors; 18 docs tests, docs static export, app build and pack passed |
| SSH report SHA-256 | `a892d4549459b8de6de8d97a8a3ad397e257733f543a02a23fcfa60a5f535840` |
| [CI 40468830176](https://github.com/ByKitsune/kitsune-router/actions/runs/40468830176) | All green, 9,041 passed / 100 skipped / zero failures at PR merge `641d13efc407e302bddce69d984a8660e2286b03`; its source tree matches the immutable tag |
| Local tarball SHA-256 | `9b98ba6a4bfdd92e6b3ad99d077f511e67ce921476048fce9c93fc44b1cfb4b2`; archive inventory: 3,197 entries |
| Local tarball smoke | Install, help, runtime and upgrade passed; original private secrets retained at mode 0600; graceful exit 0 |
| Local container image ID | `sha256:92aeda74d937e440bae4643523beaac9bc33addab1e9d5b18544c0ce6d0dfbec`; **not a GHCR digest or published image** |
| Local container restarts | Six scenarios: `/app/data` and `/var/lib/kitsune-router`, each with fresh JWT, CLI JSON and legacy ENV secrets; all keys preserved at mode 0600 across restarts |
| Browser checks on the exact source | Login passed; Escape from Create Key restored focus; 390 px viewport/scroll width matched at 390; reduced motion had zero active animations |
| Original npm CI artifact | `12718343077`; tarball SHA-256 `a52d736ade6b8cbcf17ba114c9b55018956a7f1b35c4280edcae2912de8a3114` |

The **local tarball and original CI tarball are different bytes**. Each was independently installed and smoke-tested on SSH: help/version/video-help, runtime health, upgrade with original state/keys retained, `0600` secrets and graceful exit 0 passed. npm registry acceptance/provenance/readback remain blocked. Keep both identities and their evidence separate from the independently tested published container below.

## Published container and authenticated readback

[Recovery run 40485038668](https://github.com/ByKitsune/kitsune-router/actions/runs/40485038668) succeeded using tooling commit **`802c61bfcf3c6e23efc6643ce429b7f188caeeaa`** while building runtime source **`65c8b97d783becab3f1e1210d2ab9ce67992e13b`**. Its exact-runtime gate passed **9,041 tests, 100 skipped, zero failures**; report SHA-256 `a60b94b1e850d7cf8c10d96a170d8113c4dd3580e67a58ae486663e240842f3e`. Build/push, revision-label checks, SLSA v1 provenance, SPDX and promotion of `latest` succeeded. Independent **authenticated** registry readback verified:

| Registry object | Identity |
| --- | --- |
| `1.0.2` index digest | `sha256:7abd76eee998d516020cbe015e6989394085dbfc7c330559e945a2c21494d45b` |
| `latest` index digest | Same as `1.0.2`; no replacement of the versioned artifact |
| linux/amd64 manifest | `sha256:1f9cec174a74843909030fd86612ea6aba9e53233c61fbd13dc19ac9fcd3339d` |
| Config / image ID | `sha256:af6416b66810127f938479f8bf837ab338fd857ba366dfbaeef66a9f9ba04f51` |
| Runtime revision label | `65c8b97d783becab3f1e1210d2ab9ce67992e13b`, not tooling `802c61bf` |
| GitHub container package | [kitsune-router](https://github.com/orgs/ByKitsune/packages/container/package/kitsune-router), ID `16308407`, visibility **private** |

SLSA v1 `buildDefinition.resolvedDependencies` and `externalParameters.configSource` identify the exact Git URI at `#65c8b97d783becab3f1e1210d2ab9ce67992e13b` with that SHA-1 digest. SPDX was verified against the same platform subject. Source/tooling verification counts remain separate.

**Published-image smoke passed independently of the earlier local image.** The registry image with config `sha256:af6416b66810127f938479f8bf837ab338fd857ba366dfbaeef66a9f9ba04f51` was downloaded using a repository-scoped ephemeral grant and loaded on approved SSH infrastructure after verifying all 16 compressed-layer digests and rootfs diff hashes. Six real start/restart scenarios passed: `/app/data` and `/var/lib/kitsune-router`, each with fresh JWT, CLI JSON and legacy ENV secrets; all were healthy at version 1.0.2, with keys stable and secrets mode 0600. This is evidence for the published image, not a relabeling of local image `92aeda74`.

The owner must complete the visibility change through GitHub's package-settings UI; the official REST API does not expose the required visibility write. Selecting “Public” is not confirmation that it changed: anonymous grants still return **HTTP 401** at the last read. Authorized private pulls and successful smoke do not establish anonymous availability. See [Docker](../DOCKER.md) for the digest pin and [operations](../docs/OPERATIONS.md#publication-recovery-without-moving-the-tag) for remaining gates.

## Publication history and remaining blockers

- [npm workflow 40469972263](https://github.com/ByKitsune/kitsune-router/actions/runs/40469972263) passed the exact-source gate, docs build and pack, then publication was denied with **E403**: `Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.` Public npm readback returned HTTP 404 after denial. This diagnostic is known for **1.0.2 only**; the truncated 1.0.1 error remains unknown.
- The user will replace the limited granular `NPM_TOKEN` Actions secret directly through GitHub's UI; completion has **not been confirmed**. No credential belongs in chat, source or logs. Accepted publication, original-artifact provenance and public registry readback are still required afterward.
- [GHCR workflow 40469972099](https://github.com/ByKitsune/kitsune-router/actions/runs/40469972099) passed all source gates and registry login. Preflight then stopped on Buildx `ERROR: ghcr.io/bykitsune/kitsune-router:1.0.2: not found`, because the old guard recognized only `manifest unknown`. **No build/push was reached.** An authenticated owner read independently received grant HTTP 200 and manifest HTTP 404 with structured `MANIFEST_UNKNOWN`; package inventory was empty.
- The first recovery run [40483141695](https://github.com/ByKitsune/kitsune-router/actions/runs/40483141695) failed before registry work because GitHub's `GITHUB_SHA` context described the tooling workflow rather than runtime source. PR #4 merged at `802c61bf`; explicit API source verification, not a substituted environment value, resolved that tooling limitation. Successful recovery `40485038668` is recorded above; earlier failures remain historical evidence.
- No GitHub Release 1.0.2 was created; the workflow's existing Create GitHub Release step was not reached after npm failed. The docs preview still serves earlier `74583402` / deployment `d3544c04`, not the verified 1.0.2 source; it is not fresh release or production evidence. No OTP collection or two-factor-policy change is part of this follow-up.

## Previous attempts — tags stay immutable

### 1.0.1

Source tag [`v1.0.1`](https://github.com/ByKitsune/kitsune-router/tree/v1.0.1) remains at **`745834026a5a9f55dffce40c0ad01bf3106e8237`**. PR #1 merged to master at `ce752a9f`; source verification and registry publication are separate outcomes:

| Evidence | Recorded outcome |
| --- | --- |
| SSH verification of 1.0.1 | 9,039 passed, 100 skipped, zero failures |
| [CI run 40463259397](https://github.com/ByKitsune/kitsune-router/actions/runs/40463259397) | Passed |
| [GHCR workflow 40465152324](https://github.com/ByKitsune/kitsune-router/actions/runs/40465152324) | Exact-source gate failed: 9,038 passed, one failed at `db-scoped-cache:216`; stopped before registry login/push, so no canonical GHCR 1.0.1 image was published |
| [npm workflow 40465152995](https://github.com/ByKitsune/kitsune-router/actions/runs/40465152995) | Exact-source gate, documentation build and pack passed; the publish command failed |
| Original CI artifact | `12716498091`; saved tarball SHA-256 `f00e2f581631065a9afa4719999487bf2f5eba31c096393d2a9141fb13bd55e8` |
| Public npm readback, 2026-10-27 after failure | HTTP 404; package availability not established |
| GitHub Release 1.0.1 | Not created |

The npm failure cause is **not yet known**: verbose file-list output truncated the visible final error. Do not label it E401/E403 or a two-factor-policy failure without the actual diagnostic. An authenticated npm identity is not proof of an accepted publication. See the [1.0.1 attempt record](RELEASE_NOTES_v1.0.1.md) and [technical evidence](../docs/CHANGELOG_v1.0.1.md).

### 1.0.0

Source tag [`v1.0.0`](https://github.com/ByKitsune/kitsune-router/tree/v1.0.0) remains at **`390a65677c06a30084386d2a2adf8b0c48709281`**. Its non-root migration ownership test failed before publication; no npm 1.0.0 package or canonical GHCR 1.0.0 image was published. Its original scope and 9,029-pass candidate result remain [historical](RELEASE_NOTES_v1.0.0.md), not 1.0.2 evidence. Neither old tag will be moved.

## npm installation only after verified publication

Requires **Node.js >=22.19.0**:

```bash
npx @bykitsune/router@1.0.2
# Or:
npm install -g @bykitsune/router@1.0.2
kitsune-router
```

The published canonical image is `ghcr.io/bykitsune/kitsune-router:1.0.2`, **linux/amd64 only**, currently requiring authorized private access. Anonymous pulls must wait for a confirmed Public setting and unauthenticated readback. Pin the index digest above when repeatable bytes are required. A Docker Hub mirror remains unverified and optional. See [Docker](../DOCKER.md).

## Unchanged contracts and remaining gates

Kitsune Router remains a provider-neutral, local-first gateway maintained and sponsored by [ByKitsune](https://bykitsune.com). No ByKitsune account, hosted API purchase or fixed provider order is required. Package `@bykitsune/router`, executable `kitsune-router`, client provider key `kitsunerouter`, standard `/v1/*` and `/v1beta/*` paths, and port **20128** are unchanged.

Stop old writers/helpers and back up the entire private state before upgrading. Preserve SQLite, runtime secrets, machine identity, auth and certificates. Explicit `DATA_DIR` stays authoritative; containers retain the same existing volume at the effective absolute path (`/app/data` by default). Fresh source installs provision a private stable JWT secret; upgrades keep existing effective secrets. Read [migration](../docs/MIGRATION.md).

Production migration ownership checks still fail closed for unreadable same-UID state. The historical migration total is **58 cases, including eight denial cases**, not 58 plus eight. Bounded UID 65534 Linux evidence is not general non-root support; native Windows/macOS migration remains unverified. Restricted Linux operators must stop/back up state and use explicit `DATA_DIR` without relocation, or seek privileged ownership review—not bypass denials.

Source/tag verification, independent original-CI-tarball smoke, authenticated GHCR publication/readback and published-image smoke are complete as recorded above. npm publication and anonymous container access remain blocked or unconfirmed. The separate ByKitsune integration merged as PR #6 at `73a14982` without production deployment. The [official-account documentation preview](https://rebrand-candidate.kitsune-router-docs.pages.dev/en/) still reflects earlier documentation, not this source or a DNS change.

Original contributor credit, license notices and 0.x artifacts remain intact. See [technical changelog](../docs/CHANGELOG_v1.0.2.md), [full changelog](../CHANGELOG.md) and the main-owned [release ledger](../docs/REBRANDING.md).
