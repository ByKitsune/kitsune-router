# Installation

**Kitsune Router 1.0.2 is authorized; final SHA/tag, verification gates and npm/GHCR publication are pending.** The package is `@bykitsune/router`, not the bare command name. Requires **Node.js >=22.19.0**. Use source installation until publication and registry readback are verified.

Both old tags remain immutable. v1.0.1 at `74583402` passed SSH/CI, but its GHCR gate failed before login/push and npm publish failed (cause not yet known; public readback HTTP 404 on 2026-10-27). No canonical GHCR 1.0.1 image was published and no GitHub Release was created. v1.0.0 at `390a6567` did not publish npm/GHCR after its migration-test failure. See [release history](/en/changelog/); source tags are not registry artifacts.

## Launcher — after publication

```bash
npx @bykitsune/router@1.0.2
# Or:
npm install -g @bykitsune/router@1.0.2
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
