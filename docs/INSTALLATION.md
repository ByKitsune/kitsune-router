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

**1.0.2 source verified; container published privately; npm denied at that check.** Runtime tag stays at `65c8b97d783becab3f1e1210d2ab9ce67992e13b` (9,041 passed, 100 skipped, zero failures). Recovery `40485038668` published GHCR `1.0.2` and `latest`, with independent authenticated digest/provenance/SPDX readback and published-image smoke. The package was **private** at that recorded readback and anonymous grants returned HTTP 401. npm publication received E403 with public readback HTTP 404; token replacement had not been confirmed. No GitHub Release 1.0.2 or production deployment was established. These historical results do not determine current-release availability. See [1.0.2 evidence](CHANGELOG_v1.0.2.md).

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

Use **Bun >=1.4.4** from the checkout root. `bun install --frozen-lockfile` imports the committed `package-lock.json` without rewriting it. npm and Bun share this lockfile.

The initialization below is for a **fresh source install** (POSIX shell and Bun). `next dev` does not run the CLI's secret generator, and source/standalone execution must not assume automatic secret provisioning. A strong `JWT_SECRET` of at least 32 characters is required; otherwise dashboard login fails. Generate it once into private external `kitsune-router.source.env`, reuse it on restarts, and never commit or print it. For existing state, retain the original effective `JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT` and absolute `DATA_DIR` using [migration](MIGRATION.md), not new generated values.

