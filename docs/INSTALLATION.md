# Install Kitsune Router

**Your models. Your routes.** Kitsune Router is maintained and sponsored by [ByKitsune](https://bykitsune.com). You choose the upstreams and routing order; no ByKitsune account is required.

## Availability

**1.0.2 is the authorized next candidate; final SHA/tag, verification gates and npm/GHCR publication are pending.** Repository `https://github.com/ByKitsune/kitsune-router`, package `@bykitsune/router`, executable `kitsune-router` and canonical container `ghcr.io/bykitsune/kitsune-router` retain their names. Use the registry commands only after verified publication; source installation is available meanwhile.

`v1.0.1` remains at `745834026a5a9f55dffce40c0ad01bf3106e8237`: its GHCR gate failed before login/push; npm publish failed with cause not yet known and public readback HTTP 404 on 2026-10-27. No canonical GHCR 1.0.1 image was published and no GitHub Release was created. `v1.0.0` remains at `390a65677c06a30084386d2a2adf8b0c48709281`, without npm/GHCR publication after its migration-test failure. Neither tag moves. See [1.0.2 status](../releases/RELEASE_NOTES_v1.0.2.md), not archived attempt commands. Original 0.x artifacts are unchanged.

## Launcher (after publication)

Use **Node.js >=22.19.0** and its supported npm. Check `node --version` first.

```bash
npx @bykitsune/router@1.0.2
```

Or install globally:

```bash
npm install -g @bykitsune/router@1.0.2
kitsune-router
```

The launcher can bind to all interfaces by default. For local-only use, run `kitsune-router --host 127.0.0.1`, or `npx @bykitsune/router@1.0.2 --host 127.0.0.1` after publication. Inspect supported options with `kitsune-router --help`.

The package name and binary differ. Update/uninstall the **scoped package**, not a nonexistent bare `kitsune-router` npm package:

```bash
npm ls -g @bykitsune/router
npm uninstall -g @bykitsune/router
```

Removing the package does not remove your state. Do not delete data as a troubleshooting step. Use a user-owned npm installation/prefix rather than running arbitrary lifecycle scripts with sudo.

## Source checkout

Use the canonical repository or an existing checkout. Commands run at the root, not `kitsune-router/app`:

The initialization below is for a **fresh source install** (POSIX shell and OpenSSL). `next dev` does not run the CLI's secret generator, and source/standalone execution must not assume automatic secret provisioning. A strong `JWT_SECRET` of at least 32 characters is required; otherwise dashboard login fails. Generate it once into private `.env`, reuse it on restarts, and never commit or print it. For existing state, retain the original effective `JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT` and absolute `DATA_DIR` using [migration](MIGRATION.md), not new generated values.

```bash
git clone https://github.com/ByKitsune/kitsune-router.git
cd kitsune-router
umask 077
cp -n .env.example .env
if ! grep -q '^JWT_SECRET=.' .env; then
  printf '\nJWT_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
fi
chmod 600 .env
npm ci
npm run check:deps
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
```

For production source builds, use `npm run build` then `npm run start`. Use an **absolute `DATA_DIR`**: the standalone server changes working directory. Automatic SQLite migration requires a supported Node runtime with `node:sqlite`, or a supported Bun runtime with native SQLite; there is no unsafe raw-file fallback when the snapshot API is unavailable.

Review `.env` before starting. On a fresh install choose a writable absolute state path, a strong initial password, and fresh private API/identity secrets instead of published example values. On upgrades keep all effective existing values; changing them can invalidate stored credentials and sessions. A commented or too-short existing `JWT_SECRET` must be corrected deliberately, not assumed usable because the file exists.

## First configuration

1. Set a strong `INITIAL_PASSWORD` in a private environment before exposure. Keep generated secrets stable; consult [`.env.example`](../.env.example).
2. Open `http://localhost:20128/dashboard`.
3. Connect a provider account/API key you are permitted to use. The gateway does not grant upstream subscriptions or quota.
4. Create/copy a gateway API key; do not give clients upstream OAuth refresh tokens.
5. Discover active routes and choose an exact model ID or your configured combo:

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

`KITSUNE_ROUTER_API_KEY` here is a **client-side environment variable holding an issued gateway key**, not a server setting that creates one. A health response checks gateway/storage health, not upstream inference or entitlement.

## State and upgrades

Defaults: `~/.kitsune-router` on macOS/Linux and `%APPDATA%\kitsune-router` on Windows. `DATA_DIR=/absolute/path` overrides discovery and relocation. Configuration and usage live in `db/data.sqlite`; retain `secrets.json`, `machine-id`, `auth/` and `mitm/` alongside it. Not all provider credentials are guaranteed encrypted at rest. Protect the directory and backups.

For ZenRouter/9Router, stop the source and its helpers and back up the entire directory. First startup can discover `~/.zenrouter` or `~/.9router`, verify a consistent snapshot and copied files, then create the new directory without deleting originals. Existing destinations are never merged/overwritten. See [MIGRATION.md](MIGRATION.md) for source selection, skip controls, certificate/key preservation and rollback.

Production migration permission policy is unchanged: unreadable native/same-UID ownership still fails closed. On restricted Linux, stop/back up the old state and select it with explicit `DATA_DIR` to keep it in place without relocation, or obtain privileged review. Do not ignore permission errors. Bounded Linux evidence is not general non-root support; native Windows/macOS migration remains unverified. See [current release notes](../releases/RELEASE_NOTES_v1.0.2.md) for the separate test-only clock fix and pending final gates.

For containers use [DOCKER.md](../DOCKER.md), keep the same volume mounted at the effective absolute `DATA_DIR` (`/app/data` by default or a supported custom path), and verify the canonical image/version before pulling. Remote access requires authenticated HTTPS and a reviewed proxy/firewall policy. See [integrations](INTEGRATIONS.md) and [operations](OPERATIONS.md).
