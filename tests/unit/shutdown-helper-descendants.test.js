import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";

const io = vi.hoisted(() => ({
  manager: null, directory: "", children: [], admin: true, sudo: false, elevated: vi.fn(),
  exec: vi.fn(), execAsync: vi.fn(), execSync: vi.fn(), spawn: vi.fn(),
  fetch: vi.fn(), get: vi.fn(), request: vi.fn(), dns: vi.fn(), osDns: vi.fn(),
  settings: vi.fn(), update: vi.fn(), addDns: vi.fn(), removeDns: vi.fn(), removeAll: vi.fn(), removeSync: vi.fn(),
  generate: vi.fn(), trust: vi.fn(), install: vi.fn(), uninstall: vi.fn(), passwordCommand: vi.fn(),
  port: vi.fn(), usage: vi.fn(), details: vi.fn(), logs: vi.fn(), pools: vi.fn(), close: vi.fn(), catalog: vi.fn(),
}));
vi.mock("child_process", () => ({ exec: io.exec, execSync: io.execSync, spawn: io.spawn }));
vi.mock("https", () => ({ default: { get: io.get, request: io.request } }));
vi.mock("@/lib/dataDir.js", () => ({ get DATA_DIR() { return io.directory; } }));
vi.mock("@/lib/localDb", () => ({ getSettings: io.settings, updateSettings: io.update }));
vi.mock("@/mitm/manager", () => ({
  getHelperLifecycle: () => io.manager.getHelperLifecycle(),
  getCachedPassword: () => io.manager.getCachedPassword(),
  loadEncryptedPassword: (...args) => io.manager.loadEncryptedPassword(...args),
  initDbHooks: (...args) => io.manager.initDbHooks(...args),
}));
vi.mock("@/mitm/dns/dnsConfig", () => ({ execWithPassword: io.passwordCommand }));
vi.mock("../../src/lib/usageDb.js", () => ({ flushUsageQueue: io.usage, flushRequestDetails: io.details }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ flushRequestLogs: io.logs }));
vi.mock("../../open-sse/utils/transportPool.js", () => ({ closeUpstreamPools: io.pools }));
vi.mock("../../src/lib/db/driver.js", () => ({ closeDb: io.close }));
vi.mock("../../src/lib/modelCatalog/sync.js", () => ({ stopModelCatalogSync: io.catalog }));
vi.mock("../../src/shared/services/quotaAutoPing.js", () => ({ stopQuotaAutoPing: async () => {} }));
vi.mock("../../src/sse/services/backgroundTokenRefresh.js", () => ({ stopBackgroundTokenRefresh: async () => {} }));

const require = createRequire(import.meta.url);
const fs = require("node:fs");
const source = fs.readFileSync(new URL("../../src/mitm/manager.js", import.meta.url), "utf8");
const key = Symbol.for("zenrouter.helper.lifecycle");
let lifecycle, shutdown, raw, releases, expectedStopError;

