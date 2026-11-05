import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const areas = [];
const servers = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise(resolve => server.close(resolve));
  for (const area of areas.splice(0)) fs.rmSync(area, { recursive: true, force: true });
});

// Run only the actual hooks in a child, not the launcher. The parent remains
// available to serve the local fixture registry while npm runs synchronously.
const harness = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const options = JSON.parse(process.argv[2]);
const env = { ...process.env, DATA_DIR: options.data };
const transactionSelectors = () => Object.fromEntries(Object.entries(env).filter(([key]) => /^npm_config_allow[-_]scripts$/i.test(key)));
const parentSelectorsBefore = transactionSelectors();
const calls = [];
const warnings = [];
function load(name, sqlite) {
  const filename = path.join(options.root, 'cli/hooks', name);
  const fixture = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: fixture, exports: fixture.exports, Buffer,
    __dirname: path.join(options.area, 'cli/hooks'),
    process: { env, platform: process.platform, arch: process.arch,
      versions: process.versions, report: process.report },
    console: { log() {}, warn(message) { warnings.push(String(message)); } },
    require(name) {
      if (name === './dataDirectory') return { resolveDataDirectory: () => options.data };
      if (name === './sqliteRuntime') return sqlite;
      if (name === 'child_process') return { ...cp, spawnSync(command, args, opts) {
        const result = cp.spawnSync(command, args, opts);
        calls.push({ command, args, status: result.status, stderr: result.stderr });
        return result;
      } };
      return require(name);
    },
  }, { filename });
  return fixture.exports;
}
const sqlite = load('sqliteRuntime.js');
const tray = load('trayRuntime.js', sqlite);
const installed = () => Object.fromEntries(['better-sqlite3', 'systray2'].map(name =>
  [name, fs.existsSync(path.join(options.data, 'runtime/node_modules', name, 'package.json'))]));
