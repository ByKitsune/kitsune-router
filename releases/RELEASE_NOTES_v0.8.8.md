# 🌿 ZenRouter v0.8.8 Release Notes

> **Kitsune Router archive:** original ZenRouter release record; old names/artifacts and dated verification are preserved, not republished as Kitsune 0.x. Use [current docs](../docs/INSTALLATION.md) and [migration](../docs/MIGRATION.md).

ZenRouter `v0.8.8` makes a fresh install **work out of the box**. Previously you could reach the dashboard but never sign in — `npm i -g` produced a server that failed every login with `JWT_SECRET environment variable is required`.

---

## 🚑 The bug

After a clean global install:

1. The dashboard loaded fine at `http://localhost:20128` → you could see the password box.
2. Entering the password (`12345678` by default) returned
   ```json
   500 {"error":"JWT_SECRET environment variable is required. Set a strong random secret (min 32 chars) in your .env file."}
   ```
3. Following that instruction was **impossible**.

### Why the advice could not be followed

- The dashboard signs its session cookie with `JWT_SECRET`, and `src/lib/auth/dashboardSession.js` deliberately has **no fallback** — a known default secret would let anyone forge a session.
- The published package ships **no `.env`**.
- The spawned standalone server **never loaded one**. Next reads `.env` only from its own project root, which inside the package is `<pkg>/app/`.
- Putting a `.env` next to `cli.js`, or in the directory you launched from, was **silently ignored** (reproduced).
- The only working location was `node_modules/@joyccn/zenrouter/app/.env` — i.e. editing files inside `node_modules`, which any reinstall wipes.

The server itself booted normally; only **login** failed. That is why the UI was reachable, which made the failure so confusing.

---

## ✅ The fix — zero-setup install

**Nothing to configure. Install, run, log in.**

### CLI generates its own secrets
- New `cli/hooks/runtimeSecrets.js` creates `JWT_SECRET`, `API_KEY_SECRET` and `MACHINE_ID_SALT` — 32 random bytes each.
- Persisted in the data dir beside the database:
  - Windows: `%APPDATA%\zenrouter\secrets.json`
  - macOS / Linux: `~/.zenrouter/secrets.json`
- Written atomically with `0600` permissions.
- **Reused across restarts**, so sessions and machine identity survive a reboot. A rotating secret would have logged everyone out on every start.
- **Per install, never a shared default** — two installations get different secrets.
- An explicitly exported `JWT_SECRET` still wins, for operators who want full control.

### Auto-setup at install time
- `hooks/postinstall.js` now creates the data directory and generates the secrets during `npm install`, so the very first `zenrouter` run is immediately usable — no lazy first-run generation.

### `.env` is finally honoured
- `custom-server.js` gained a small dependency-free loader that runs **before** anything reads `process.env`.
- It checks `.env` beside the server and in the current working directory.
- Real environment variables are **never** overridden, and a malformed file cannot prevent boot.

### Docker needs no `.env` either
- The image entrypoint provisions secrets into the data volume when `JWT_SECRET` is unset or shorter than 32 characters, and reuses them on restart.
- `docker-compose.yml` marks `env_file: .env` as `required: false`, so `docker compose up` works with no `.env` file present.

---

## 🧪 Verification

Reproduced the original failure against published `@joyccn/zenrouter@0.8.7`, then confirmed the fix end-to-end on Windows:

| Step | Result |
| :--- | :--- |
| Fresh install + postinstall | `data dir ready` + `runtime secrets ready (3 keys)` |
| Server start | boots normally |
| `POST /api/auth/login` | **`200 {"success":true}`** |
| `GET /api/auth/status` with cookie | `authenticated: true` |
| `GET /api/providers` (protected) | `200` |
| Restart → same secret | identical across runs → sessions survive |

Docker entrypoint logic exercised for four scenarios: fresh container, restart (reuse), explicit `JWT_SECRET` wins, and a too-short value replaced.

New suite `tests/unit/runtime-secrets-autosetup.test.js` — **14 tests** covering generation, persistence/stability, per-install isolation, explicit-env precedence, corrupt-file recovery, and postinstall/CLI/Docker wiring.

---

## 📝 For existing users

Nothing to do. Upgrading regenerates nothing — if you already had a `JWT_SECRET` in env or `app/.env`, it continues to be used. If you never had one, the CLI now generates it on first run.

If you want to see or move the generated values, they are plain JSON at `%APPDATA%\zenrouter\secrets.json` (Windows) or `~/.zenrouter/secrets.json`.

**Security note:** keep `secrets.json` private — anyone holding `JWT_SECRET` can mint a valid dashboard session.
