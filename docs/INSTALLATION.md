# Install Kitsune Router

**Your models. Your routes.** Kitsune Router is maintained and sponsored by [ByKitsune](https://bykitsune.com). You choose the upstreams and routing order; no ByKitsune account is required.

## Availability

**Version 1.0.8 is published on npm, GitHub Release and canonical GHCR.** The
[publication receipt](audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)
records original-byte integrity/provenance and a successful fresh public-registry
global install on Node 24.19/npm 11.17 with two ordinary offline CLI starts,
help/version, retained private state and zero runtime warnings/errors. Use the
scoped script review below for npm 11.17. The image passes authenticated runtime
verification; an anonymous pull grant returned HTTP 401, without establishing
its visibility setting. This patch fixes managed SQLite/tray dependency retention;
the receipt preserves the published 1.0.7 installer issue and earlier history.

### Historical distribution records

**1.0.2 source verified; container published privately; npm denied at that check.** Runtime tag stays at `65c8b97d783becab3f1e1210d2ab9ce67992e13b` (9,041 passed, 100 skipped, zero failures). Recovery `40485038668` published GHCR `1.0.2` and `latest`, with independent authenticated digest/provenance/SPDX readback and published-image smoke. The package was **private** at that recorded readback and anonymous grants returned HTTP 401. npm publication received E403 with public readback HTTP 404; token replacement had not been confirmed. No GitHub Release 1.0.2 or production deployment was established. These historical results do not determine 1.0.7 availability. See [1.0.2 evidence](CHANGELOG_v1.0.2.md).

`v1.0.1` remains at `745834026a5a9f55dffce40c0ad01bf3106e8237`: its GHCR gate failed before login/push; npm publish failed with cause not yet known and public readback HTTP 404 on 2026-10-27. No canonical GHCR 1.0.1 image was published and no GitHub Release was created. `v1.0.0` remains at `390a65677c06a30084386d2a2adf8b0c48709281`, without npm/GHCR publication after its migration-test failure. Neither tag moves. See [1.0.2 status](../releases/RELEASE_NOTES_v1.0.2.md), not archived attempt commands. Original 0.x artifacts are unchanged.

## Launcher 1.0.8

Use **Node.js >=22.19.0** and its supported npm. Check `node --version` first.

```bash
npx @bykitsune/router@1.0.8
```

Or install globally:

```bash
npm install -g @bykitsune/router@1.0.8
kitsune-router
```

### npm 11.17 script review

npm 11.17 reports when a package's lifecycle has not received an explicit review.
The launcher's `postinstall` prepares private state and the managed SQLite/tray
packages. After reviewing that hook, record a one-time approval for the exact
registry release with this global installation command:

```bash
npm install -g --allow-scripts=@bykitsune/router@1.0.8 @bykitsune/router@1.0.8
```

The one-time selector belongs to the global installation transaction. The launcher
keeps its local runtime project's script policy separate. Standard commands above
remain available for other npm clients. Do not add this one-time selector to NPX
or source/project installs; it approves only the exact CLI postinstall for the
global transaction, not unrelated packages or persistent policy.

The launcher can bind to all interfaces by default. For local-only use, run `kitsune-router --host 127.0.0.1`, or `npx @bykitsune/router@1.0.8 --host 127.0.0.1`. Inspect supported options with `kitsune-router --help`.

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

The current source CLI can also launch the completed root standalone build:

```bash
npm ci
npm run build
node cli/cli.js --check-install
node cli/cli.js --host 127.0.0.1 --no-browser --skip-update
```

`--check-install` checks for the generated production entry and build ID without
creating state, generating secrets, starting the gateway or calling an upstream.
It is a source addition after the published 1.0.8 artifact; do not assume an
older installed CLI supports it. Normal CLI startup keeps its documented private
secret setup. A version response alone does not establish a usable server build.

The installer still prefers the published npm CLI and uses source only as its
fallback. Its source path now stops on `npm ci` or build failure instead of
replacing the lockfile or reporting an unbuilt gateway as installed. `--no-build`
requires a completed existing production bundle; it does not enable development
mode. A failed clone/build remains on disk for diagnosis. Review its error and
retry after fixing it; preserve operator changes and state.

When the installer selects Bun, source and global commands use a launcher pinned to that Bun executable and the installed CLI entry point. Verification invokes the launcher users will run; source verification also requires `--check-install`. Root Debian/Ubuntu NodeSource setup runs directly, while non-root privileged setup retains `sudo -E`. These installer contracts do not certify live registry lifecycle execution on every Bun/platform combination.

Bun launchers are installed with mode `0755`. On repeat global installation the installer temporarily retains only its own marked wrapper so Bun can recreate the package bin; if the package command fails before replacing that bin, the old wrapper is restored. An unrelated regular command is not retired as a managed wrapper. A directory or a symlink to a directory cannot be used as the launcher destination. Keep the reported backup if Bun changes the destination and then fails; inspect that result before retrying.

Source `--check-install` also requires the custom server's startup files (`custom-server.js`, `shutdown-lifecycle.cjs`, and `cli/hooks/dataDirectory.js`) alongside the generated `server.js` and build ID. These entries must be files. Partial source output is skipped in favor of a complete packaged `cli/app`, when present; otherwise the check fails with rebuild/reinstall guidance.

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

Production migration permission policy is unchanged: unreadable native/same-UID ownership still fails closed. On restricted Linux, stop/back up the old state and select it with explicit `DATA_DIR` to keep it in place without relocation, or obtain privileged review. Do not ignore permission errors. Bounded Linux evidence is not general non-root support; native Windows/macOS migration remains unverified. See the [1.0.7 source notes](../releases/RELEASE_NOTES_v1.0.7.md) and [publication follow-up](audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) for current source checks and artifact availability.

For containers use [DOCKER.md](../DOCKER.md), keep the same volume mounted at the effective absolute `DATA_DIR` (`/app/data` by default or a supported custom path), and verify the canonical image/version before pulling. Remote access requires authenticated HTTPS and a reviewed proxy/firewall policy. See [integrations](INTEGRATIONS.md) and [operations](OPERATIONS.md).
