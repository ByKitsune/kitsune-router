# Kitsune Router 1.0.2 — release candidate

**Your models. Your routes.**

**Status: user-authorized next version; final source SHA, tag-bound gates and npm/GHCR publication remain pending.** These notes do not announce an available package, image, GitHub Release or production deployment. Use [source installation](../docs/INSTALLATION.md#source-checkout) until publication and registry readback are verified.

## Changes selected for 1.0.2

- **Deterministic cross-process cache regression:** mock only `Date` via `node:test` in the writer child to cover equal timestamps and a 1 ms difference, while retaining real cache reads and SQLite repository writes. The diagnostic at the exact 1.0.1 source showed same-millisecond writes produced `first, third, sibling`, whereas different milliseconds produced `third, first, sibling`. Both timestamp scenarios exposed the committed credential and active-state updates to the parent cache. This is a timestamp-sensitive test expectation, not evidence of stale credentials. Production priority/`updatedAt` ordering is unchanged.
- **Readable npm failure diagnostics:** use warning-level `npm publish` logging so the final publish error is not obscured by the verbose file list. Pack output is unchanged. Preserve exact-SHA verification, the original packed artifact and provenance guards; do not rebuild different release bytes or bypass publishing policy.
- **Current documentation:** advance installation and container targets to 1.0.2, record both previous attempts accurately, and retain original 0.x identities and evidence.

Targeted checks reported 14 cache cases plus 15 readback cases (29 passed), and eight repeats of the 14-case cache suite all passed. These are bounded implementation checks, not final 1.0.2 source/tag gates or full-suite counts. Final verification remains pending.

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

## Install only after verified publication

Requires **Node.js >=22.19.0**:

```bash
npx @bykitsune/router@1.0.2
# Or:
npm install -g @bykitsune/router@1.0.2
kitsune-router
```

The canonical image target is `ghcr.io/bykitsune/kitsune-router:1.0.2`, **linux/amd64 only**. Verify access, digest, provenance/SBOM and registry readback before pulling. A Docker Hub mirror is optional, not assumed. See [Docker](../DOCKER.md).

## Unchanged contracts and remaining gates

Kitsune Router remains a provider-neutral, local-first gateway maintained and sponsored by [ByKitsune](https://bykitsune.com). No ByKitsune account, hosted API purchase or fixed provider order is required. Package `@bykitsune/router`, executable `kitsune-router`, client provider key `kitsunerouter`, standard `/v1/*` and `/v1beta/*` paths, and port **20128** are unchanged.

Stop old writers/helpers and back up the entire private state before upgrading. Preserve SQLite, runtime secrets, machine identity, auth and certificates. Explicit `DATA_DIR` stays authoritative; containers retain the same existing volume at the effective absolute path (`/app/data` by default). Fresh source installs provision a private stable JWT secret; upgrades keep existing effective secrets. Read [migration](../docs/MIGRATION.md).

Production migration ownership checks still fail closed for unreadable same-UID state. The historical migration total is **58 cases, including eight denial cases**, not 58 plus eight. Bounded UID 65534 Linux evidence is not general non-root support; native Windows/macOS migration remains unverified. Restricted Linux operators must stop/back up state and use explicit `DATA_DIR` without relocation, or seek privileged ownership review—not bypass denials.

Final 1.0.2 SHA/tag, exact-source tests and suite failures, lint/build, docs build, original packed CLI/container checks, npm authorization/publication/provenance/readback and GHCR digest/SBOM/readback remain pending. Do not inherit previous pass counts. The separate ByKitsune integration merged as PR #6 at `73a14982`; it has not been deployed to production. The [official-account documentation preview](https://rebrand-candidate.kitsune-router-docs.pages.dev/en/) is not release or DNS evidence.

Original contributor credit, license notices and 0.x artifacts remain intact. See [technical changelog](../docs/CHANGELOG_v1.0.2.md), [full changelog](../CHANGELOG.md) and the main-owned [release ledger](../docs/REBRANDING.md).