function held() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  releases.push(resolve);
  return { promise, resolve };
}
async function microtasks() { for (let i = 0; i < 60; i++) await Promise.resolve(); }
function child() {
  const value = new EventEmitter();
  value.pid = 81000 + io.children.length;
  value.stdout = new EventEmitter();
  value.stderr = new EventEmitter();
  value.stdin = { write: vi.fn(), end: vi.fn() };
  value.unref = vi.fn();
  value.kill = vi.fn(() => {
    value.killed = true;
    queueMicrotask(() => { value.emit("exit", 0, "SIGTERM"); value.emit("close", 0, "SIGTERM"); });
    return true;
  });
  io.children.push(value);
  return value;
}
function loadManager({ platform = "linux", cert = null } = {}) {
  const fixtureModule = { exports: {} };
  const context = vm.createContext({
    globalThis, module: fixtureModule, exports: fixtureModule.exports, Buffer, URL, AbortSignal,
    setTimeout, clearTimeout, setInterval, clearInterval,
    __dirname: path.join(io.directory, "mitm"),
    process: {
      env: { DATA_DIR: io.directory, HOME: path.join(io.directory, "home"), MITM_SERVER_PATH: path.join(io.directory, "server.js") },
      platform, pid: 79999, execPath: "/synthetic/node", cwd: () => io.directory,
      getuid: () => process.getuid(), getgid: () => process.getgid(),
      kill: vi.fn(() => true), stdout: { write: vi.fn() },
    },
    fetch: (...args) => io.fetch(...args),
    require(name) {
      if (name === "child_process") return { exec: io.exec, execSync: io.execSync, spawn: io.spawn };
      if (name === "./paths") return { DATA_DIR: io.directory, MITM_DIR: path.join(io.directory, "mitm") };
      if (name === "./logger") return { log: vi.fn(), err: vi.fn() };
      if (name === "./config") return { LSOF_BIN: "/synthetic/lsof" };
      if (name === "./dns/dnsConfig") return {
        addDNSEntry: io.addDns, removeDNSEntry: io.removeDns, removeAllDNSEntries: io.removeAll,
        removeAllDNSEntriesSync: io.removeSync, checkAllDNSStatus: () => ({}),
        TOOL_HOSTS: { first: ["first.test"], second: ["second.test"] },
        isSudoAvailable: () => io.sudo, isSudoPasswordRequired: () => false, execWithPassword: io.passwordCommand,
      };
      if (name === "./winElevated.js") return { isAdmin: () => io.admin, runElevatedPowerShell: io.elevated, quotePs: value => `'${value}'` };
      if (name === "./cert/generate") return { generateCert: io.generate };
      if (name === "./cert/install") return cert || { checkCertInstalled: io.trust, installCert: io.install, uninstallCert: io.uninstall };
      if (name === "./cert/rootCA") return { isCertExpired: () => false };
      if (name === "net") return { createServer: io.port };
      if (name === "https") return { request: io.request };
      if (name === "dns") return { promises: {
        Resolver: class { setServers() {} resolve4(...args) { return io.dns(...args); } },
        resolve4: io.osDns,
      } };
      return require(name);
    },
  });
  vm.runInContext(source, context, { filename: "src/mitm/manager.js" });
  const manager = fixtureModule.exports;
  manager.initDbHooks(io.settings, io.update);
  return { manager, context };
}
function loadCert(platform) {
  const fixtureModule = { exports: {} };
  const filename = path.join(io.directory, "mitm", "rootCA.crt");
  const context = vm.createContext({
    module: fixtureModule, Buffer, process: { platform },
    require(name) {
      if (name === "fs") return {
        existsSync: value => value === filename || value === "/usr/local/share/ca-certificates",
        readFileSync: value => { if (value !== filename) throw new Error("Unexpected certificate read"); return fs.readFileSync(filename, "utf8"); },
      };
      if (name === "child_process") return { exec: io.exec };
      if (name === "../dns/dnsConfig.js") return { execWithPassword: io.passwordCommand, isSudoAvailable: () => io.sudo };
      if (name === "../winElevated.js") return { runElevatedPowerShell: io.elevated, quotePs: value => `'${value}'` };
      if (name === "../logger") return { log: vi.fn(), err: vi.fn() };
      if (name === "crypto") return require("node:crypto");
      throw new Error(`Unexpected certificate dependency ${name}`);
    },
  });
  vm.runInContext(fs.readFileSync(new URL("../../src/mitm/cert/install.js", import.meta.url), "utf8"), context);
  return fixtureModule.exports;
}
function binary() {
  const filename = path.join(io.directory, "bin", "cloudflared");
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const buffer = Buffer.alloc(1024 * 1024);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(buffer);
  fs.writeFileSync(filename, buffer);
  return filename;
}
function response(body = "{}") { return { ok: true, body: { cancel: vi.fn(async () => {}) }, text: async () => body }; }
async function startCloud() {
  const manager = await import("../../src/lib/tunnel/cloudflare/manager.js");
  const active = manager.enableTunnel();
  active.catch(() => {});
  await microtasks();
  io.children.at(-1).stderr.emit("data", Buffer.from("https://one.trycloudflare.com"));
  await active;
  return manager;
}
async function startMitm() {
  const active = raw.manager.startServer("synthetic-key");
  active.catch(() => {});
  await microtasks();
  await vi.advanceTimersByTimeAsync(500);
  await active;
  return io.children.at(-1);
}
async function stopRuntime() {
  const { installRuntimeLifecycle } = await import("../../src/lib/runtimeLifecycle.js");
  installRuntimeLifecycle();
  return shutdown.runShutdownHooks({ deadlineMs: 10000 });
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  vi.stubEnv("ZENROUTER_MANAGED_SHUTDOWN", "1");
  vi.spyOn(process, "kill").mockImplementation(() => true);
  delete globalThis[key];
  delete globalThis[Symbol.for("zenrouter.runtime.lifecycle")];
  delete globalThis[Symbol.for("zenrouter.db.lifecycle")];
  io.children = [];
  io.admin = true; io.sudo = false;
  delete globalThis.__mitmSudoPassword;
  releases = []; expectedStopError = null;
  io.directory = fs.mkdtempSync(path.join(os.tmpdir(), "zhd-"));
  fs.mkdirSync(path.join(io.directory, "mitm"));
  fs.writeFileSync(path.join(io.directory, "server.js"), "synthetic fixture, never executed");
  fs.writeFileSync(path.join(io.directory, "mitm", "rootCA.crt"), "synthetic cert, never trusted");
  fs.writeFileSync(path.join(io.directory, "mitm", "rootCA.key"), "synthetic key, never used");
  binary();
  fs.writeFileSync(path.join(io.directory, "bin", "tailscale"), "synthetic binary, never executed");
  io.settings.mockResolvedValue({ mitmEnabled: true, dnsToolEnabled: { first: true, second: true } });
  io.update.mockResolvedValue({});
  io.exec.mockImplementation((_command, _options, callback) => { queueMicrotask(() => callback(null, "", "")); return new EventEmitter(); });
  io.execAsync.mockImplementation(async command => {
    if (/which tailscale/.test(command)) return { stdout: "/synthetic/tailscale", stderr: "" };
    if (/funnel status/.test(command)) return { stdout: JSON.stringify({ AllowFunnel: { "synthetic:443": true } }), stderr: "" };
    return { stdout: JSON.stringify({ BackendState: "Running", Self: { Online: true, DNSName: "synthetic.ts.net." } }), stderr: "" };
  });
  io.exec[Symbol.for("nodejs.util.promisify.custom")] = (...args) => io.execAsync(...args);
  io.execSync.mockImplementation(command => {
    if (/pgrep -af/.test(command)) return "synthetic tailscaled --tun=userspace-networking";
    if (/status --json/.test(command)) return JSON.stringify({ Self: { DNSName: "synthetic.ts.net." } });
    return "";
  });
  io.spawn.mockImplementation(() => child());
  io.fetch.mockResolvedValue(response());
  vi.stubGlobal("fetch", (...args) => io.fetch(...args));
  io.dns.mockResolvedValue(["192.0.2.1"]);
  io.osDns.mockResolvedValue(["192.0.2.1"]);
  io.passwordCommand.mockResolvedValue();
  io.addDns.mockResolvedValue(); io.removeDns.mockResolvedValue(); io.removeAll.mockResolvedValue();
  io.generate.mockResolvedValue(); io.trust.mockResolvedValue(true); io.install.mockResolvedValue(); io.uninstall.mockResolvedValue();
  io.port.mockImplementation(() => {
    const server = new EventEmitter();
    server.listen = vi.fn(() => queueMicrotask(() => server.emit("listening")));
    server.close = callback => callback();
    return server;
  });
  io.request.mockImplementation((_options, callback) => {
    const req = new EventEmitter();
    req.destroy = vi.fn(() => queueMicrotask(() => req.emit("close")));
    req.end = () => queueMicrotask(() => {
      const res = new EventEmitter(); res.destroy = vi.fn(); callback(res);
      res.emit("data", Buffer.from('{"ok":true,"pid":81000}')); res.emit("end");
    });
    return req;
  });
  io.get.mockImplementation(() => { throw new Error("Unexpected external download"); });
  io.usage.mockResolvedValue({ drained: true }); io.details.mockResolvedValue({ drained: true }); io.logs.mockResolvedValue({ drained: true });
  io.pools.mockResolvedValue({ timedOut: false, livePools: 0, active: 0, queued: 0 }); io.close.mockResolvedValue(); io.catalog.mockResolvedValue();
  raw = loadManager(); io.manager = raw.manager;
  lifecycle = raw.manager.getHelperLifecycle();
  shutdown = await import("../../src/lib/shutdownLifecycle.js");
  const state = globalThis[Symbol.for("zenrouter.shutdown.lifecycle")];
  state.hooks.clear(); state.draining = false; state.pending = null;
});

