# Installation

**Version 1.0.8 is published on npm, GitHub Release and canonical GHCR.** The
[publication receipt](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) records original-byte integrity, provenance and successful actual public-package
installation/runtime checks. GHCR publication/runtime verification is authenticated;
an anonymous pull grant returned HTTP 401, without establishing the visibility
setting. This patch fixes the managed-dependency retention issue recorded for
1.0.7 (`b7f77d07`). For npm 11.17, follow the [exact CLI lifecycle review guidance](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INSTALLATION.md#npm-1117-script-review).

**Current source version and stable target: 1.0.8.** Check the [publication receipt](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) for the actual GitHub Release, npm and GHCR results separately. Use each artifact only after its publication and registry readback are confirmed; a source tag or successful CI alone does not establish availability. The launcher requires **Node.js >=22.19.0**.

**Historical 1.0.2 distribution readback:**

**1.0.2 source verified; container published privately; npm blocked.** Runtime tag stays `65c8b97d`. Recovery `40485038668` published GHCR with authenticated digest/provenance/SPDX readback and published-image smoke passed. The package remains **private**; Public was selected but not confirmed, anonymous grants HTTP 401. Use source installation or authorized [container access](/en/deployment/cloud/). npm `@bykitsune/router` remains E403-denied with public readback HTTP 404; user-managed token replacement is not confirmed. Those observations did not establish npm availability; the old release required its own publication/readback verification. [Evidence](/en/changelog/).

Both old tags remain immutable. v1.0.1 at `74583402` passed SSH/CI, but its GHCR gate failed before login/push and npm publish failed (cause not yet known; public readback HTTP 404 on 2026-10-27). No canonical GHCR 1.0.1 image was published and no GitHub Release was created. v1.0.0 at `390a6567` did not publish npm/GHCR after its migration-test failure. See [release history](/en/changelog/); source tags are not registry artifacts.

## Launcher 1.0.8 — after publication and readback

```bash
npx @bykitsune/router@1.0.8
# Or:
npm install -g @bykitsune/router@1.0.8
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
