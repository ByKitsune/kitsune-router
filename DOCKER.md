# Kitsune Router on Docker

**Your models. Your routes.** Maintained and sponsored by [ByKitsune](https://bykitsune.com).

**`ghcr.io/bykitsune/kitsune-router:1.0.2` is published, but the package is currently private.** Recovery `40485038668` used tooling `802c61bf` to build immutable runtime `65c8b97d783becab3f1e1210d2ab9ce67992e13b`; build/push, revision labels, SLSA v1/SPDX, `latest` promotion, independent authenticated readback and published-image smoke passed. `1.0.2` and `latest` resolve to index **`sha256:7abd76eee998d516020cbe015e6989394085dbfc7c330559e945a2c21494d45b`**. The [package](https://github.com/orgs/ByKitsune/packages/container/package/kitsune-router) remains private at last read; Public was selected by the owner but not confirmed, and anonymous grants return HTTP 401. See [distribution evidence](docs/CHANGELOG_v1.0.2.md). The image is **linux/amd64**, not ARM64/multi-architecture; Docker Hub remains unverified and optional.

`v1.0.1` remains at `745834026a5a9f55dffce40c0ad01bf3106e8237`: its GHCR exact-source gate failed before login/push, so **no canonical GHCR 1.0.1 image was published**. npm's publish command also failed; its cause is not yet known. `v1.0.0` stays at `390a65677c06a30084386d2a2adf8b0c48709281`, without npm/GHCR publication after the ownership-test failure. Neither tag moves. See [1.0.2 notes](releases/RELEASE_NOTES_v1.0.2.md) for the deterministic test/diagnostic follow-up; production ordering and fail-closed ownership checks are unchanged.

## Run with authorized access

Authenticate to GHCR using credentials with permission to read this private package before using these examples. Alternatively, wait until the owner completes the Public visibility setting in GitHub's package UI and anonymous access is independently confirmed; a selected intention is not completed access. Do not paste tokens in commands, source, chat or logs. Set a strong `INITIAL_PASSWORD` in your private environment first; `-e INITIAL_PASSWORD` forwards it without embedding a value in the example.

```bash
docker run -d --name kitsune-router \
  --platform linux/amd64 \
  -p 127.0.0.1:20128:20128 \
  -v kitsune-router-data:/app/data \
  -e DATA_DIR=/app/data \
  -e INITIAL_PASSWORD \
  --restart unless-stopped \
  ghcr.io/bykitsune/kitsune-router:1.0.2
```

For fixed bytes, replace the image reference in `docker run` or Compose with:

```text
ghcr.io/bykitsune/kitsune-router@sha256:7abd76eee998d516020cbe015e6989394085dbfc7c330559e945a2c21494d45b
```

Digest pinning does not bypass private-package authorization. Dashboard: `http://localhost:20128/dashboard`. Client API base: `http://localhost:20128/v1`. Loopback publishing is intentional; use authenticated HTTPS and a reviewed reverse proxy for remote access. The gateway does not require a ByKitsune account or prescribe a provider; current GHCR download authorization is a separate distribution restriction.

```yaml
services:
  kitsune-router:
    image: ghcr.io/bykitsune/kitsune-router:1.0.2
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

The image defaults to `DATA_DIR=/app/data`. Mount the **effective `DATA_DIR`**, including a supported custom absolute path; a mount at `/root/.kitsune-router` only works if that is also the explicitly selected `DATA_DIR`. Do not create a separate usage volume. Active configuration and usage share SQLite at `db/data.sqlite`; secrets and auth files are also needed (default layout below):

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

If restricted Linux process visibility prevents ownership verification, do not bypass the denial. Stop/back up the source, retain the old state in place via explicit `DATA_DIR` and its matching mount, or obtain privileged review. The test harness change does not grant general non-root relocation permission.

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

The verified source's **local** image `sha256:92aeda74d937e440bae4643523beaac9bc33addab1e9d5b18544c0ce6d0dfbec` passed six restart/secret-preservation scenarios: default `/app/data` and custom `/var/lib/kitsune-router`, each with fresh JWT, CLI JSON and legacy ENV secrets; all keys retained at mode 0600. This is a local image ID, not a GHCR digest, scan result or published artifact. See [release evidence](docs/CHANGELOG_v1.0.2.md).

The **published registry image**, config `sha256:af6416b66810127f938479f8bf837ab338fd857ba366dfbaeef66a9f9ba04f51`, independently passed six real SSH start/restart scenarios for the same two paths and three secret sources. All 16 compressed-layer digests and rootfs diff hashes were verified before loading; each scenario was healthy at version 1.0.2, with keys stable and secrets mode 0600. This is separate from local image `92aeda74`; manifest, config and index identities are recorded in [release evidence](docs/CHANGELOG_v1.0.2.md).

Recovery published unchanged release source without a version bump or tag move. Earlier preflight/context failures remain [historical](docs/OPERATIONS.md#publication-recovery-without-moving-the-tag). Authenticated registry publication and runtime smoke do not establish anonymous access or production deployment. npm is separately blocked by E403 and unconfirmed user-managed token replacement.