afterEach(async () => {
  for (const release of releases) release();
  for (const value of io.children) value.kill();
  await microtasks();
  try { await lifecycle.stop(); }
  catch (error) { expect(error).toBe(expectedStopError); }
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  fs.rmSync(io.directory, { recursive: true, force: true });
  delete globalThis[key];
});

describe("Cloudflare actual helper descendants", () => {
  it("waits for an admitted download/file close and never spawns after SIGTERM", async () => {
    fs.unlinkSync(path.join(io.directory, "bin", "cloudflared"));
    const stream = new PassThrough();
    stream.statusCode = 200; stream.headers = {};
    io.get.mockImplementation((_url, callback) => { queueMicrotask(() => callback(stream)); return new EventEmitter(); });
    const cloud = await import("../../src/lib/tunnel/cloudflare/cloudflared.js");
    const active = cloud.spawnQuickTunnel(20128);
    active.catch(() => {});
    await microtasks();
    stream.write(Buffer.from("synthetic-download"));
    const stop = stopRuntime();
    await vi.dynamicImportSettled(); await microtasks();
    expect(io.close).not.toHaveBeenCalled();
    expect(io.spawn).not.toHaveBeenCalled();
    stream.end();
    await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" });
    await stop;
    expect(io.spawn).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(io.directory, "bin", "cloudflared"))).toBe(false);
    expect(io.close).toHaveBeenCalledTimes(1);
  });

  it("owns a URL callback after enable settles and fences its post-register writes", async () => {
    await startCloud();
    const gate = held();
    io.fetch.mockClear();
    io.fetch.mockImplementation(() => gate.promise);
    io.update.mockClear();
    const value = io.children.at(-1);
    value.stderr.emit("data", Buffer.from("https://two.trycloudflare.com"));
    await microtasks();
    expect(lifecycle.scope("cloudflare-manager").pending.has("url-update")).toBe(true);
    const stop = stopRuntime();
    await vi.dynamicImportSettled(); await microtasks();
    expect(io.close).not.toHaveBeenCalled();
    gate.resolve(response());
    await stop;
    expect(io.update).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(path.join(io.directory, "tunnel", "state.json"))).tunnelUrl).toBe("https://one.trycloudflare.com");
    value.stderr.emit("data", Buffer.from("https://three.trycloudflare.com"));
    value.emit("exit", 1);
    await microtasks();
    expect(io.fetch).toHaveBeenCalledTimes(1);
  });

  it("waits for a callback settings commit already admitted instead of treating kill as completion", async () => {
    await startCloud();
    const gate = held();
    io.update.mockImplementation(() => gate.promise);
    io.children.at(-1).stderr.emit("data", Buffer.from("https://two.trycloudflare.com"));
    await microtasks();
    expect(io.update).toHaveBeenCalledTimes(2);
    let done = false;
    const stop = lifecycle.stop().then(() => { done = true; });
    await microtasks(); expect(done).toBe(false);
    gate.resolve({}); await stop;
    expect(done).toBe(true);
  });

  it("bounds rapid URL callbacks and shares the active barrier across hot reload", async () => {
    await startCloud();
    const gate = held(); io.fetch.mockClear(); io.fetch.mockImplementation(() => gate.promise);
    const value = io.children.at(-1);
    for (let i = 0; i < 100; i++) value.stderr.emit("data", Buffer.from(`https://update${i}.trycloudflare.com`));
    await microtasks();
    const copy = await import("../../src/lib/tunnel/cloudflare/manager.js?hmr=helpers");
    expect(copy.getTunnelService()).toBe(lifecycle.scope("cloudflare-manager").data.service);
    expect(io.fetch).toHaveBeenCalledTimes(1);
    expect(lifecycle.scope("cloudflared").pending.size).toBe(1);
    const stop = lifecycle.stop(); gate.resolve(response()); await stop;
  });

  it("owns an unexpected-exit callback Promise and blocks captured callback re-entry after stop", async () => {
    const manager = await startCloud();
    const gate = held();
    const callback = vi.fn(() => gate.promise);
    manager.setTunnelUnexpectedExitCallback(callback);
    const value = io.children.at(-1);
    value.emit("exit", 1); value.emit("close", 1);
    await microtasks(); expect(callback).toHaveBeenCalledTimes(1);
    let done = false; const stop = lifecycle.stop().then(() => { done = true; });
    await microtasks(); expect(done).toBe(false);
    gate.resolve(); await stop;
    value.emit("exit", 1); await microtasks(); expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not follow a held download redirect after process shutdown begins", async () => {
    fs.unlinkSync(path.join(io.directory, "bin", "cloudflared"));
    const stream = new PassThrough(); stream.statusCode = 302; stream.headers = { location: "https://synthetic.invalid/next" };
    io.get.mockImplementation((_url, callback) => { queueMicrotask(() => callback(stream)); return new EventEmitter(); });
    const cloud = await import("../../src/lib/tunnel/cloudflare/cloudflared.js");
    const active = cloud.spawnQuickTunnel(20128); active.catch(() => {});
    await microtasks(); const stop = lifecycle.stop();
    stream.end(); await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" }); await stop;
    expect(io.get).toHaveBeenCalledTimes(1); expect(io.spawn).not.toHaveBeenCalled();
  });

  it("blocks public-DNS fallback and fetch if shutdown starts during a health DNS lookup", async () => {
    const gate = held(); io.dns.mockImplementation(() => gate.promise);
    const manager = await import("../../src/lib/tunnel/cloudflare/manager.js");
    const active = manager.enableTunnel(); active.catch(() => {});
    await microtasks(); io.children.at(-1).stderr.emit("data", Buffer.from("https://one.trycloudflare.com"));
    await microtasks(); expect(io.dns).toHaveBeenCalledTimes(1);
    io.fetch.mockClear();
    const stop = lifecycle.stop(); gate.resolve(["192.0.2.1"]);
    await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" });
    await stop; expect(io.fetch).not.toHaveBeenCalled(); expect(io.osDns).not.toHaveBeenCalled();
  });

  it("allows disable then re-enable while fencing an old URL generation", async () => {
    const manager = await startCloud();
    const old = io.children.at(-1);
    const disabled = manager.disableTunnel();
    expect(manager.disableTunnel()).toBe(disabled);
    await disabled;
    const active = manager.enableTunnel(); active.catch(() => {});
    await microtasks(); io.children.at(-1).stderr.emit("data", Buffer.from("https://new.trycloudflare.com"));
    await active;
    const count = io.fetch.mock.calls.length;
    old.stderr.emit("data", Buffer.from("https://stale.trycloudflare.com"));
    old.emit("exit", 1);
    await microtasks(); expect(io.fetch).toHaveBeenCalledTimes(count);
    expect(manager.getTunnelService().cancelToken.cancelled).toBe(false);
  });
});

