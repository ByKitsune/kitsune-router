import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// Exercise the actual npm tarball, not the pre-pack build directory. No real
// application state, inherited credentials, or background network jobs are used.
assert.equal(process.argv.length, 3, "Expected exactly one CLI package tarball");
const archive = path.resolve(process.argv[2]);
assert(existsSync(archive), "CLI package tarball is missing");
const runnerTemp = process.env.RUNNER_TEMP;
assert(runnerTemp && path.isAbsolute(runnerTemp), "Absolute RUNNER_TEMP required");
const fixture = mkdtempSync(path.join(runnerTemp, "kitsune-packed-sqljs-"));
let child;
let output = "";

function hash(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function stop() {
  if (!child) return;
  const running = child;
  child = undefined;
  if (running.exitCode !== null || running.signalCode !== null) return;
  const exited = new Promise(resolve => running.once("exit", (code, signal) => resolve({ code, signal })));
  running.kill("SIGTERM");
  let timer;
  const result = await Promise.race([
    exited,
    new Promise(resolve => { timer = setTimeout(() => resolve(null), 15000); }),
  ]);
  clearTimeout(timer);
  if (!result) {
    running.kill("SIGKILL");
    await exited;
    throw new Error("Synthetic SQL.js server failed to shut down");
  }
  assert.deepEqual(result, { code: 0, signal: null }, "Synthetic SQL.js server exited uncleanly");
}

try {
  const extract = `import sys, tarfile
from pathlib import PurePosixPath
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    entries = archive.getmembers()
    assert entries and len(entries) < 200000 and sum(x.size for x in entries) < 2 * 1024**3
    seen = set()
    for entry in entries:
        path = PurePosixPath(entry.name)
        assert not path.is_absolute() and path.parts and path.parts[0] == 'package'
        assert all(part not in ('..', '.') for part in path.parts)
        assert entry.name not in seen and (entry.isfile() or entry.isdir())
        assert not any(part == '.env' or part.startswith('.env.') for part in path.parts)
        seen.add(entry.name)
    archive.extractall(sys.argv[2], filter='data')
`;
  execFileSync("python3", ["-c", extract, archive, fixture], { timeout: 120000, stdio: "pipe" });
  const app = path.join(fixture, "package/app");
  const packagedSql = path.join(app, "node_modules/sql.js");
  const installedSql = path.resolve("node_modules/sql.js");
  const version = directory => JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")).version;
  assert.equal(version(packagedSql), version(installedSql), "Packaged SQL.js version differs from the build dependency");
  for (const file of ["dist/sql-wasm.js", "dist/sql-wasm.wasm"]) {
    assert(existsSync(path.join(packagedSql, file)), `Packaged SQL.js is missing ${file}`);
    assert.equal(hash(path.join(packagedSql, file)), hash(path.join(installedSql, file)), `Packaged SQL.js ${file} differs from the build dependency`);
  }
  const data = path.join(fixture, "data");
  const home = path.join(fixture, "home");
  mkdirSync(path.join(data, "runtime/node_modules"), { recursive: true });
  mkdirSync(home, { recursive: true });
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const password = "synthetic-sqljs-test-password";
  const env = {
    PATH: process.env.PATH, HOME: home, DATA_DIR: data, PORT: String(port), HOSTNAME: "127.0.0.1",
    NODE_ENV: "production", NODE_PATH: `${path.join(data, "runtime/node_modules")}${path.delimiter}${path.join(app, "node_modules")}`,
    KITSUNE_ROUTER_SQLJS_SINGLE_PROCESS: "true", MODEL_CATALOG_SYNC: "off", DISABLE_BACKGROUND_TOKEN_REFRESH: "1",
    KITSUNE_ROUTER_DISABLE_MITM: "1", KITSUNE_ROUTER_MIGRATION: "skip", NEXT_TELEMETRY_DISABLED: "1", TZ: "UTC",
    INITIAL_PASSWORD: password, JWT_SECRET: "synthetic-jwt-secret-01234567890123456789",
    API_KEY_SECRET: "synthetic-api-key-secret-0123456789012345", MACHINE_ID_SALT: "synthetic-machine-salt-0123456789012345",
  };
  async function start(expectedAccounts) {
    output = "";
    child = spawn(process.execPath, ["--no-experimental-sqlite", path.join(app, "custom-server.js")], {
      cwd: path.join(fixture, "package"), env, stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", value => { output += value.toString(); });
    child.stderr.on("data", value => { output += value.toString(); });
    for (let i = 0; i < 120; i++) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error("Synthetic SQL.js server exited before becoming healthy");
      try {
        const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) });
        if (response.ok) {
          const health = await response.json();
          assert.equal(health.ok, true);
          assert.equal(health.checks.database, true);
          assert.equal(health.checks.accounts, expectedAccounts);
          assert.match(output, /\[DB\] Driver: sql\.js\b/, "Server did not actually select the SQL.js fallback");
          return;
        }
      } catch (error) {
        if (error instanceof assert.AssertionError) throw error;
      }
      await sleep(250);
    }
    throw new Error("Synthetic SQL.js server did not become healthy");
  }
  async function request(route, options = {}, expected = 200) {
    const response = await fetch(base + route, { ...options, signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, expected, `${route}: unexpected HTTP status`);
    return { response, body: await response.json() };
  }
  async function login() {
    const { response, body } = await request("/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }),
    });
    assert.equal(body.success, true);
    const cookie = response.headers.getSetCookie().find(value => value.startsWith("auth_token="));
    assert(cookie, "Synthetic login cookie missing");
    return cookie.split(";")[0];
  }
  await start(0);
  const cookie = await login();
  const created = (await request("/api/providers", {
    method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ provider: "openai", name: "synthetic-sqljs", apiKey: "synthetic-sqljs-key" }),
  }, 201)).body.connection;
  assert(created.id);
  assert.equal(created.apiKey, undefined);
  await stop();
  await start(1);
  const newCookie = await login();
  const connections = (await request("/api/providers", { headers: { cookie: newCookie } })).body.connections;
  assert(connections.some(connection => connection.id === created.id && connection.name === "synthetic-sqljs"));
  await stop();
  console.log("Packed SQL.js fallback passed: matching JS/WASM, forced fallback, persistence and restart.");
} catch (error) {
  if (output) console.error(output.slice(-12000));
  throw error;
} finally {
  if (child) await stop().catch(() => {});
  rmSync(fixture, { recursive: true, force: true });
}
