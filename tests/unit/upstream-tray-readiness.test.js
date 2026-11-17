import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import net from "node:net";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import path from "node:path";
import readline from "node:readline";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const trayPath = fileURLToPath(new URL("../../cli/src/cli/tray/tray.js", import.meta.url));
const winPath = fileURLToPath(new URL("../../cli/src/cli/tray/trayWin.js", import.meta.url));

function loadCommonJs(filename, require, process) {
  const fixtureModule = { exports: {} };
  vm.runInNewContext(readFileSync(filename, "utf8"), {
    require, module: fixtureModule, exports: fixtureModule.exports, __dirname: path.dirname(filename),
    process, console, setTimeout, clearTimeout, setInterval, clearInterval,
  }, { filename });
  return fixtureModule.exports;
}

function trayFixture({ legacy = false, display = ":synthetic" } = {}) {
  let resolveReady, rejectReady, instance;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  class SysTray {
    constructor() {
      instance = this;
      this._process = new EventEmitter();
      this.kill = vi.fn();
    }
    onClick() {}
    ready() { return ready; }
    onReady(callback) { this.legacyReady = callback; }
    onError(callback) { this.legacyError = callback; }
  }
  const api = loadCommonJs(trayPath, name => {
    if (name === "path") return path;
    if (name === "fs") return { existsSync: () => false };
    if (name === "child_process") return { exec: vi.fn() };
    if (name === "./autostart") return { isAutoStartEnabled: () => false };
    if (name === "../../../hooks/sqliteRuntime") return { getRuntimeNodeModules: () => "/fixture/runtime" };
    if (name.endsWith("systray2") && !legacy) return { default: SysTray };
    if (name === "systray" && legacy) return { default: SysTray };
    throw new Error("Synthetic optional module unavailable");
  }, { platform: "linux", env: { DISPLAY: display }, stderr: { write: vi.fn() } });
  const onReady = vi.fn(), onError = vi.fn();
  api.initTray({ port: 20128, onReady, onError });
  return { api, onReady, onError, resolveReady, rejectReady, get instance() { return instance; } };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("native tray startup acknowledgement", () => {
  it("reports success only after the native systray handshake", async () => {
    const fixture = trayFixture();
    expect(fixture.onReady).not.toHaveBeenCalled();
    fixture.resolveReady();
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.onReady).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(4000);
    expect(fixture.onError).not.toHaveBeenCalled();
    await fixture.api.killTray();
  });

  it("bounds a child that never acknowledges startup and disposes only that tray", async () => {
    const fixture = trayFixture();
    await vi.advanceTimersByTimeAsync(3001);
    expect(fixture.onReady).not.toHaveBeenCalled();
    expect(fixture.onError).toHaveBeenCalledOnce();
    expect(fixture.onError.mock.calls[0][0].message).toMatch(/handshake|ready|startup/i);
    expect(fixture.instance.kill).toHaveBeenCalled();
    fixture.resolveReady();
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.onReady).not.toHaveBeenCalled();
  });

  it("reports a rejected readiness promise once and tears down its native resource", async () => {
    const fixture = trayFixture();
    fixture.rejectReady(new Error("synthetic tray startup failure"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.onError).toHaveBeenCalledOnce();
    expect(fixture.onReady).not.toHaveBeenCalled();
    expect(fixture.instance.kill).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4000);
    expect(fixture.onError).toHaveBeenCalledOnce();
  });

  it("reports child exit before its handshake instead of waiting forever", async () => {
    const fixture = trayFixture();
    fixture.instance._process.emit("exit", 127, null);
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.onError).toHaveBeenCalledOnce();
    expect(fixture.onError.mock.calls[0][0].message).toMatch(/exit|127/i);
    expect(fixture.onReady).not.toHaveBeenCalled();
  });

  it("cancels a pending readiness check when the owning launcher shuts the tray down", async () => {
    const fixture = trayFixture();
    await fixture.api.killTray();
    fixture.resolveReady();
    await vi.advanceTimersByTimeAsync(4000);
    expect(fixture.onReady).not.toHaveBeenCalled();
    expect(fixture.onError).not.toHaveBeenCalled();
  });

  it("reports legacy systray errors through its documented callback API", async () => {
    const fixture = trayFixture({ legacy: true });
    fixture.instance.legacyError(new Error("legacy native failure"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.onError).toHaveBeenCalledOnce();
    expect(fixture.instance.kill).toHaveBeenCalled();
  });

  it("reports that a graphical session is unavailable", () => {
    const fixture = trayFixture({ display: "" });
    expect(fixture.onError).toHaveBeenCalledOnce();
    expect(fixture.onReady).not.toHaveBeenCalled();
  });
});

