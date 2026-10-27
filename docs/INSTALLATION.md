# Install Kitsune Router

**Your models. Your routes.** Kitsune Router is maintained and sponsored by [ByKitsune](https://bykitsune.com). You choose the upstreams and routing order; no ByKitsune account is required.

## Availability

**1.0.1 is the selected next release candidate, pending final tag/SHA verification and publication.** The confirmed repository is `https://github.com/ByKitsune/kitsune-router`; package `@bykitsune/router`, executable `kitsune-router`, and canonical container `ghcr.io/bykitsune/kitsune-router` retain their names. npm authenticates as `bykitsune` and Actions credentials were updated, but package-publishing permission, registry visibility and artifact readback still require verification.

The immutable v1.0.0 tag remains at `390a65677c06a30084386d2a2adf8b0c48709281`. Its workflow failed on the non-root process-ownership scan; **no npm 1.0.0 package or canonical GHCR 1.0.0 image was published**. Use the pending [1.0.1 instructions](../releases/RELEASE_NOTES_v1.0.1.md), not that attempted tag's archived install examples. Existing 0.x artifacts remain original ZenRouter records.

## Launcher (after publication)

Use **Node.js >=22.19.0** and its supported npm. Check `node --version` first.

```bash
npx @bykitsune/router@1.0.1
```

Or install globally:

```bash
npm install -g @bykitsune/router@1.0.1
kitsune-router
```

The launcher can bind to all interfaces by default. For local-only use, run `kitsune-router --host 127.0.0.1`, or `npx @bykitsune/router@1.0.1 --host 127.0.0.1` after publication. Inspect supported options with `kitsune-router --help`.

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

The 1.0.1 ownership-scan follow-up changes regression isolation/denial coverage, **not production permission policy**. Unreadable native/same-UID ownership still fails closed. On restricted Linux, stop/back up the old state and select it with explicit `DATA_DIR` to keep it in place without relocation, or obtain privileged review. Do not blindly ignore permission errors. Scoped native evidence is recorded in the [release draft](../releases/RELEASE_NOTES_v1.0.1.md), but general non-root support and final tag-bound verification are not certified.

For containers use [DOCKER.md](../DOCKER.md), keep the same volume mounted at the effective absolute `DATA_DIR` (`/app/data` by default or a supported custom path), and verify the canonical image/version before pulling. Remote access requires authenticated HTTPS and a reviewed proxy/firewall policy. See [integrations](INTEGRATIONS.md) and [operations](OPERATIONS.md).
