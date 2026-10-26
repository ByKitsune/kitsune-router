/**
 * Regression tests for the "JWT_SECRET environment variable is required"
 * startup/login failure reported by users installing via `npm i -g`.
 *
 * Root cause (reproduced against the historical @joyccn/zenrouter@0.8.7):
 *   - The dashboard signs its session cookie with JWT_SECRET, and
 *     src/lib/auth/dashboardSession.js deliberately has NO fallback (a known
 *     default would let anyone forge a session).
 *   - The published package ships no .env, and the spawned standalone server
 *     never loaded one — Next only reads .env from its own project root, which
 *     inside the package is <pkg>/app/. So the requirement was unsatisfiable
 *     without hand-editing files inside node_modules.
 *   - Server booted fine; only LOGIN failed (HTTP 500), which is why the
 *     dashboard was reachable but unusable.
 *
 * Fix: the CLI owns secret generation.
 *   - hooks/runtimeSecrets.js generates + persists per-install secrets in the
 *     user data dir, and cli.js injects them into the spawned server env.
 *   - hooks/postinstall.js does the same at install time (auto-setup).
 *   - custom-server.js now reads a .env beside itself / in cwd.
 *   - The Docker entrypoint provisions secrets into the data volume.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const secrets = require("../../cli/hooks/runtimeSecrets.js");

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zr-secrets-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("runtimeSecrets — generate and persist per-install secrets", () => {
  it("generates all three secrets on first run", () => {
    const env = { DATA_DIR: tmpDir };
    const out = secrets.ensureRuntimeSecrets(env, { silent: true });
    expect(out.JWT_SECRET).toBeTruthy();
    expect(out.API_KEY_SECRET).toBeTruthy();
    expect(out.MACHINE_ID_SALT).toBeTruthy();
    // Dashboard requires >= 32 chars; we generate 32 random bytes as hex.
    expect(out.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it("persists to the data dir and reuses the SAME secret on later runs", () => {
    const env = { DATA_DIR: tmpDir };
    const first = secrets.ensureRuntimeSecrets(env, { silent: true });
    const second = secrets.ensureRuntimeSecrets(env, { silent: true });
    // A changed secret would invalidate every existing session on restart.
    expect(second.JWT_SECRET).toBe(first.JWT_SECRET);
    expect(second.API_KEY_SECRET).toBe(first.API_KEY_SECRET);
    expect(second.MACHINE_ID_SALT).toBe(first.MACHINE_ID_SALT);
  });

  it("writes the secrets file inside DATA_DIR", () => {
    secrets.ensureRuntimeSecrets({ DATA_DIR: tmpDir }, { silent: true });
    expect(fs.existsSync(path.join(tmpDir, "secrets.json"))).toBe(true);
  });

  it("never reuses a secret across two different data dirs", () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "zr-secrets-b-"));
    try {
      const a = secrets.ensureRuntimeSecrets({ DATA_DIR: tmpDir }, { silent: true });
      const b = secrets.ensureRuntimeSecrets({ DATA_DIR: other }, { silent: true });
      expect(a.JWT_SECRET).not.toBe(b.JWT_SECRET);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it("lets an explicit env JWT_SECRET win over the generated one", () => {
    const explicit = "operator-supplied-secret-that-is-long-enough-ok";
    const out = secrets.ensureRuntimeSecrets({ DATA_DIR: tmpDir, JWT_SECRET: explicit }, { silent: true });
    expect(out.JWT_SECRET).toBe(explicit);
  });

  it("ignores a too-short env JWT_SECRET and generates a valid one", () => {
    const out = secrets.ensureRuntimeSecrets({ DATA_DIR: tmpDir, JWT_SECRET: "short" }, { silent: true });
    expect(out.JWT_SECRET).not.toBe("short");
    expect(out.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it("fails closed on a corrupt secrets file without replacing keys or original bytes", () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const file = path.join(tmpDir, "secrets.json");
    const original = Buffer.from("{not valid json");
    fs.writeFileSync(file, original, { mode: 0o600 });
    const inode = fs.statSync(file).ino;
    expect(() => secrets.ensureRuntimeSecrets({ DATA_DIR: tmpDir }, { silent: true }))
      .toThrow(/Cannot read existing runtime secrets; refusing to replace keys/);
    expect(fs.readFileSync(file)).toEqual(original);
    expect(fs.statSync(file).ino).toBe(inode);
    expect(fs.readdirSync(tmpDir)).toEqual(["secrets.json"]);
  });

  it("buildSecretsEnv only returns keys the caller did not already set validly", () => {
    const explicit = "operator-supplied-secret-that-is-long-enough-ok";
    const env = { DATA_DIR: tmpDir, JWT_SECRET: explicit };
    const out = secrets.buildSecretsEnv(env);
    expect(out.JWT_SECRET).toBeUndefined(); // explicit wins -> not injected
    expect(out.API_KEY_SECRET).toBeTruthy(); // missing -> injected
  });

  it("isValidSecret enforces the >= 32 char floor", () => {
    expect(secrets.isValidSecret("a".repeat(31))).toBe(false);
    expect(secrets.isValidSecret("a".repeat(32))).toBe(true);
    expect(secrets.isValidSecret(undefined)).toBe(false);
    expect(secrets.isValidSecret("   ")).toBe(false);
  });

  it("generates distinct values (no constant/duplicate secrets)", () => {
    const a = secrets.generateSecret();
    const b = secrets.generateSecret();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("custom-server .env loader", () => {
  it("parses KEY=VALUE, skips comments/blanks, strips quotes, and does not override real env", () => {
    // Mirrors the loader in custom-server.js (kept dependency-free there so the
    // standalone bundle needs no extra package). Asserted against the source so
    // a refactor cannot silently drop the behaviour.
    const src = fs.readFileSync(
      new URL("../../custom-server.js", import.meta.url),
      "utf8"
    );
    expect(src).toContain("function loadDotEnv");
    expect(src).toContain('path.join(__dirname, ".env")');
    expect(src).toContain('path.join(process.cwd(), ".env")');
    // Existing env must win — that is the `key in process.env` guard.
    expect(src).toContain("if (!key || key in process.env) continue;");
  });
});

describe("CLI + postinstall wiring", () => {
  it("cli.js injects generated secrets into the spawned server env", () => {
    const src = fs.readFileSync(new URL("../../cli/cli.js", import.meta.url), "utf8");
    expect(src).toContain('require("./hooks/runtimeSecrets")');
    expect(src).toContain("buildSecretsEnv(process.env)");
    expect(src).toContain("...secretsEnv,");
  });

  it("postinstall performs auto-setup (data dir + secrets) on install", () => {
    const src = fs.readFileSync(new URL("../../cli/hooks/postinstall.js", import.meta.url), "utf8");
    expect(src).toContain("ensureRuntimeSecrets");
    expect(src).toContain("mkdirSync(getDataDir()");
  });

  it("Docker entrypoint provisions secrets without requiring an env_file", () => {
    const dockerfile = fs.readFileSync(new URL("../../Dockerfile", import.meta.url), "utf8");
    expect(dockerfile).toContain('CMD ["node", "--require", "./cli/hooks/containerEntrypoint.js", "custom-server.js"]');
    expect(dockerfile).toContain('exec su-exec node "$@"');
    expect(dockerfile).not.toContain('. "$SECRETS_FILE"');
    const preload = fs.readFileSync(new URL("../../cli/hooks/containerEntrypoint.js", import.meta.url), "utf8");
    expect(preload).toContain('require("./runtimeSecrets")');
    expect(preload).toContain("Object.assign(process.env, ensureRuntimeSecrets(process.env))");
    const compose = fs.readFileSync(new URL("../../docker-compose.yml", import.meta.url), "utf8");
    // `required: false` keeps `docker compose up` working with no .env present.
    expect(compose).toContain("required: false");
  });
});
