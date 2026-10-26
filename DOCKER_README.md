# Kitsune Router container

**Your models. Your routes.** A provider-neutral, local-first AI gateway maintained and sponsored by [ByKitsune](https://bykitsune.com).

- Repository: [ByKitsune/kitsune-router](https://github.com/ByKitsune/kitsune-router)
- Canonical image target: **`ghcr.io/bykitsune/kitsune-router`**
- CLI package target: **`@bykitsune/router`**, command **`kitsune-router`**
- **Release status:** 1.0.0 is proposed, pending final verification and publication. Namespace ownership, publishing authorization, registry access and tag availability must be confirmed. A Docker Hub mirror is optional, not guaranteed.
- Publication platform: **linux/amd64 only**. The image supplies its own Node runtime; the launcher requires Node.js >=22.19.0.

After publication, with a strong `INITIAL_PASSWORD` set in your private environment:

```bash
docker run -d --name kitsune-router \
  --platform linux/amd64 \
  -p 127.0.0.1:20128:20128 \
  -v kitsune-router-data:/app/data \
  -e DATA_DIR=/app/data -e INITIAL_PASSWORD \
  --restart unless-stopped \
  ghcr.io/bykitsune/kitsune-router:1.0.0
```

Open `http://localhost:20128/dashboard`, connect your chosen provider, create/copy a gateway API key, and use `http://localhost:20128/v1` in clients. No ByKitsune account, paid hosted service or prescribed provider order is required. Upstream account terms, costs, quotas and availability still apply.

## Persistent storage and migration

**Mount the effective `DATA_DIR`**, `/app/data` by default. Preserve SQLite configuration/usage at `db/data.sqlite` **and** canonical `secrets.json` (private, mode 0600), legacy `secrets.env` when present, `machine-id`, `auth/` and optional `mitm/` state. Stop the gateway/helpers and back up the whole directory privately before upgrades. Do not copy a live SQLite database, replace a volume with a new empty one, or delete trusted roots because of their old subject names.

The default container command preloads the CLI's shared resolver after dropping privileges. Each of the three runtime secrets independently uses a valid explicit environment override, otherwise matching persisted JSON/legacy-env values, otherwise a newly generated value. Legacy env files are parsed as literal data, never executed, and retained unchanged. Conflicting or invalid persisted keys stop startup unless the operator explicitly overrides that key; overrides do not rewrite existing stored values. All three keys require at least 32 characters; shorter historical values require deliberate review, not automatic rotation. See the Docker guide for supported literal syntax and reconciliation.

An explicit mounted `DATA_DIR` stays authoritative. Local automatic discovery from `~/.zenrouter` or `~/.9router` does not relocate a container volume. Use `kitsunerouter` for new client provider keys, `KITSUNE_ROUTER_*` for project-specific environment settings and `x-kitsune-router-*` for extension headers. Standard `/v1/*` and port 20128 remain unchanged.

The checkout's `start.sh` mounts its selected volume at the exact resolved absolute container `DATA_DIR`: exported environment first, then the selected Docker env file, then `/app/data`. Values are not shell-evaluated. Invalid targets are rejected before stopping the current container. Retain the existing volume name when upgrading; a renamed volume is empty state, not a migration.

Read the [migration guide](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) and [Docker guide](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md). Historical 0.x images/packages retain their original names and provenance; they were not published as Kitsune Router 0.x.

## Security and verification limits

Use authenticated HTTPS for remote access, keep secrets out of source/logs and choose a strong initial password. Compression has no guaranteed savings; cost estimates are not invoices; model listings and synthetic tests do not establish entitlement or live service availability. This page does not certify a current build, OS-image scan or registry publication. See the [release draft](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.0.md).

MIT licensed; upstream copyright notices remain in [LICENSE](https://github.com/ByKitsune/kitsune-router/blob/master/LICENSE).
