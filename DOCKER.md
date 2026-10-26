# Kitsune Router on Docker

**Your models. Your routes.** Maintained and sponsored by [ByKitsune](https://bykitsune.com).

The canonical image target is **`ghcr.io/bykitsune/kitsune-router`**. **1.0.0 is proposed and pending publication/verification**; confirm registry access and the version digest before using these commands. Docker Hub `bykitsune/kitsune-router` is only an optional mirror if separately published and verified, not an assumed public fallback. The workflow targets **linux/amd64**, not native ARM64/multi-architecture.

## Run

Set a strong `INITIAL_PASSWORD` in your private environment first; `-e INITIAL_PASSWORD` forwards it without embedding a value in the example.

```bash
docker run -d --name kitsune-router \
  --platform linux/amd64 \
  -p 127.0.0.1:20128:20128 \
  -v kitsune-router-data:/app/data \
  -e DATA_DIR=/app/data \
  -e INITIAL_PASSWORD \
  --restart unless-stopped \
  ghcr.io/bykitsune/kitsune-router:1.0.0
```

Dashboard: `http://localhost:20128/dashboard`. Client API base: `http://localhost:20128/v1`. Loopback publishing is intentional; use authenticated HTTPS and a reviewed reverse proxy for remote access. A ByKitsune account is not required.

```yaml
services:
  kitsune-router:
    image: ghcr.io/bykitsune/kitsune-router:1.0.0
    platform: linux/amd64
    restart: unless-stopped
    ports:
      - "127.0.0.1:20128:20128"
    volumes:
      - ./data:/app/data
    environment:
      DATA_DIR: /app/data
      PORT: "20128"
      INITIAL_PASSWORD: ${INITIAL_PASSWORD:?Set a strong dashboard password}
```

## Keep all persistent state

The image defaults to `DATA_DIR=/app/data`. Mount the **effective `DATA_DIR`** (including a custom absolute path), not `/root/.kitsune-router` and not a separate usage volume. Active configuration and usage share SQLite at `db/data.sqlite`; secrets and auth files are also needed:

```text
/app/data/
├── db/data.sqlite
├── secrets.json          # canonical runtime secrets; private, mode 0600
├── secrets.env           # legacy Docker secrets, when present; retained unchanged
├── machine-id
├── auth/                 # installation keys, when present
└── mitm/                 # optional certificate/private-key state
```

Stop the service and its helpers before taking a private full-directory backup. A database-only export is not a credential/certificate backup. Never copy a live SQLite file with ordinary file copying. Do not expose state through a web directory or commit it.

When moving from ZenRouter/9Router, **keep the existing volume and explicit `DATA_DIR`**. Host-side automatic discovery cannot see a legacy directory that is not mounted. Renaming a Compose volume creates new state; it does not migrate it. Existing crypto salts and trusted certificate roots must remain usable. See [MIGRATION.md](docs/MIGRATION.md).

### Runtime secrets across CLI and container upgrades

The default container command uses the CLI's shared secret resolver **after dropping privileges**, before loading the application. It resolves `JWT_SECRET`, `API_KEY_SECRET` and `MACHINE_ID_SALT` independently: a valid explicit environment value wins; otherwise existing `secrets.json` and legacy `secrets.env` must agree for that key. Only missing keys are generated. A valid explicit JWT does not skip the other two keys.

Legacy `secrets.env` is parsed as data, never sourced or executed. It accepts only the three known keys with literal assignments (optionally simple quotes), blank lines and full-line comments; it does not expand variables or run commands. Existing valid legacy values are imported into canonical `secrets.json` under the shared startup lock, using a durable private write. Legacy bytes and existing JSON key values are retained; a complete JSON file is not rewritten. Keep **both** files in backups while the legacy file exists.

Malformed documents, invalid persisted values, or differing persisted values fail closed. A valid explicit override may resolve an invalid/conflicting **individual key**, but does not rewrite that original key; keep supplying the override until you deliberately reconcile the private files. Unknown keys or malformed file structure require local review. The minimum is 32 characters for all three keys; older Docker-generated 64-character values are supported. A shorter historical API secret or machine salt is not silently replaced—review it deliberately before starting. Do not post either secret file or its values in logs/issues.

If overriding the image's command with your own Node invocation, retain the preload: `node --require ./cli/hooks/containerEntrypoint.js custom-server.js`. The default process is exec'd directly, so shutdown signals reach the application without an extra Node wrapper. The preload does not alter `NODE_OPTIONS`, so normally spawned helper commands do not rerun secret setup.

## Operations

```bash
docker logs --tail 100 kitsune-router
docker stop kitsune-router
docker start kitsune-router
```

Redact credentials and private payloads before sharing logs. To upgrade, stop and back up first, pull the verified new version, and recreate the service with **the same mount and secrets**. Do not delete volumes. Rollback requires stopping the new writer and using the original state; new activity is not automatically merged back.

Project-specific variables use `KITSUNE_ROUTER_*`; `DATA_DIR`, `JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT` and other unprefixed settings retain their meanings. Keep existing values. Consult [.env.example](.env.example) for supported settings rather than reusing a historical environment matrix.

## Optional Headroom sidecar

The gateway image does not bundle Python/Headroom. A separately reviewed sidecar can be reached as `HEADROOM_URL=http://headroom:8787` on a private Compose network. Verify the sidecar's own image, configuration and access policy; don't expose its process-capable API publicly. Enable it deliberately in the dashboard's Token Saver controls. Compression is optional and has no guaranteed savings rate.

## Build from this checkout

Run from the repository root, using disposable state for evaluation:

```bash
docker build -t kitsune-router:local .
docker run --rm -p 127.0.0.1:20128:20128 \
  -v kitsune-router-evaluation:/app/data \
  -e DATA_DIR=/app/data -e INITIAL_PASSWORD \
  kitsune-router:local
```

`./start.sh` builds before stopping the current container and reuses `KITSUNE_ROUTER_DATA_VOLUME` (default `kitsune-router-data`). It reads the selected env file (`KITSUNE_ROUTER_ENV_FILE`, otherwise the checkout's `.env`) without executing it. An exported `DATA_DIR` takes precedence over that file; if neither supplies one, the target is `/app/data`. The script passes the resolved path explicitly to Docker and mounts the same volume at **that exact path**, so a source-style `.env` with `DATA_DIR=/var/lib/kitsune-router` remains persistent. This setting is a path **inside the container**, not a host bind-mount path. Relative, non-normalized and unusable mount targets are rejected before the running container is stopped. Docker env-file values are literal: do not quote or interpolate `DATA_DIR` there.

When switching from a historical container, set `KITSUNE_ROUTER_CONTAINER` and `KITSUNE_ROUTER_DATA_VOLUME` to the existing stopped installation's names rather than assuming the new defaults migrate it. For a manually invoked `docker run`, keep the `-v` target and `-e DATA_DIR` identical; for the repository Compose file, its explicit `DATA_DIR=/app/data` is authoritative.

Release publication is a separate guarded workflow in [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml), not an automatic consequence of writing docs or building locally. Verify exact tag/SHA, immutable digests, provenance/SBOM, registry visibility and any mirror before announcing availability. No current build, scan, live-provider or publication result is asserted here.