describe("Tailscale actual helper continuations", () => {
  it("waits for held directory ownership and fences daemon spawn after that operation completes", async () => {
    io.execSync.mockImplementation(() => { throw new Error("synthetic no daemon"); });
    const directory = path.join(io.directory, "tailscale");
    fs.mkdirSync(directory);
    const stat = fs.statSync.bind(fs);
    vi.spyOn(fs, "statSync").mockImplementation((filename, ...args) => {
      if (filename === directory) return { uid: process.getuid() + 1, isDirectory: () => true };
      return stat(filename, ...args);
    });
    const gate = held();
    const normal = io.execAsync.getMockImplementation();
    io.execAsync.mockImplementation(async command => {
      if (/^chown /.test(command)) { await gate.promise; return { stdout: "" }; }
      return normal(command);
    });
    const tailscale = await import("../../src/lib/tunnel/tailscale/tailscale.js");
    const active = tailscale.startDaemonWithPassword(""); active.catch(() => {});
    await microtasks(); await vi.advanceTimersByTimeAsync(1500);
    expect(io.execAsync.mock.calls.some(([command]) => /^chown /.test(command))).toBe(true);
    let done = false; const stop = lifecycle.stop().then(() => { done = true; });
    await microtasks(); expect(done).toBe(false);
    gate.resolve(); await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" }); await stop;
    expect(io.spawn).not.toHaveBeenCalled();
    expect(io.execAsync.mock.calls.some(([command]) => /^sudo -n chown /.test(command))).toBe(false);
  });

  it("does not enter daemon startup after a held password read resumes during drain", async () => {
    const gate = held(); io.settings.mockImplementation(() => gate.promise);
    const manager = await import("../../src/lib/tunnel/tailscale/manager.js");
    const active = manager.enableTailscale(); active.catch(() => {});
    await microtasks();
    const stop = lifecycle.stop(); gate.resolve({});
    await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" });
    await stop; expect(io.execSync).not.toHaveBeenCalled(); expect(io.spawn).not.toHaveBeenCalled();
  });

  it("waits for the actual kill/ownership operation and prevents a detached late daemon spawn", async () => {
    const gate = held(); io.passwordCommand.mockImplementation(() => gate.promise);
    io.execSync.mockImplementation(() => { throw new Error("synthetic no daemon"); });
    const tailscale = await import("../../src/lib/tunnel/tailscale/tailscale.js");
    const active = tailscale.startDaemonWithPassword("synthetic-password"); active.catch(() => {});
    await microtasks(); expect(io.passwordCommand).toHaveBeenCalledTimes(1);
    let done = false; const stop = lifecycle.stop().then(() => { done = true; });
    await microtasks(); expect(done).toBe(false);
    gate.resolve(); await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" }); await stop;
    expect(io.spawn).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it("wakes a daemon settle delay and does not spawn in its cancelled generation", async () => {
    io.execSync.mockImplementation(() => { throw new Error("synthetic no daemon"); });
    const tailscale = await import("../../src/lib/tunnel/tailscale/tailscale.js");
    const active = tailscale.startDaemonWithPassword(""); active.catch(() => {});
    await microtasks(); expect(lifecycle.scope("tailscale").wakes.size).toBe(1);
    const stop = lifecycle.stop(); await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" }); await stop;
    expect(io.spawn).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it("prevents a second status-socket probe after the first held probe fails during shutdown", async () => {
    const gate = held();
    io.execAsync.mockImplementation(async command => { if (/which/.test(command)) return { stdout: "/synthetic/tailscale" }; await gate.promise; throw new Error("first socket failed"); });
    const tailscale = await import("../../src/lib/tunnel/tailscale/tailscale.js");
    tailscale.isTailscaleLoggedIn();
    await microtasks(); expect(io.execAsync.mock.calls.filter(([command]) => /status --json/.test(command))).toHaveLength(1);
    const stop = lifecycle.stop(); gate.resolve(); await stop;
    expect(io.execAsync.mock.calls.filter(([command]) => /status --json/.test(command))).toHaveLength(1);
  });

  it("drains the strict post-funnel probe and skips settings/cert continuation", async () => {
    const gate = held(); let statuses = 0;
    const normal = io.execAsync.getMockImplementation();
    io.execAsync.mockImplementation(async command => {
      if (/status --json/.test(command) && !/funnel/.test(command) && ++statuses === 2) await gate.promise;
      return normal(command);
    });
    const manager = await import("../../src/lib/tunnel/tailscale/manager.js");
    const active = manager.enableTailscale(); active.catch(() => {});
    await microtasks();
    io.children.at(-1).stdout.emit("data", Buffer.from("funnel ready"));
    await microtasks(); expect(statuses).toBe(2);
    const stop = lifecycle.stop(); await microtasks(); expect(io.update).not.toHaveBeenCalled();
    gate.resolve(); await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" }); await stop;
    expect(io.update).not.toHaveBeenCalled(); expect(io.execAsync.mock.calls.some(([command]) => / cert /.test(command))).toBe(false);
  });

  it("waits for the real post-funnel settings commit before DB phase and does not provision a cert", async () => {
    const gate = held(); const events = [];
    io.update.mockImplementation(async () => { await gate.promise; events.push("settings"); });
    io.close.mockImplementation(async () => { events.push("database"); });
    const manager = await import("../../src/lib/tunnel/tailscale/manager.js");
    const active = manager.enableTailscale(); active.catch(() => {});
    await microtasks(); io.children.at(-1).stdout.emit("data", Buffer.from("funnel ready"));
    await microtasks(); expect(io.update).toHaveBeenCalledTimes(1);
    const stop = stopRuntime(); await vi.dynamicImportSettled(); await microtasks();
    expect(io.close).not.toHaveBeenCalled();
    gate.resolve({}); await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" }); await stop;
    expect(events).toEqual(["settings", "database"]);
    expect(io.execAsync.mock.calls.some(([command]) => / cert /.test(command))).toBe(false);
  });

  it("owns login poll timers, ignores stale child data and waits for child close", async () => {
    const tailscale = await import("../../src/lib/tunnel/tailscale/tailscale.js");
    const active = tailscale.startLogin("synthetic"); active.catch(() => {});
    await microtasks(); const value = io.children.at(-1);
    expect(value).toBeDefined();
    const close = held(); value.kill.mockImplementation(() => { close.promise.then(() => value.emit("close", 0)); });
    let done = false; const stop = lifecycle.stop().then(() => { done = true; });
    await microtasks(); expect(done).toBe(false);
    const count = io.execSync.mock.calls.length;
    value.stdout.emit("data", Buffer.from("https://login.tailscale.com/a/synthetic"));
    await vi.advanceTimersByTimeAsync(30000);
    expect(io.execSync).toHaveBeenCalledTimes(count);
    close.resolve(); await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" }); await stop;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("raw CommonJS MITM helper descendants", () => {
  it("cancels a queued child-exit retry without later settings, spawn or DNS restoration", async () => {
    const value = await startMitm();
    value.emit("exit", 1); value.emit("close", 1);
    await microtasks(); expect(lifecycle.scope("mitm").pending.has("restart")).toBe(true);
    io.settings.mockClear(); io.removeSync.mockClear();
    const stop = lifecycle.stop(); await stop;
    await vi.advanceTimersByTimeAsync(120000);
    expect(io.spawn).toHaveBeenCalledTimes(1); expect(io.settings).not.toHaveBeenCalled();
    value.emit("exit", 1); await microtasks(); expect(io.removeSync).not.toHaveBeenCalled();
    expect(io.removeAll).toHaveBeenCalledWith("", { strict: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("guards a restart held in its settings read and shares its barrier with a second CJS copy", async () => {
    const value = await startMitm(); const gate = held(); io.settings.mockImplementation(() => gate.promise);
    value.emit("exit", 1); value.emit("close", 1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(io.settings).toHaveBeenCalled();
    const copy = loadManager(); expect(copy.manager.getHelperLifecycle()).toBe(lifecycle);
    let done = false; const stop = lifecycle.stop().then(() => { done = true; });
    await microtasks(); expect(done).toBe(false);
    gate.resolve({ mitmEnabled: true }); await stop;
    expect(io.spawn).toHaveBeenCalledTimes(1);
  });

  it("guards startServer after a held cert/trust step and never spawns after drain", async () => {
    const gate = held(); io.trust.mockImplementation(() => gate.promise);
    const active = raw.manager.startServer("synthetic-key"); active.catch(() => {});
    await microtasks(); await vi.advanceTimersByTimeAsync(500);
    expect(io.trust).toHaveBeenCalledTimes(1);
    const stop = lifecycle.stop(); gate.resolve(true);
    await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" }); await stop;
    expect(io.spawn).not.toHaveBeenCalled(); expect(io.update).not.toHaveBeenCalled();
  });

  it("guards startServer after resolving a held router-base DB read", async () => {
    const gate = held(); io.settings.mockImplementation(() => gate.promise);
    const active = raw.manager.startServer("synthetic-key"); active.catch(() => {});
    await microtasks(); await vi.advanceTimersByTimeAsync(500);
    expect(io.settings).toHaveBeenCalledTimes(1);
    const stop = lifecycle.stop(); gate.resolve({});
    await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" }); await stop;
    expect(io.spawn).not.toHaveBeenCalled();
  });

  it("stops restoreToolDNS after its held state read before any hosts mutation", async () => {
    await startMitm(); const gate = held(); io.settings.mockImplementation(() => gate.promise);
    const active = raw.manager.restoreToolDNS("synthetic-password"); active.catch(() => {});
    await microtasks(); expect(io.settings).toHaveBeenCalled();
    const stop = lifecycle.stop(); gate.resolve({ dnsToolEnabled: { first: true } });
    await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" }); await stop;
    expect(io.addDns).not.toHaveBeenCalled();
  });

  it("awaits an admitted DNS mutation, skips later tools and cleans only after that operation settles", async () => {
    await startMitm(); const gate = held(); const events = [];
    io.addDns.mockImplementation(async () => { await gate.promise; events.push("hosts-operation"); });
    io.removeAll.mockImplementation(async () => events.push("cleanup"));
    const active = raw.manager.restoreToolDNS("synthetic-password"); active.catch(() => {});
    await microtasks(); expect(io.addDns).toHaveBeenCalledTimes(1);
    const stop = lifecycle.stop(); await microtasks(); expect(events).toEqual([]);
    gate.resolve(); await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" }); await stop;
    expect(events).toEqual(["hosts-operation", "cleanup"]); expect(io.addDns).toHaveBeenCalledTimes(1);
  });

  it("tracks password-clearing stderr writes independently of the already completed start", async () => {
    const value = await startMitm(); const gate = held(); io.update.mockImplementation(() => gate.promise);
    value.stderr.emit("data", Buffer.from("incorrect password"));
    await microtasks(); expect(lifecycle.scope("mitm").pending.has("clear-password")).toBe(true);
    const stop = stopRuntime(); await vi.dynamicImportSettled(); await microtasks();
    expect(io.close).not.toHaveBeenCalled();
    gate.resolve({}); await stop; expect(io.close).toHaveBeenCalledTimes(1);
    const updates = io.update.mock.calls.length;
    value.stderr.emit("data", Buffer.from("incorrect password")); await microtasks(); expect(io.update).toHaveBeenCalledTimes(updates);
  });

  it("keeps ordinary direct-CJS startup and unexpected restart working without managed shutdown", async () => {
    vi.stubEnv("ZENROUTER_MANAGED_SHUTDOWN", "");
    const value = await startMitm();
    raw.manager.setCachedPassword("synthetic-password");
    value.emit("exit", 1); value.emit("close", 1);
    await vi.advanceTimersByTimeAsync(5500);
    await microtasks(); expect(io.spawn).toHaveBeenCalledTimes(2);
    expect(lifecycle.isStopping()).toBe(false);
  });
});

describe("reviewed helper lifecycle races", () => {
  it.each(["enableToolDNS", "disableToolDNS"])("serializes %s for distinct tools without losing either argument or state", async method => {
    await startMitm();
    let settings = { dnsToolEnabled: { first: method === "disableToolDNS", second: method === "disableToolDNS" } };
    io.settings.mockImplementation(async () => settings);
    io.update.mockImplementation(async update => { settings = { ...settings, ...update }; });
    const gate = held();
    const mutate = method === "enableToolDNS" ? io.addDns : io.removeDns;
    mutate.mockImplementationOnce(() => gate.promise);
    const first = raw.manager[method]("first", "first-password");
    const second = raw.manager[method]("second", "second-password");
    expect(second).not.toBe(first);
    await microtasks(); expect(mutate).toHaveBeenCalledTimes(1);
    gate.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([{ success: true }, { success: true }]);
    expect(mutate.mock.calls).toEqual([["first", "first-password"], ["second", "second-password"]]);
    expect(settings.dnsToolEnabled).toEqual({ first: method === "enableToolDNS", second: method === "enableToolDNS" });
  });

  it("caps the serialized DNS backlog and rejects excess calls instead of sharing false successes", async () => {
    const gate = held(); io.removeDns.mockImplementationOnce(() => gate.promise);
    const admitted = Array.from({ length: 5 }, () => raw.manager.disableToolDNS("first", "synthetic-password"));
    const excess = Array.from({ length: 100 }, () => raw.manager.disableToolDNS("second", "other-password").catch(error => error.code));
    await microtasks();
    expect([...lifecycle.scope("mitm").pending.keys()].filter(value => value.startsWith("dns-"))).toHaveLength(5);
    expect(await Promise.all(excess)).toEqual(Array(100).fill("HELPER_BUSY"));
    expect(io.removeDns).toHaveBeenCalledTimes(1);
    gate.resolve(); await Promise.all(admitted);
    expect(io.removeDns).toHaveBeenCalledTimes(5);
  });

  it("preserves URL and unexpected-exit supervision after healthy idempotent Cloudflare enable", async () => {
    const manager = await startCloud();
    const generation = lifecycle.scope("cloudflare-manager").generation;
    const callback = vi.fn(async () => {}); manager.setTunnelUnexpectedExitCallback(callback);
    await expect(manager.enableTunnel()).resolves.toMatchObject({ success: true, alreadyRunning: true });
    expect(lifecycle.scope("cloudflare-manager").generation).toBe(generation);
    expect(io.spawn).toHaveBeenCalledTimes(1);
    io.children[0].stderr.emit("data", Buffer.from("https://updated.trycloudflare.com"));
    await microtasks();
    expect(io.update).toHaveBeenLastCalledWith({ tunnelEnabled: true, tunnelUrl: "https://updated.trycloudflare.com" });
    io.children[0].emit("exit", 1); io.children[0].emit("close", 1);
    await microtasks(); expect(callback).toHaveBeenCalledTimes(1);
  });

  it("drains the latest Cloudflare URL after an earlier registration rejects", async () => {
    await startCloud();
    const gate = held(); io.fetch.mockClear();
    io.fetch.mockImplementation(async (_url, options) => {
      if (options?.body && JSON.parse(options.body).tunnelUrl === "https://b.trycloudflare.com") {
        await gate.promise; throw new Error("synthetic registration failure");
      }
      return response();
    });
    const value = io.children[0];
    value.stderr.emit("data", Buffer.from("https://b.trycloudflare.com")); await microtasks();
    value.stderr.emit("data", Buffer.from("https://c.trycloudflare.com")); await microtasks();
    expect(io.fetch).toHaveBeenCalledTimes(1);
    expect(lifecycle.scope("cloudflared").pending.size).toBe(1);
    gate.resolve(); await microtasks();
    expect(io.fetch).toHaveBeenCalledTimes(2);
    expect(io.update).toHaveBeenLastCalledWith({ tunnelEnabled: true, tunnelUrl: "https://c.trycloudflare.com" });
    expect(lifecycle.scope("cloudflared").data.nextUrl).toBeNull();
    expect(lifecycle.scope("cloudflared").pending.size).toBe(0);
    value.stderr.emit("data", Buffer.from("https://c.trycloudflare.com")); await microtasks();
    expect(io.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not finish normal Cloudflare disable or spawn its replacement before old child close", async () => {
    const manager = await startCloud(); const old = io.children[0]; const close = held();
    old.kill.mockImplementation(() => { old.killed = true; old.emit("exit", 0); close.promise.then(() => old.emit("close", 0)); });
    let disabled = false;
    const stop = manager.disableTunnel().then(value => { disabled = true; return value; });
    const next = manager.enableTunnel(); next.catch(() => {});
    await microtasks();
    expect(disabled).toBe(false); expect(io.spawn).toHaveBeenCalledTimes(1);
    expect(io.update).not.toHaveBeenCalledWith({ tunnelEnabled: false, tunnelUrl: "" });
    close.resolve(); await stop; await microtasks();
    expect(io.spawn).toHaveBeenCalledTimes(2);
    io.children[1].stderr.emit("data", Buffer.from("https://replacement.trycloudflare.com"));
    await expect(next).resolves.toMatchObject({ success: true });
  });

  it("kills a Tailscale command on parent-only poll cancellation and retains its Promise until close", async () => {
    const manager = await import("../../src/lib/tunnel/tailscale/manager.js");
    const active = manager.enableTailscale(); active.catch(() => {});
    await microtasks(); const value = io.children[0]; const close = held();
    value.kill.mockImplementation(() => { value.killed = true; close.promise.then(() => value.emit("close", 0)); });
    lifecycle.invalidate(lifecycle.scope("tailscale-manager"));
    await vi.advanceTimersByTimeAsync(500);
    expect(value.kill).toHaveBeenCalled();
    expect(lifecycle.scope("tailscale-manager").pending.has("enable")).toBe(true);
    expect(lifecycle.scope("tailscale").children.size).toBe(1);
    expect(lifecycle.scope("tailscale").wakes.size).toBe(0);
    const probes = io.execSync.mock.calls.length;
    value.stdout.emit("data", Buffer.from("late output")); await vi.advanceTimersByTimeAsync(10000);
    expect(io.execSync).toHaveBeenCalledTimes(probes);
    close.resolve(); await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" });
    await manager.disableTailscale();
  });

  it("waits for Tailscale command close before reset, disabled settings, and re-enable", async () => {
    const manager = await import("../../src/lib/tunnel/tailscale/manager.js");
    const active = manager.enableTailscale(); active.catch(() => {});
    await microtasks(); const value = io.children[0]; const close = held();
    value.kill.mockImplementation(() => { value.killed = true; value.emit("exit", 0); close.promise.then(() => value.emit("close", 0)); });
    io.execSync.mockClear();
    let disabled = false;
    const stop = manager.disableTailscale().then(result => { disabled = true; return result; });
    const next = manager.enableTailscale(); next.catch(() => {});
    await microtasks();
    expect(value.kill).toHaveBeenCalled(); expect(disabled).toBe(false);
    expect(io.execSync).not.toHaveBeenCalled(); expect(io.update).not.toHaveBeenCalled();
    expect(io.spawn).toHaveBeenCalledTimes(1);
    close.resolve(); await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" });
    await stop; await microtasks();
    expect(io.update).toHaveBeenCalledWith({ tailscaleEnabled: false, tailscaleUrl: "" });
    expect(io.spawn).toHaveBeenCalledTimes(2);
    io.children[1].stdout.emit("data", Buffer.from("ready"));
    await expect(next).resolves.toMatchObject({ success: true });
  });

  it("retains normal MITM stop and start barriers through exit until actual child close", async () => {
    const value = await startMitm(); const close = held();
    value.kill.mockImplementation(() => { value.killed = true; value.emit("exit", 0); close.promise.then(() => value.emit("close", 0)); });
    const normal = io.exec.getMockImplementation();
    io.exec.mockImplementation((command, options, callback) => {
      if (/kill -SIG/.test(command)) value.emit("exit", 0);
      return normal(command, options, callback);
    });
    let stopped = false;
    const stop = raw.manager.stopServer("synthetic-password").then(result => { stopped = true; return result; });
    const next = raw.manager.startServer("synthetic-key"); next.catch(() => {});
    await microtasks(); await vi.advanceTimersByTimeAsync(1000);
    expect(stopped).toBe(false); expect(io.spawn).toHaveBeenCalledTimes(1);
    expect(lifecycle.scope("mitm").data.process).toBe(value);
    expect(io.removeAll).not.toHaveBeenCalled();
    close.resolve(); value.emit("close", 0); await stop;
    await microtasks(); await vi.advanceTimersByTimeAsync(500);
    await expect(next).resolves.toMatchObject({ running: true });
    expect(io.spawn).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])("wakes and destroys an unfinished MITM health request on normal stop (body=%s)", async withBody => {
    const req = new EventEmitter(); req.destroy = vi.fn(); req.end = vi.fn();
    const res = new EventEmitter(); res.destroy = vi.fn();
    io.request.mockImplementation((_options, callback) => { if (withBody) queueMicrotask(() => { callback(res); res.emit("data", Buffer.from("{")); }); return req; });
    const active = raw.manager.startServer("synthetic-key"); active.catch(() => {});
    await microtasks(); await vi.advanceTimersByTimeAsync(500);
    expect(io.request).toHaveBeenCalledTimes(1);
    const normal = io.exec.getMockImplementation();
    io.exec.mockImplementation((command, options, callback) => {
      if (/kill -SIG/.test(command)) io.children[0].kill();
      return normal(command, options, callback);
    });
    const stop = raw.manager.stopServer();
    expect(req.destroy).toHaveBeenCalledTimes(1);
    if (withBody) { expect(res.destroy).toHaveBeenCalledTimes(1); expect(res.listenerCount("data")).toBe(0); }
    await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(stop).resolves.toEqual({ running: false, pid: null });
    expect(vi.getTimerCount()).toBe(0); expect(lifecycle.scope("mitm").wakes.size).toBe(0);
  });

  it("enforces per-request MITM health deadlines without waiting for a peer response", async () => {
    const requests = [];
    io.request.mockImplementation(() => { const req = new EventEmitter(); req.end = vi.fn(); req.destroy = vi.fn(); requests.push(req); return req; });
    const active = vm.runInContext("pollMitmHealth(1250)", raw.context);
    await vi.advanceTimersByTimeAsync(1250);
    await expect(active).resolves.toBeNull();
    expect(requests).toHaveLength(1); expect(requests[0].destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0); expect(lifecycle.scope("mitm").wakes.size).toBe(0);
  });

  it("destroys oversized MITM health bodies and releases their data listener", async () => {
    const req = new EventEmitter(); req.end = vi.fn(); req.destroy = vi.fn();
    const res = new EventEmitter(); res.destroy = vi.fn();
    io.request.mockImplementation((_options, callback) => { queueMicrotask(() => { callback(res); res.emit("data", Buffer.alloc(16385)); }); return req; });
    const active = vm.runInContext("pollMitmHealth(500)", raw.context);
    await microtasks(); expect(req.destroy).toHaveBeenCalledTimes(1); expect(res.destroy).toHaveBeenCalledTimes(1);
    expect(res.listenerCount("data")).toBe(0);
    await vi.advanceTimersByTimeAsync(500); await expect(active).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["darwin", "win32"])("passes cancellation into the real %s certificate installer after its held trust check", async platform => {
    const gate = held(); const cert = loadCert(platform);
    raw = loadManager({ platform, cert }); io.manager = raw.manager;
    io.exec.mockImplementation((_command, _options, callback) => { gate.promise.then(() => callback(new Error("untrusted"), "", "")); return new EventEmitter(); });
    const active = raw.manager.trustCert("synthetic-password"); active.catch(() => {});
    await microtasks(); expect(io.exec).toHaveBeenCalledTimes(1);
    const stop = lifecycle.stop(); gate.resolve();
    await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" }); await stop;
    expect(io.passwordCommand).not.toHaveBeenCalled(); expect(io.elevated).not.toHaveBeenCalled();
  });

  it("passes startup cancellation into the installer's second internal trust check", async () => {
    const gate = held(); const cert = loadCert("darwin");
    raw = loadManager({ platform: "darwin", cert }); io.manager = raw.manager;
    const normal = io.exec.getMockImplementation(); let trustChecks = 0;
    io.exec.mockImplementation((command, options, callback) => {
      if (/security find-certificate/.test(command)) {
        trustChecks++;
        if (trustChecks === 2) gate.promise.then(() => callback(new Error("untrusted"), "", ""));
        else queueMicrotask(() => callback(new Error("untrusted"), "", ""));
        return new EventEmitter();
      }
      return normal(command, options, callback);
    });
    const active = raw.manager.startServer("synthetic-key"); active.catch(() => {});
    await microtasks(); await vi.advanceTimersByTimeAsync(500);
    expect(trustChecks).toBe(2);
    const stop = lifecycle.stop(); gate.resolve();
    await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" }); await stop;
    expect(io.passwordCommand).not.toHaveBeenCalled(); expect(io.spawn).not.toHaveBeenCalled();
  });

  it("does not launch Linux NSS writes after a held privileged certificate install is cancelled", async () => {
    io.sudo = true; const gate = held(); io.passwordCommand.mockImplementation(() => gate.promise);
    raw = loadManager({ cert: loadCert("linux") }); io.manager = raw.manager;
    const active = raw.manager.trustCert("synthetic-password"); active.catch(() => {});
    await microtasks(); expect(io.passwordCommand).toHaveBeenCalledTimes(1);
    const stop = lifecycle.stop(); gate.resolve();
    await expect(active).rejects.toMatchObject({ code: "HELPER_STOPPED" }); await stop;
    expect(io.exec).not.toHaveBeenCalled();
  });

  it("preserves ordinary two-argument certificate installation without lifecycle guards", async () => {
    const cert = loadCert("linux");
    await expect(cert.installCert("synthetic-password", path.join(io.directory, "mitm", "rootCA.crt"))).resolves.toBeUndefined();
    expect(io.exec).toHaveBeenCalledTimes(1);
  });

  it("awaits authorized non-root terminal DNS cleanup before the database phase", async () => {
    await startMitm(); io.admin = false; raw.manager.setCachedPassword("synthetic-password");
    const gate = held(); io.removeAll.mockImplementation(() => gate.promise);
    const stop = stopRuntime(); await vi.dynamicImportSettled(); await microtasks();
    expect(io.removeAll).toHaveBeenCalledWith("synthetic-password", { strict: true });
    expect(io.removeSync).not.toHaveBeenCalled(); expect(io.close).not.toHaveBeenCalled();
    gate.resolve(); await stop; expect(io.close).toHaveBeenCalledTimes(1);
  });

  it("reports terminal DNS cleanup failure without settling before other owned child closes", async () => {
    await startMitm();
    expectedStopError = Object.assign(new Error("Tool DNS entries remain after cleanup"), { code: "DNS_CLEANUP_FAILED" });
    io.removeAll.mockRejectedValue(expectedStopError);
    const external = child(); const close = held();
    external.kill.mockImplementation(() => { close.promise.then(() => external.emit("close", 0)); });
    lifecycle.child(lifecycle.scope("other-owned-helper"), external);
    let settled = false;
    const stop = lifecycle.stop(); stop.catch(() => { settled = true; });
    await microtasks(); expect(settled).toBe(false);
    close.resolve(); await expect(stop).rejects.toBe(expectedStopError);
    expect(io.removeSync).not.toHaveBeenCalled();
    expect(lifecycle.scope("other-owned-helper").children.size).toBe(0);
  });

  it.each([false, true])("uses awaited sudo-capable DNS cleanup and verifies hosts afterward (refused=%s)", async refused => {
    let hosts = "127.0.0.1 localhost\n127.0.0.1 first.test\n127.0.0.1 second.test\n";
    const files = new Map(); const fixtureModule = { exports: {} };
    io.spawn.mockImplementation((command, args) => {
      const value = child();
      queueMicrotask(() => {
        if (args[1] === "cp" && !refused) hosts = files.get(args[2]);
        value.emit("close", refused && args[1] === "cp" ? 1 : 0);
      });
      return value;
    });
    const context = vm.createContext({
      module: fixtureModule, Buffer, process: { platform: "linux", env: {} },
      require(name) {
        if (name === "fs") return {
          readFileSync: filename => { if (filename !== "/etc/hosts") throw new Error("Unexpected hosts read"); return hosts; },
          writeFileSync: (filename, body) => { if (filename === "/etc/hosts") throw new Error("Direct privileged write forbidden"); files.set(filename, body); },
          unlinkSync: filename => files.delete(filename),
        };
        if (name === "child_process") return { exec: io.exec, execSync: io.execSync, spawn: io.spawn };
        if (name === "../../shared/constants/mitmToolHosts.js") return { TOOL_HOSTS: { first: ["first.test"], second: ["second.test"] } };
        if (name === "../logger") return { log: vi.fn(), err: vi.fn() };
        if (name === "../winElevated.js") return { runElevatedPowerShell: io.elevated, isAdmin: () => false };
        if (["path", "os", "crypto"].includes(name)) return require(`node:${name}`);
        throw new Error(`Unexpected DNS dependency ${name}`);
      },
    });
    vm.runInContext(fs.readFileSync(new URL("../../src/mitm/dns/dnsConfig.js", import.meta.url), "utf8"), context);
    const active = fixtureModule.exports.removeAllDNSEntries("synthetic-password", { strict: true });
    if (refused) await expect(active).rejects.toMatchObject({ code: "DNS_CLEANUP_FAILED" });
    else { await active; expect(hosts).toBe("127.0.0.1 localhost\n"); }
    expect(io.spawn.mock.calls.filter(([command, args]) => command === "sudo" && args[1] === "cp")).toHaveLength(2);
    expect(files.size).toBe(0);
  });
});
