# Localhost Deployment

Dashboard and API share port **20128**, not a separate default at 3000. The current stable target is **1.0.7**. Use the launcher only after npm publication/readback is confirmed in the [publication receipt](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md); container publication and access require separate verification. Use [source installation](/en/getting-started/installation/) with Node.js >=22.19.0 or the current [container instructions](/en/deployment/cloud/).

**Historical 1.0.2 readback:** Runtime `65c8b97d` had a privately published container, pending anonymous access and blocked npm publication. Those results do not determine 1.0.7 availability.

```bash
# Only after npm 1.0.7 publication and readback:
kitsune-router
```

- Dashboard: `http://localhost:20128/dashboard`
- OpenAI-compatible base: `http://localhost:20128/v1`
- Health: `http://localhost:20128/api/health`
- Default state: `~/.kitsune-router` or `%APPDATA%\kitsune-router`

## Explicit state

```bash
DATA_DIR=/absolute/private/path kitsune-router
```

Explicit `DATA_DIR` is authoritative and not relocated. Stop gracefully through the launcher or `Ctrl+C`; do not use broad process-kill recipes or run concurrent writers. Back up the whole stopped directory: SQLite plus secrets, machine identity, auth and optional certificates. Do not restore by blindly copying over active state or relaxing permissions.

## Migration

Default startup can verify/copy stopped `~/.zenrouter` or `~/.9router` into `~/.kitsune-router`, preserving originals and refusing existing destination overwrite. Review [migration](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) first. Existing crypto derivation inputs and trusted certificate roots stay unchanged.

Set a strong `INITIAL_PASSWORD` before exposure. For source deployments use an absolute `DATA_DIR` and explicit `PORT`/base URL; consult [operations](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md) and `.env.example`, not old Node 20/`db.json` instructions. No ByKitsune account is required.