try {
  const specs = Object.entries(options.initial || {}).map(([name, version]) => name + '@' + version);
  let seed;
  if (specs.length) {
    // Model an old --no-save npm installation, including its resolved hidden
    // lock metadata. Copying package.json alone fabricates an untrusted source
    // that current npm correctly refuses to match to an exact registry policy.
    const result = cp.spawnSync('npm', ['install', ...specs, '--no-save', '--ignore-scripts',
      '--no-audit', '--no-fund', '--prefer-online', '--global=false', '--location=project',
      '--prefix', path.join(options.data, 'runtime')], {
      cwd: path.join(options.data, 'runtime'), env, encoding: 'utf8', timeout: 60000,
    });
    seed = { status: result.status, stderr: result.stderr };
    if (result.status !== 0) throw new Error('Legacy npm fixture seed failed: ' + result.stderr);
  }
  const first = {};
  for (const which of options.order) first[which] = which === 'sqlite'
    ? sqlite.ensureSqliteRuntime({ silent: false }) : tray.ensureTrayRuntime({ silent: false });
  const firstInstalled = installed();
  const before = calls.length;
  const second = { sqlite: sqlite.ensureSqliteRuntime({ silent: false }), tray: tray.ensureTrayRuntime({ silent: false }) };
  process.stdout.write(JSON.stringify({ first, firstInstalled, second, installed: installed(),
    secondInstallCalls: calls.length - before, calls, warnings, seed,
    parentSelectorsBefore, parentSelectorsAfter: transactionSelectors() }));
} catch (error) {
  process.stdout.write(JSON.stringify({ error: error.message, calls, warnings }));
}
`;

function createArea({ bundledSqlJs = true, allowScripts = { "better-sqlite3@13.0.3": false } } = {}) {
  const area = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune runtime retention "));
  areas.push(area);
  const data = path.join(area, "private data");
  const runtime = path.join(data, "runtime");
  fs.mkdirSync(runtime, { recursive: true });
  const bundled = path.join(area, "cli/app/node_modules/sql.js/dist");
  fs.mkdirSync(bundled, { recursive: true });
  if (bundledSqlJs) fs.writeFileSync(path.join(bundled, "sql-wasm.wasm"), "fixture-only-wasm");
  fs.writeFileSync(path.join(data, "existing-state"), "existing state stays byte identical");
  fs.writeFileSync(path.join(runtime, "package.json"), JSON.stringify({
    name: "private-runtime-fixture", version: "1.0.0", private: true,
    fixtureMetadata: { keep: ["existing", "metadata"] },
    // The synthetic native install script is a deliberate trap, reviewed as
    // denied. Keep command assertions below so this policy cannot mask loss
    // of the production --ignore-scripts guards on supported N-API installs.
    ...(allowScripts === undefined ? {} : { allowScripts }),
  }));
  const script = path.join(area, "hooks-fixture.cjs");
  fs.writeFileSync(script, harness);
  const userconfig = path.join(area, "empty npmrc");
  fs.writeFileSync(userconfig, "");
  return { area, data, runtime, script, userconfig };
}

function fixturePackage(area, name, version, { unsupported = false } = {}) {
  const folder = path.join(area, `${name}-${version}`, "package");
  fs.mkdirSync(folder, { recursive: true });
  const pkg = { name, version, ...(unsupported ? { os: [`!${process.platform}`] } : {}),
    ...(name === "better-sqlite3" ? { scripts: { install: "node -e \"process.exit(97)\"" } } : {}) };
  fs.writeFileSync(path.join(folder, "package.json"), JSON.stringify(pkg));
  if (name === "better-sqlite3") {
    const prebuilds = path.join(folder, "prebuilds");
    fs.mkdirSync(prebuilds);
    // Valid magic only; this fixture must never load a native binary. Database
    // runtime behavior is covered separately from npm's retention semantics.
    const magic = Buffer.from(process.platform === "darwin" ? "cffaedfe" : "7f454c46", "hex");
    for (const platform of new Set([process.platform, "linuxmusl"])) {
      fs.writeFileSync(path.join(prebuilds, `${platform}-${process.arch}.node`), magic);
    }
  } else if (name === "sql.js") {
    fs.mkdirSync(path.join(folder, "dist"));
    fs.writeFileSync(path.join(folder, "dist/sql-wasm.wasm"), "fixture-only-wasm");
  } else {
    const traybin = path.join(folder, "traybin");
    fs.mkdirSync(traybin);
    fs.writeFileSync(path.join(traybin, process.platform === "darwin" ? "tray_darwin_release" : "tray_linux_release"), "fixture only");
  }
  const tarball = path.join(area, `${name}-${version}.tgz`);
  execFileSync("tar", ["-czf", tarball, "-C", path.dirname(folder), "package"]);
  return { name, version, folder, pkg, tarball, bytes: fs.readFileSync(tarball) };
}

async function fixtureRegistry(area, options = {}) {
  const packages = [fixturePackage(area, "better-sqlite3", "13.0.3", { unsupported: options.unsupportedNative }),
    fixturePackage(area, "systray2", "2.1.4"), fixturePackage(area, "sql.js", "1.15.2"),
    fixturePackage(area, "better-sqlite3", "12.11.1"), fixturePackage(area, "systray2", "2.1.3")];
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    const requestPath = new URL(req.url, "http://fixture.invalid").pathname;
    const tarball = packages.find(pkg => requestPath === `/${pkg.name}/-/${pkg.name}-${pkg.version}.tgz`);
    if (tarball) { res.writeHead(200, { "content-type": "application/octet-stream" }).end(tarball.bytes); return; }
    const matching = packages.filter(pkg => requestPath === `/${pkg.name}`);
    if (!matching.length) { res.writeHead(404).end(); return; }
    const base = `http://127.0.0.1:${server.address().port}`;
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      name: matching[0].name, "dist-tags": { latest: matching[0].version }, versions: Object.fromEntries(matching.map(pkg => [pkg.version, {
        ...pkg.pkg, dist: { tarball: `${base}/${pkg.name}/-/${pkg.name}-${pkg.version}.tgz`,
          integrity: `sha512-${createHash("sha512").update(pkg.bytes).digest("base64")}` },
      }])),
    }));
  });
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { packages, requests, url: `http://127.0.0.1:${server.address().port}` };
}

async function runHooks(fixture, registry, order, initial = {}, approvalEnv = {}) {
  const env = { ...process.env, npm_config_userconfig: fixture.userconfig,
    npm_config_cache: path.join(fixture.area, "npm cache"), npm_config_update_notifier: "false",
    npm_config_registry: registry.url, npm_config_fetch_retries: "0",
    npm_config_global: "true", npm_config_prefix: path.join(fixture.area, "unused global prefix"),
    npm_config_location: "global", ...approvalEnv };
  const child = await exec(process.execPath, [fixture.script, JSON.stringify({ ...fixture, root, order, initial })], { env, timeout: 60000 });
  expect(child.stderr).toBe("");
  return JSON.parse(child.stdout);
}

