#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UI_TEST_HOST, UI_TEST_PORT, UI_TEST_PASSWORD } from "../tests/browser/test-settings.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = join(root, ".next/standalone/custom-server.js");
if (!existsSync(server)) {
  console.error("UI tests require a production build. Run npm run build first.");
  process.exit(1);
}
// Next and the custom server load .env files beside the standalone server.
// Refuse such a build rather than silently importing real provider credentials.
const embeddedEnvironment = readdirSync(dirname(server)).filter(name => name === ".env" || name.startsWith(".env."));
if (embeddedEnvironment.length) {
  console.error("UI tests refuse a standalone build containing .env files. Build from an isolated source configuration first.");
  process.exit(1);
}
const temporary = mkdtempSync(join(tmpdir(), "kitsune-browser-"));
const home = join(temporary, "home");
const data = join(temporary, "data");
mkdirSync(home, { recursive: true, mode: 0o700 });
mkdirSync(data, { recursive: true, mode: 0o700 });

// Intentionally create the environment from a short allowlist. Provider tokens,
// real gateway credentials, proxy secrets and operator .env files are not used.
const child = spawn(process.execPath, [server], {
  cwd: temporary,
  detached: process.platform !== "win32",
  stdio: "inherit",
  env: {
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    HOME: home,
    DATA_DIR: data,
    NODE_ENV: "production",
    HOSTNAME: UI_TEST_HOST,
    PORT: String(UI_TEST_PORT),
    BASE_URL: `http://${UI_TEST_HOST}:${UI_TEST_PORT}`,
    JWT_SECRET: randomBytes(32).toString("hex"),
    API_KEY_SECRET: randomBytes(32).toString("hex"),
    MACHINE_ID_SALT: randomBytes(32).toString("hex"),
    INITIAL_PASSWORD: UI_TEST_PASSWORD,
    RUN_REAL: "0", RUN_E2E: "0", RUN_LIVE_TESTS: "0", AG_CACHE_TEST: "0",
    MODEL_CATALOG_SYNC: "off",
    DISABLE_BACKGROUND_TOKEN_REFRESH: "1",
    KITSUNE_ROUTER_DISABLE_MITM: "1",
    KITSUNE_ROUTER_MIGRATION: "skip",
    NEXT_TELEMETRY_DISABLED: "1",
    TZ: "UTC",
  },
});
let stopping = false;
let finished = false;
let deadline;
function signalChild(signal) {
  try {
    if (process.platform === "win32") child.kill(signal);
    else if (child.pid) process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") console.error("Could not stop UI test process:", error.message);
  }
}
function finish(code) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  // The browser fixture owns this directory; no repository/runtime state lives here.
  rmSync(temporary, { recursive: true, force: true });
  process.exit(code);
}
function stop() {
  if (stopping) return;
  stopping = true;
  signalChild("SIGTERM");
  deadline = setTimeout(() => { signalChild("SIGKILL"); finish(0); }, 10000);
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
process.once("exit", () => {
  signalChild("SIGKILL");
  rmSync(temporary, { recursive: true, force: true });
});
child.once("error", (error) => { console.error("Unable to start UI test server:", error.message); finish(1); });
child.once("exit", (code) => finish(stopping ? 0 : code ?? 1));
