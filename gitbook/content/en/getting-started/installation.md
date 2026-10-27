# Installation

**Kitsune Router 1.0.1 is the next candidate, pending final tag/SHA verification and publication.** The repository is confirmed; npm authentication as `bykitsune` and updated Actions credentials do not prove publishing permission or available artifacts. The package is `@bykitsune/router`, not the bare command name. Requires **Node.js >=22.19.0**.

The retained v1.0.0 tag at `390a65677c06a30084386d2a2adf8b0c48709281` failed its ownership-scan workflow, with no npm/GHCR publication. Use current pins only after 1.0.1 is published; do not treat the old source tag as an available package.

## Launcher — after publication

```bash
npx @bykitsune/router@1.0.1
# Or:
npm install -g @bykitsune/router@1.0.1
kitsune-router
```

Use `npm ls -g @bykitsune/router` to inspect the installed package and `npm uninstall -g @bykitsune/router` to remove the launcher without deleting state. Do not run arbitrary npm lifecycle scripts as root to work around a permissions problem.

The launcher can bind to all interfaces by default. For local-only use, append `--host 127.0.0.1`; inspect supported options with `kitsune-router --help`. Local-first is not an automatic network-isolation guarantee.

## Source checkout

Run at the root of the confirmed repository or an existing checkout, not an `app/` subdirectory.

For a **fresh** source install only, generate the session secret once in private `.env` (POSIX shell/OpenSSL). `next dev` does not use the launcher's generator: dashboard login fails without a strong `JWT_SECRET` of at least 32 characters. For upgrades retain the effective existing JWT/API/identity secrets and absolute `DATA_DIR` using the [migration guide](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). Review other example values only for fresh setup; never commit or print `.env`.

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

For production source builds use `npm run build` followed by `npm run start`; keep `DATA_DIR` absolute because standalone execution changes working directory. No build/test result is implied by these commands.

## State and migration

Defaults are `~/.kitsune-router` or `%APPDATA%\kitsune-router` on Windows. An explicit `DATA_DIR` stays authoritative. Active state is SQLite at `db/data.sqlite`, not `db.json`; retain `secrets.json`, `machine-id`, `auth/` and `mitm/` too.

Stop ZenRouter/9Router and helpers, back up the whole private directory, and read the [migration guide](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). Default startup can verify/copy legacy state without deleting originals or overwriting an existing destination. Preserve secrets, crypto derivation constants and trusted roots. Containers keep the same volume/mount at the effective `DATA_DIR` (`/app/data` by default); retain supported custom paths rather than replacing them.

Set a strong `INITIAL_PASSWORD` before exposure; then follow [quick start](/en/getting-started/quick-start/). For canonical GHCR access and linux/amd64 limitations, see [Docker](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md).