describe("managed runtime dependencies survive real npm sibling installs", () => {
  // The Windows command/environment contract is tested independently; this
  // fixture exercises real POSIX npm and tar without requiring build tools.
  it.skipIf(process.platform === "win32").each([
    { initial: [], order: ["sqlite", "tray"] },
    { initial: [], order: ["tray", "sqlite"] },
    { initial: ["systray2"], order: ["sqlite", "tray"] },
    { initial: ["better-sqlite3"], order: ["sqlite", "tray"] },
    { initial: ["better-sqlite3", "systray2"], order: ["sqlite", "tray"] },
    { initial: ["better-sqlite3", "systray2"], oldVersions: true, order: ["sqlite", "tray"] },
    { initial: [], bundledSqlJs: false, order: ["sqlite", "tray"] },
  ])("retains both packages and skips second-startup installs: $initial / $order", async ({ initial, order, oldVersions, bundledSqlJs }) => {
    const fixture = createArea({ bundledSqlJs });
    const registry = await fixtureRegistry(fixture.area);
    const seed = Object.fromEntries(initial.map(name => [name,
      name === "better-sqlite3" ? (oldVersions ? "12.11.1" : "13.0.3") : (oldVersions ? "2.1.3" : "2.1.4")]));
    const result = await runHooks(fixture, registry, order, seed);
    expect(result.error).toBeUndefined();
    if (initial.length) expect(result.seed).toEqual({ status: 0, stderr: "" });
    expect(result.firstInstalled).toEqual({ "better-sqlite3": true, systray2: true });
    expect(result.installed).toEqual(result.firstInstalled);
    expect(result.second.sqlite).toEqual({ betterSqlite: true, sqlJs: true });
    expect(result.second.tray).toEqual({ systray: true });
    expect(result.secondInstallCalls).toBe(0);
    expect(result.warnings).toEqual([]);
    for (const call of result.calls) {
      expect(call.status, call.stderr).toBe(0);
      expect(call.stderr).toBe("");
      if (call.args.some(arg => arg === "better-sqlite3@13.0.3" || arg === "sql.js@1.15.2")) {
        expect(call.args).toContain("--ignore-scripts");
      }
    }
    if (initial.length === 2 && !oldVersions) {
      expect(result.calls).toEqual([]);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(fixture.runtime, "package.json"), "utf8"));
    expect(manifest.optionalDependencies).toEqual({ "better-sqlite3": "13.0.3", systray2: "2.1.4" });
    expect(manifest.allowScripts["better-sqlite3@13.0.3"]).toBe(false);
    if (bundledSqlJs === false) expect(manifest.dependencies["sql.js"]).toBe("1.15.2");
    expect(manifest.fixtureMetadata).toEqual({ keep: ["existing", "metadata"] });
    expect(fs.readFileSync(path.join(fixture.data, "existing-state"), "utf8")).toBe("existing state stays byte identical");
    expect(fs.existsSync(path.join(fixture.area, "unused global prefix"))).toBe(false);
    expect(fs.readFileSync(fixture.userconfig, "utf8")).toBe("");
    expect(fs.readdirSync(fixture.runtime).some(name => name.endsWith(".tmp"))).toBe(false);
  }, 90000);

  it.skipIf(process.platform === "win32").each([
    "npm_config_allow_scripts", "NPM_CONFIG_ALLOW_SCRIPTS", "npm_config_allow-scripts", "NpM_CoNfIg_AlLoW_sCrIpTs",
  ])("isolates the inherited own-CLI transaction selector %s from both managed installs", async key => {
    const allowScripts = { "better-sqlite3@13.0.3": false, "reviewed-addon@1.0.0": true, "blocked-addon": false };
    const fixture = createArea({ allowScripts });
    const registry = await fixtureRegistry(fixture.area);
    const userconfig = "strict-ssl=true\nsave-exact=true\n";
    fs.writeFileSync(fixture.userconfig, userconfig);
    const approval = { [key]: `file:${path.join(fixture.area, "verified-own-cli-1.0.8.tgz")}` };
    // npm test can export an empty lowercase default alongside the injected
    // variant. Preserve the entire composed parent, including that default.
    const expectedParentSelectors = Object.fromEntries(Object.entries({ ...process.env, ...approval })
      .filter(([name]) => /^npm_config_allow[-_]scripts$/i.test(name)));
    const result = await runHooks(fixture, registry, ["sqlite", "tray"], {}, approval);
    expect(result.error).toBeUndefined();
    expect(result.parentSelectorsBefore).toEqual(expectedParentSelectors);
    expect(result.parentSelectorsAfter).toEqual(expectedParentSelectors);
    expect(result.firstInstalled).toEqual({ "better-sqlite3": true, systray2: true });
    expect(result.secondInstallCalls).toBe(0);
    expect(result.warnings).toEqual([]);
    expect(result.calls).toHaveLength(2);
    for (const call of result.calls) {
      expect(call.status, call.stderr).toBe(0);
      expect(call.stderr).toBe("");
    }
    expect(result.calls[0].args).toContain("--ignore-scripts");
    const manifest = JSON.parse(fs.readFileSync(path.join(fixture.runtime, "package.json"), "utf8"));
    expect(manifest.optionalDependencies).toEqual({ "better-sqlite3": "13.0.3", systray2: "2.1.4" });
    expect(manifest.allowScripts).toEqual(allowScripts);
    expect(fs.readFileSync(fixture.userconfig, "utf8")).toBe(userconfig);
  }, 90000);

  it.skipIf(process.platform === "win32").each([
    {},
    { "better-sqlite3@13.0.3": true, "better-sqlite3@12.11.1": true, "unrelated-addon": true, "blocked-addon@2.0.0": false },
    { "better-sqlite3": true, "better-sqlite3@13.0.3": false, "unrelated-addon": false },
  ])("denies only the managed N-API lifecycle and preserves other reviewed decisions: %j", async allowScripts => {
    const fixture = createArea({ allowScripts });
    const registry = await fixtureRegistry(fixture.area);
    for (const pkg of registry.packages.filter(pkg => (pkg.name === "better-sqlite3" && pkg.version === "13.0.3")
      || (pkg.name === "systray2" && pkg.version === "2.1.4"))) {
      fs.cpSync(pkg.folder, path.join(fixture.runtime, "node_modules", pkg.name), { recursive: true });
    }
    const result = await runHooks(fixture, registry, ["sqlite", "tray"]);
    expect(result.error).toBeUndefined();
    expect(result.calls).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(registry.requests).toEqual([]);
    const manifest = JSON.parse(fs.readFileSync(path.join(fixture.runtime, "package.json"), "utf8"));
    expect(manifest.allowScripts).toEqual({ ...allowScripts, "better-sqlite3@13.0.3": false });
    const original = fs.readFileSync(path.join(fixture.runtime, "package.json"));
    const second = await runHooks(fixture, registry, ["sqlite", "tray"]);
    expect(second.calls).toEqual([]);
    expect(fs.readFileSync(path.join(fixture.runtime, "package.json"))).toEqual(original);
  }, 90000);

  it.skipIf(process.platform === "win32")("keeps unsupported native installation optional and reports its absence", async () => {
    const fixture = createArea();
    const registry = await fixtureRegistry(fixture.area, { unsupportedNative: true });
    const result = await runHooks(fixture, registry, ["sqlite", "tray"]);
    expect(result.error).toBeUndefined();
    expect(result.first.sqlite).toEqual({ betterSqlite: false, sqlJs: true });
    expect(result.first.tray).toEqual({ systray: true });
    expect(result.installed).toEqual({ "better-sqlite3": false, systray2: true });
    expect(result.warnings.some(warning => /SQLite engine unavailable/.test(warning))).toBe(true);
  }, 90000);

  it.skipIf(process.platform === "win32").each([
    "{malformed", "null", "[]", '{"optionalDependencies":[]}',
    '{"allowScripts":[]}', '{"allowScripts":null}', '{"allowScripts":true}',
    '{"allowScripts":{"better-sqlite3@13.0.3":"true"}}',
  ])("preserves invalid runtime manifests byte-for-byte: %s", async original => {
    const fixture = createArea();
    fs.writeFileSync(path.join(fixture.runtime, "package.json"), original);
    const result = await runHooks(fixture, { url: "http://127.0.0.1:1" }, ["sqlite", "tray"]);
    expect(result.error).toBeTypeOf("string");
    expect(result.calls).toEqual([]);
    expect(fs.readFileSync(path.join(fixture.runtime, "package.json"), "utf8")).toBe(original);
    expect(fs.readdirSync(fixture.runtime)).toEqual(["package.json"]);
  });
});