```bash
git clone https://github.com/ByKitsune/kitsune-router.git
cd kitsune-router
# Keep runtime secrets outside the checkout and standalone build.
kitsune_env="$(dirname "$PWD")/kitsune-router.source.env"
bun - "$kitsune_env" "$PWD/.data" <<'BUN'
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
const values = {
  JWT_SECRET: randomBytes(32).toString("hex"),
  API_KEY_SECRET: randomBytes(32).toString("hex"),
  MACHINE_ID_SALT: randomBytes(32).toString("hex"),
  INITIAL_PASSWORD: randomBytes(24).toString("hex"),
  DATA_DIR: process.argv[3],
};
try {
  writeFileSync(process.argv[2], Object.entries(values).map(([key, value]) =>
    `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
} catch (error) {
  if (error.code !== "EEXIST") throw error; // Preserve an existing installation.
}
BUN
chmod 600 "$kitsune_env"
bun install --frozen-lockfile
bun run check:deps
bun --env-file="$kitsune_env" run dev --hostname 127.0.0.1
```

Bun reads the private env file as data and expands unescaped `$NAME` references. Export existing values that contain literal dollar signs before starting. Keep the file outside the checkout and do not source it through a shell.

For production source builds, keep runtime secrets outside the checkout, then run:

```bash
bun run build
HOSTNAME=127.0.0.1 bun --env-file="$kitsune_env" .next/standalone/custom-server.js
```

The standalone entry reads its environment, not launcher flags. Do not leave a private `.env` or `.env.*` in the checkout during a production build: Next can trace/copy it, and the postbuild guard correctly refuses embedded state or secrets. If upgrading a setup that already uses `.env`, preserve its exact effective values securely outside the checkout before changing the configuration path. Do not generate replacement credentials or delete the only copy.

Use an **absolute `DATA_DIR`**: the standalone server changes working directory. Automatic SQLite migration requires a supported Node runtime with `node:sqlite`, or a supported Bun runtime with native SQLite; there is no unsafe raw-file fallback when the snapshot API is unavailable.

Build-time page collection can initialize local SQLite state even though it does
not need operator credentials. If the default home/state directory is read-only,
give only the build process a writable absolute `DATA_DIR` belonging to an
isolated build directory. For example,
`DATA_DIR=/absolute/private/kitsune-build-state bun run build` selects build state;
it does not change the runtime file's existing `DATA_DIR`. Do not point automated
builds/tests at an operator database or copy runtime credentials into the build.

The gateway opens the existing SQLite file with `better-sqlite3` 13.x where its N-API prebuild is available. Otherwise it uses Bun's built-in SQLite. Use the same absolute `DATA_DIR` when switching runtimes.

Node.js >=22.19.0 remains available for source compatibility. Install with `npm ci`, use `npm run build:node`, and start with `npm run start:node` after loading your existing configuration. For a CLI installed with npm, `KITSUNE_ROUTER_RUNTIME=node kitsune-router` keeps its server on Node.js when Bun is present.

The current source CLI can also launch the completed root standalone build:

```bash
bun install --frozen-lockfile
bun run build
bun --no-env-file cli/cli.js --check-install
bun --no-env-file cli/cli.js --host 127.0.0.1 --no-browser --skip-update
```

`--check-install` checks for the generated production entry and build ID without
creating state, generating secrets, starting the gateway or calling an upstream.
It is a source addition after the published 1.0.8 artifact; do not assume an
older installed CLI supports it. Normal CLI startup keeps its documented private
secret setup. A version response alone does not establish a usable server build.

The installer prefers Bun, uses Node.js where supported if Bun is unavailable, and tries the published CLI before the source build. `--runtime node` selects Node.js for installation. The source path stops on locked dependency or build failure. `--no-build`
requires a completed existing production bundle; it does not enable development
mode. A failed clone/build remains on disk for diagnosis. Review its error and
retry after fixing it; preserve operator changes and state.

When the installer selects Bun, source and global commands use a launcher pinned to that Bun executable and the installed CLI entry point. Verification invokes the launcher users will run; source verification also requires `--check-install`. Root Debian/Ubuntu NodeSource setup runs directly, while non-root privileged setup retains `sudo -E`. These installer contracts do not certify live registry lifecycle execution on every Bun/platform combination.

Bun launchers are installed with mode `0755`. On repeat global installation the installer temporarily retains only its own marked wrapper so Bun can recreate the package bin; if the package command fails before replacing that bin, the old wrapper is restored. An unrelated regular command is not retired as a managed wrapper. A directory or a symlink to a directory cannot be used as the launcher destination. Keep the reported backup if Bun changes the destination and then fails; inspect that result before retrying.

Source `--check-install` also requires the custom server's startup files (`custom-server.js`, `shutdown-lifecycle.cjs`, and `cli/hooks/dataDirectory.js`) alongside the generated `server.js` and build ID. These entries must be files. Partial source output is skipped in favor of a complete packaged `cli/app`, when present; otherwise the check fails with rebuild/reinstall guidance.

Review the external `kitsune-router.source.env` before starting. On a fresh install choose a writable absolute state path, a strong initial password, and fresh private API/identity secrets instead of published example values. On upgrades keep all effective existing values; changing them can invalidate stored credentials and sessions. A commented or too-short existing `JWT_SECRET` must be corrected deliberately, not assumed usable because the file exists.

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

Current Unreleased source adapts existing SQLite state automatically through
additive synchronization to declarative schema/backup target 4; it adds the indexed provider/auth/name lookup.
Keep the same absolute `DATA_DIR`, credentials, installation secrets and mounted
volume when updating. A schema change attempts a pre-change backup; generic
backup failures retain the existing best-effort policy, while unsafe backup
permissions fail closed. Keep a verified full-state backup before upgrading.
Fresh legacy JSON imports stop on invalid/unreadable input before publishing
schema stamps or the import marker, preserving the source for repair and retry.
Established SQLite state does not re-import obsolete retained JSON on every boot.
The historical-time migration also canonicalizes valid explicit-zone index
timestamps while retaining changed originals in nullable `sourceTimestamp`.
Invalid or zone-unknown values remain stored and do not fabricate a date-window
match. Existing monetary/daily history and frozen quotes are retained. Fresh
legacy missing/null timestamps and costs stay unknown; explicit zero costs stay zero.
The versioned migration ledger is separate from the declarative backup target;
do not manually change either metadata version to force startup.
See the [deep stability audit](audit/2026-11-17-deep-stability-audit.md) for actual
upgrade fixtures and the distinction between local checks and published artifacts.

Defaults: `~/.kitsune-router` on macOS/Linux and `%APPDATA%\kitsune-router` on Windows. `DATA_DIR=/absolute/path` overrides discovery and relocation. Configuration and usage live in `db/data.sqlite`; retain `secrets.json`, `machine-id`, `auth/` and `mitm/` alongside it. Not all provider credentials are guaranteed encrypted at rest. Protect the directory and backups.

For ZenRouter/9Router, stop the source and its helpers and back up the entire directory. First startup can discover `~/.zenrouter` or `~/.9router`, verify a consistent snapshot and copied files, then create the new directory without deleting originals. Existing destinations are never merged/overwritten. See [MIGRATION.md](MIGRATION.md) for source selection, skip controls, certificate/key preservation and rollback.

Production migration permission policy is unchanged: unreadable native/same-UID ownership still fails closed. On restricted Linux, stop/back up the old state and select it with explicit `DATA_DIR` to keep it in place without relocation, or obtain privileged review. Do not ignore permission errors. Bounded Linux evidence is not general non-root support; native Windows/macOS migration remains unverified. See the [1.0.7 source notes](../releases/RELEASE_NOTES_v1.0.7.md) and [publication follow-up](audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) for current source checks and artifact availability.

For containers use [DOCKER.md](../DOCKER.md), keep the same volume mounted at the effective absolute `DATA_DIR` (`/app/data` by default or a supported custom path), and verify the canonical image/version before pulling. Remote access requires authenticated HTTPS and a reviewed proxy/firewall policy. See [integrations](INTEGRATIONS.md) and [operations](OPERATIONS.md).