describe("Windows tray native IPC", () => {
  function windowsFixture() {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = vi.fn();
    const { initWinTray } = loadCommonJs(winPath, name => {
      if (name === "child_process") return { spawn: () => child };
      if (name === "path") return path;
      if (name === "readline") return readline;
      throw new Error("Unexpected dependency");
    }, process);
    const controller = initWinTray({ iconPath: "fixture.ico", tooltip: "Synthetic", items: [] });
    return { child, controller };
  }

  it("acknowledges the existing PowerShell started event after NotifyIcon creation", async () => {
    const { child, controller } = windowsFixture();
    const settled = vi.fn();
    controller.ready().then(settled);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    child.stdout.write('{"type":"started"}\n');
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledOnce();
    controller.kill();
    await vi.advanceTimersByTimeAsync(301);
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("rejects a process that exits before creating its native tray", async () => {
    const { child, controller } = windowsFixture();
    const readiness = controller.ready();
    const assertion = expect(readiness).rejects.toThrow(/exit|127/i);
    child.emit("exit", 127, null);
    await assertion;
  });
});

// The real public launcher runs with an actual owned HTTP child. Only machine
// discovery, private installation setup, and platform tray/UI integration are
// replaced. A tray failure must not stop that child or hide the terminal.
async function publicLauncherFixture({ handshake, hide = false }) {
  vi.useRealTimers();
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const directory = mkdtempSync(path.join(tmpdir(), "kitsune-tray-public-"));
  const paused = path.join(directory, "hide-denied");
  mkdirSync(path.join(directory, "app", ".next"), { recursive: true });
  mkdirSync(path.join(directory, "hooks"));
  copyFileSync(new URL("../../cli/cli.js", import.meta.url), path.join(directory, "cli.cjs"));
  for (const name of ["serverShutdown.js", "serverRuntime.js"]) {
    copyFileSync(new URL(`../../cli/hooks/${name}`, import.meta.url), path.join(directory, "hooks", name));
  }
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "tray-fixture", version: "1.0.0" }));
  writeFileSync(path.join(directory, "app", ".next", "BUILD_ID"), "fixture");
  writeFileSync(path.join(directory, "app", "server.js"), `
    const server = require('http').createServer((_req, res) => res.end('gateway still serving'));
    server.listen(Number(process.env.PORT), '127.0.0.1');
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
  `);
  const preload = path.join(directory, "preload.cjs");
  writeFileSync(preload, `
    const Module = require('module'), fs = require('fs'), cp = require('child_process');
    const originalLoad = Module._load;
    cp.execSync = () => '';
    cp.exec = (_command, _options, callback) => callback?.(null, '');
    require('os').homedir = () => ${JSON.stringify(directory)};
    const exists = fs.existsSync;
    fs.existsSync = name => String(name).endsWith('hosts') ? false : exists(name);
    Object.defineProperty(process.stdin, 'isTTY', { value: true });
    let selected = false;
    Module._load = function(request, parent, isMain) {
      if (request === './hooks/dataDirectory') return { resolveDataDirectory: () => process.env.DATA_DIR };
      if (request === './hooks/sqliteRuntime') return { ensureSqliteRuntime() {}, buildEnvWithRuntime: value => value };
      if (request === './hooks/runtimeSecrets') return { buildSecretsEnv: () => ({}), getSecretsPath: () => '' };
      if (request === './hooks/nodeFlags') return { resolveHeapFlags: () => [] };
      if (request === './hooks/trayRuntime') return { ensureTrayRuntime() {} };
      if (request === './src/cli/tray/tray') return {
        initTray(options) { setTimeout(() => {
          ${handshake === "ready" ? "options.onReady?.();" : "options.onError?.(new Error('synthetic native tray failed'));"}
        }, 30); },
        killTray: () => Promise.resolve(),
      };
      if (request === './src/cli/utils/input') return {
        selectMenu: () => ${hide ? "!selected ? (selected = true, Promise.resolve(2)) : new Promise(() => {})" : "new Promise(() => {})"},
        pause: () => { fs.writeFileSync(${JSON.stringify(paused)}, 'menu remains active'); return new Promise(() => {}); },
      };
      if (request === './src/cli/utils/display') return { clearScreen() {} };
      if (request === './src/cli/utils/endpoint') return { getEndpoint: async () => ({ tunnelEnabled: false }) };
      return originalLoad.call(this, request, parent, isMain);
    };
  `);
  const child = spawn(process.execPath, ["--require", preload, path.join(directory, "cli.cjs"), "--skip-update", "--no-browser", "--host", "127.0.0.1", "--port", String(port), ...(hide ? [] : ["--tray"])], {
    env: { PATH: process.env.PATH, HOME: directory, DATA_DIR: directory, APPDATA: directory,
      KITSUNE_ROUTER_MIGRATION: "skip", KITSUNE_ROUTER_DISABLE_MITM: "1", KITSUNE_ROUTER_SHUTDOWN_DEADLINE_MS: "1000" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  const closed = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  try {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      if (hide ? existsSync(paused) : output.includes(handshake === "ready" ? "running in system tray" : "No tray icon")) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(hide ? existsSync(paused) : output.includes(handshake === "ready" ? "running in system tray" : "No tray icon"), output).toBe(true);
    const health = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
    expect(await health.text()).toBe("gateway still serving");
    return output;
  } finally {
    child.kill("SIGTERM");
    const watchdog = setTimeout(() => child.kill("SIGKILL"), 2500);
    try { expect(await closed, output).toBe(0); }
    finally { clearTimeout(watchdog); rmSync(directory, { recursive: true, force: true }); }
  }
}

describe("public launcher tray reporting", () => {
  it("announces its tray only after a successful readiness callback", async () => {
    expect(await publicLauncherFixture({ handshake: "ready" })).toContain("running in system tray");
  });

  it("reports a failed tray without claiming success or stopping the gateway", async () => {
    const output = await publicLauncherFixture({ handshake: "failed" });
    expect(output).toContain("server keeps running");
    expect(output).not.toContain("running in system tray");
  });

  it("keeps the current server and terminal menu when Hide has no working tray", async () => {
    const output = await publicLauncherFixture({ handshake: "failed", hide: true });
    expect(output).toContain("Hide to Tray is unavailable");
    expect(output).not.toContain("Starting background launcher");
    expect(output).not.toContain("icon already visible");
  });
});
