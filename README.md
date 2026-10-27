<div align="center">
  <img src="public/brand/bykitsune-favicon.png" width="96" height="96" alt="Kitsune Router — ByKitsune" />
  <h1>Kitsune Router</h1>
  <p><strong>Your models. Your routes.</strong></p>
  <p>A provider-neutral, local-first AI gateway. Maintained and sponsored by <a href="https://bykitsune.com">ByKitsune</a>.</p>
  <p><a href="https://github.com/ByKitsune/kitsune-router">GitHub</a> · <a href="https://github.com/ByKitsune/kitsune-router/releases">Releases</a> · <a href="CHANGELOG.md">Changelog</a> · <a href="LICENSE">MIT license</a></p>
</div>

Kitsune Router connects coding tools, agents and SDKs to the providers **you choose** through a local dashboard and compatible APIs. Configure accounts, model combos, fallback, translation and usage tracking without a required ByKitsune account or a prescribed provider order. Requests still go to the upstreams you configure; local-first does not mean offline inference.

## Release status

**1.0.2 is the user-authorized next release candidate; final SHA/tag, verification gates and npm/GHCR publication are pending.** GitHub: [`ByKitsune/kitsune-router`](https://github.com/ByKitsune/kitsune-router); npm: [`@bykitsune/router`](https://www.npmjs.com/package/@bykitsune/router); command: `kitsune-router`; canonical image: `ghcr.io/bykitsune/kitsune-router`. Commands below apply **after verified publication**; use a source checkout now.

**Previous tags stay immutable.** [v1.0.1](releases/RELEASE_NOTES_v1.0.1.md) remains at `745834026a5a9f55dffce40c0ad01bf3106e8237`: SSH/CI passed, but the GHCR gate failed before login/push and npm's publish command failed (cause not yet known; public readback HTTP 404 on 2026-10-27). No canonical GHCR 1.0.1 image was published and no GitHub Release was created. [v1.0.0](releases/RELEASE_NOTES_v1.0.0.md) remains at `390a65677c06a30084386d2a2adf8b0c48709281`, without npm/GHCR publication after its migration-test failure. Source tags are not registry artifacts.

The [1.0.2 follow-up](releases/RELEASE_NOTES_v1.0.2.md) makes timestamp-sensitive cache tests deterministic and npm failure diagnostics readable; production priority ordering and fail-closed migration ownership checks are unchanged. Prior pass counts do not verify 1.0.2. Earlier 0.x records remain original ZenRouter artifacts. Read the [migration guide](docs/MIGRATION.md).

Documentation preview: [rebrand candidate](https://rebrand-candidate.kitsune-router-docs.pages.dev/en/) on the verified official Cloudflare account. It is not release, production-deployment or custom-domain/DNS evidence.

## Quick start

Requires **Node.js >=22.19.0** for the launcher.

```bash
# After 1.0.2 is published and verified:
npx @bykitsune/router@1.0.2

# Or install the launcher globally:
npm install -g @bykitsune/router@1.0.2
kitsune-router
```

For a source checkout, run these commands from the repository root (there is no `app/` subdirectory):

For a **fresh** source install, generate the session secret once in a private `.env` as below (POSIX shell and OpenSSL). `next dev` does **not** use the launcher's automatic secret setup; without a strong `JWT_SECRET` of at least 32 characters dashboard login fails. For an upgrade/migration, retain the existing effective `JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT` and absolute `DATA_DIR` instead; follow [migration](docs/MIGRATION.md) before starting.

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

The canonical repository is available; an existing checkout can also be used. The launcher can bind beyond loopback by default; for a local-only session use `kitsune-router --host 127.0.0.1` (or append `--host 127.0.0.1` to NPX). Set a strong `INITIAL_PASSWORD` in your private environment before exposing the service. Open `http://localhost:20128/dashboard`, connect a permitted upstream, create/copy a gateway API key, and select a model actually listed by your installation.

Review `.env` before startup: use a writable **absolute** state path and fresh private API/identity secrets rather than published example values on a new install; keep all existing values on upgrades. Never commit `.env` or print its secrets in logs/issues.

| Address | Purpose |
| --- | --- |
| `http://localhost:20128/dashboard` | Provider, credential, combo and usage management |
| `http://localhost:20128/v1` | OpenAI-compatible client base URL |
| `http://localhost:20128/v1/messages` | Anthropic-compatible Messages endpoint |
| `http://localhost:20128/v1/models` | Available model/route discovery |
| `http://localhost:20128/api/health` | Health probe; not proof of upstream availability |

### Containers

The publication workflow targets **linux/amd64 only**. After verifying the image exists and you have access:

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

Set `INITIAL_PASSWORD` securely in the invoking environment first. The example uses default `/app/data`; for a supported custom absolute `DATA_DIR`, keep the same existing volume mounted at that exact effective path. Do not substitute an empty volume just to rename the service. See [Docker](DOCKER.md).

## Capabilities and limits

- **Multi-provider routing:** explicit model combos and account pools, with quota-aware fallback and cancellation/error handling. No bypass of provider quotas, regional restrictions or terms.
- **Protocol translation:** Chat Completions, Responses, Anthropic Messages, Gemini and Ollama-compatible surfaces, with route-specific support. Unrepresentable controls or documents may be rejected rather than silently discarded.
- **Local state:** SQLite configuration/usage plus installation secrets and optional auth/certificate files. Protect the whole data directory; do not assume all stored provider keys are encrypted at rest.
- **Optional token-saving tools:** RTK, Headroom and related controls can reduce some workloads. Savings, answer quality and latency depend on the workload; no fixed percentage or uninterrupted availability is promised.
- **Tool integrations:** dashboard presets for coding tools and documented manual configurations. Use `kitsunerouter` as the **client provider key** and `kitsune-router` as the **executable**.
- **Usage visibility:** measured tokens, known cost subtotals and unknown prices are distinct. Estimates are not invoices; subscription credits are not API-dollar charges.

## Migrating from ZenRouter / 9Router

Stop the old gateway and its helpers, then back up the **entire** state directory. Without an explicit `DATA_DIR`, first startup can migrate `~/.zenrouter` or `~/.9router` to `~/.kitsune-router` (Windows uses `%APPDATA%`). It verifies a consistent database snapshot and retained files, leaves originals in place, and refuses to overwrite an existing destination. `DATA_DIR` remains authoritative.

Preserve `secrets.json`, `machine-id`, `auth/`, and `mitm/` as well as the database. Encryption derivation constants and existing trusted certificate roots are intentionally retained. Rename project environment settings to `KITSUNE_ROUTER_*`, re-apply client presets using `kitsunerouter`, and use extension headers named `x-kitsune-router-*`. Standard `/v1/*` paths and port **20128** do not change. There is no required old-command/provider-key alias. Read [MIGRATION.md](docs/MIGRATION.md) before switching.

## Documentation and development

- [Installation](docs/INSTALLATION.md) · [Integrations](docs/INTEGRATIONS.md) · [Operations](docs/OPERATIONS.md)
- [Architecture](docs/ARCHITECTURE.md) · [Processing speed](docs/PROCESSING-SPEED.md) · [Reasoning](docs/REASONING-BUDGETS.md) · [Web search](docs/WEB-SEARCH.md)
- [Tests and verification boundaries](tests/README.md) · [Contributor/agent guidance](CLAUDE.md)
- [Historical audits](docs/audit/README.md) · [Release history](CHANGELOG.md)

This documentation pass does not certify a current test/build result. Use SHA-bound release verification rather than historical pass counts.

**Languages:** [简体中文](README.zh-CN.md) · [Español](i18n/README.es.md) · [فارسی](i18n/README.fa_IR.md) · [Français](i18n/README.fr.md) · [Indonesia](i18n/README.id-ID.md) · [日本語](i18n/README.ja-JP.md) · [Português](i18n/README.pt-BR.md) · [Русский](i18n/README.ru.md) · [ไทย](i18n/README.th.md) · [Tiếng Việt](i18n/README.vi.md)

## Maintainers, acknowledgments and license

[ByKitsune](https://bykitsune.com) maintains and sponsors Kitsune Router with the community. A hosted ByKitsune service is optional, not a prerequisite or preferred routing destination.

Kitsune Router continues ZenRouter and its 9Router lineage. Credit remains with their authors and contributors, including Joy, and with [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI), [RTK](https://github.com/rtk-ai/rtk), [Caveman](https://github.com/JuliusBrussee/caveman) and [Ponytail](https://github.com/DietrichGebert/ponytail) for the acknowledged implementations and ideas. The rebrand does not replace upstream copyright notices or historical artifact provenance. See [LICENSE](LICENSE).
