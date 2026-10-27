# Kitsune Router container

**Your models. Your routes.** A provider-neutral, local-first AI gateway maintained and sponsored by [ByKitsune](https://bykitsune.com).

- Repository: [ByKitsune/kitsune-router](https://github.com/ByKitsune/kitsune-router)
- Canonical image target: **`ghcr.io/bykitsune/kitsune-router`**
- CLI package target: **`@bykitsune/router`**, command **`kitsune-router`**
- **Release status:** 1.0.2 source is verified at immutable `65c8b97d783becab3f1e1210d2ab9ce67992e13b`; registry publication is blocked. GHCR `40469972099` passed source gates/login but preflight stopped on a misclassified missing manifest before build/push. Authenticated readback confirmed HTTP 404 / `MANIFEST_UNKNOWN`. No canonical image is published; separate recovery keeps version/tag unchanged. Verify digest/provenance/SBOM/readback before use; a Docker Hub mirror is optional.
- Publication platform: **linux/amd64 only**. The image supplies its own Node runtime; the launcher requires Node.js >=22.19.0.

`v1.0.1` stays at `745834026a5a9f55dffce40c0ad01bf3106e8237`. Its GHCR gate failed before login/push, so no canonical 1.0.1 image was published. npm's publish command failed with cause not yet known; public readback was HTTP 404 on 2026-10-27. `v1.0.0` stays at `390a65677c06a30084386d2a2adf8b0c48709281`, without npm/GHCR publication after its migration-test failure. Tags are not registry artifacts and will not be moved.

The 1.0.2 follow-up controls timestamp-sensitive cache tests and improves npm failure diagnostics without changing production priority ordering or fail-closed migration ownership checks. Bounded Linux evidence is not general non-root support; native Windows/macOS migration is unverified. Restricted operators must stop/back up state and keep it at explicit `DATA_DIR` without relocation, or seek privileged review—not ignore permission errors.

After publication, with a strong `INITIAL_PASSWORD` set in your private environment:

```bash
docker run -d --name kitsune-router \
  --platform linux/amd64 \
  -p 127.0.0.1:20128:20128 \
  -v kitsune-router-data:/app/data \
  -e DATA_DIR=/app/data -e INITIAL_PASSWORD \
  --restart unless-stopped \
  ghcr.io/bykitsune/kitsune-router:1.0.2
```

Open `http://localhost:20128/dashboard`, connect your chosen provider, create/copy a gateway API key, and use `http://localhost:20128/v1` in clients. No ByKitsune account, paid hosted service or prescribed provider order is required. Upstream account terms, costs, quotas and availability still apply.

## Persistent storage and migration

**Mount the effective `DATA_DIR`**, `/app/data` by default. Preserve SQLite configuration/usage at `db/data.sqlite` **and** canonical `secrets.json` (private, mode 0600), legacy `secrets.env` when present, `machine-id`, `auth/` and optional `mitm/` state. Stop the gateway/helpers and back up the whole directory privately before upgrades. Do not copy a live SQLite database, replace a volume with a new empty one, or delete trusted roots because of their old subject names.

The default container command preloads the CLI's shared resolver after dropping privileges. Each of the three runtime secrets independently uses a valid explicit environment override, otherwise matching persisted JSON/legacy-env values, otherwise a newly generated value. Legacy env files are parsed as literal data, never executed, and retained unchanged. Conflicting or invalid persisted keys stop startup unless the operator explicitly overrides that key; overrides do not rewrite existing stored values. All three keys require at least 32 characters; shorter historical values require deliberate review, not automatic rotation. See the Docker guide for supported literal syntax and reconciliation.

An explicit mounted `DATA_DIR` stays authoritative. Local automatic discovery from `~/.zenrouter` or `~/.9router` does not relocate a container volume. Use `kitsunerouter` for new client provider keys, `KITSUNE_ROUTER_*` for project-specific environment settings and `x-kitsune-router-*` for extension headers. Standard `/v1/*` and port 20128 remain unchanged.

The checkout's `start.sh` mounts its selected volume at the exact resolved absolute container `DATA_DIR`: exported environment first, then the selected Docker env file, then `/app/data`. Values are not shell-evaluated. Invalid targets are rejected before stopping the current container. Retain the existing volume name when upgrading; a renamed volume is empty state, not a migration.

Read the [migration guide](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) and [Docker guide](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md). Historical 0.x images/packages retain their original names and provenance; they were not published as Kitsune Router 0.x.

## Security and verification limits

Use authenticated HTTPS for remote access, keep secrets out of source/logs and choose a strong initial password. Compression has no guaranteed savings; estimates are not invoices; synthetic tests do not establish entitlement or live availability. Source gates and six local container restart scenarios passed, but the local image ID is not a GHCR digest or an OS-image scan. npm 1.0.2 was separately denied with E403; user-managed token replacement is not confirmed. See [release evidence](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.2.md) and [recovery operations](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md#publication-recovery-without-moving-the-tag). No production deployment or GitHub Release 1.0.2 is established.

MIT licensed; upstream copyright notices remain in [LICENSE](https://github.com/ByKitsune/kitsune-router/blob/master/LICENSE).
