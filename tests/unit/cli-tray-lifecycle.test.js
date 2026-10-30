import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const launcher = fileURLToPath(new URL("../../cli/cli.js", import.meta.url));

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function privatePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

// Run the public launcher against a real disposable server. Only package setup,
// system-wide process discovery, and native tray/UI integrations are isolated.
async function runLauncher({ tray, crash, shutdown = false }) {
  const port = await privatePort();
  const dir = mkdtempSync(path.join(tmpdir(), "cli-lifecycle-"));
  const record = path.join(dir, "starts.json");
  const trayRecord = path.join(dir, "tray-pid.json");
  const trayReady = path.join(dir, "tray-ready");
  const drainRecord = path.join(dir, "drained.json");
  mkdirSync(path.join(dir, "app"));
  copyFileSync(launcher, path.join(dir, "cli.cjs"));
  mkdirSync(path.join(dir, "hooks"));
  copyFileSync(new URL("../../cli/hooks/serverShutdown.js", import.meta.url), path.join(dir, "hooks/serverShutdown.js"));
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "lifecycle-fixture", version: "1.0.0" }));
  writeFileSync(path.join(dir, "app", "server.js"), `
    const fs = require('fs');
    const record = ${JSON.stringify(record)};
    const starts = fs.existsSync(record) ? JSON.parse(fs.readFileSync(record)) : [];
    starts.push(process.pid);
    fs.writeFileSync(record, JSON.stringify(starts));
    const server = require('net').createServer(socket => socket.end());
    server.listen(Number(process.env.PORT), process.env.HOSTNAME, () => {
      const ready = setInterval(() => {
        if (!fs.existsSync(${JSON.stringify(trayReady)})) return;
        clearInterval(ready);
        ${shutdown ? "return;" : `server.close(() => process.exit(${crash ? "starts.length === 1 ? 23 : 0" : "0"}));`}
      }, 20);
    });
    ${shutdown ? `
    let stopping = false;
    process.on('SIGTERM', () => {
      if (stopping) return;
      stopping = true;
      // Model the real custom-server's async durable-usage phase before DB close.
      server.close(() => setTimeout(() => {
        fs.writeFileSync(${JSON.stringify(drainRecord)}, JSON.stringify(['usage-drained', 'database-closed']));
        process.exit(0);
      }, 150));
    });` : ""}
  `);
  const trayScript = path.join(dir, "native-tray.cjs");
  writeFileSync(trayScript, `
    const fs = require('fs');
    fs.writeFileSync(${JSON.stringify(trayRecord)}, JSON.stringify(process.pid));
    fs.writeFileSync(${JSON.stringify(trayReady)}, 'ready');
    // Like Application.Run in tray.ps1, stdin EOF does not close the tray.
    process.stdin.on('end', () => {});
    process.stdin.on('data', () => setTimeout(() => process.exit(0), 50));
    setInterval(() => {}, 1000);
  `);
  const preload = path.join(dir, "isolate.cjs");
  writeFileSync(preload, `
    const Module = require('module');
    const fs = require('fs');
    const cp = require('child_process');
    const originalLoad = Module._load;
    cp.execSync = () => '';
    cp.exec = (_command, _options, callback) => { if (callback) callback(null, ''); };
    require('os').homedir = () => ${JSON.stringify(dir)};
    const originalExists = fs.existsSync;
    fs.existsSync = (name) => String(name).endsWith('hosts') ? false : originalExists(name);
    Object.defineProperty(process.stdin, 'isTTY', { value: true });
    let trayChild;
    Module._load = function(request, parent, isMain) {
      if (request === './hooks/dataDirectory') return { resolveDataDirectory: () => process.env.DATA_DIR };
      if (request === './hooks/sqliteRuntime') return { ensureSqliteRuntime() {}, buildEnvWithRuntime: env => env };
      if (request === './hooks/runtimeSecrets') return { buildSecretsEnv: () => ({}), getSecretsPath: () => '' };
      if (request === './hooks/nodeFlags') return { resolveHeapFlags: () => [] };
      if (request === './hooks/trayRuntime') return { ensureTrayRuntime() {} };
      if (request === './src/cli/tray/autostart') return { migrateLegacyAutoStart: () => ({ migrated: false, warnings: [] }) };
      if (request === './src/cli/tray/tray') return {
        initTray() {
          if (trayChild) return;
          trayChild = cp.spawn(process.execPath, [${JSON.stringify(trayScript)}], {
            detached: true, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'],
          });
        },
        killTray() {
          if (!trayChild) return Promise.resolve();
          const child = trayChild;
          return new Promise(resolve => {
            child.once('exit', resolve);
            child.stdin.end('quit');
          });
        },
      };
      if (request === './src/cli/utils/input') return { selectMenu: () => new Promise(() => {}) };
      if (request === './src/cli/utils/display') return { clearScreen() {} };
      if (request === './src/cli/utils/endpoint') return { getEndpoint: async () => ({ tunnelEnabled: false }) };
      return originalLoad.call(this, request, parent, isMain);
    };
  `);
  const child = spawn(process.execPath, ["--require", preload, path.join(dir, "cli.cjs"), "--skip-update", "--no-browser", "--host", "127.0.0.1", "--port", String(port), ...(tray ? ["--tray"] : [])], {
    env: {
      PATH: process.env.PATH, HOME: dir, APPDATA: dir, DATA_DIR: dir, SystemRoot: dir,
      NODE_ENV: "test", RUN_REAL: "0", RUN_E2E: "0", RUN_LIVE_TESTS: "0", AG_CACHE_TEST: "0",
      MODEL_CATALOG_SYNC: "off", DISABLE_BACKGROUND_TOKEN_REFRESH: "1",
      KITSUNE_ROUTER_DISABLE_MITM: "1", NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let stopping = false;
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  const stopWhenReady = shutdown ? setInterval(() => {
    if (!stopping && readReady()) {
      stopping = true;
      child.kill("SIGTERM");
    }
  }, 20) : null;
  function readReady() {
    try { return readFileSync(trayReady, "utf8") === "ready"; } catch { return false; }
  }
  const watchdog = setTimeout(() => child.kill(), 6000);
  let liveTrayPid;
  try {
    const code = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    const pids = JSON.parse(readFileSync(record, "utf8"));
    const trayPid = JSON.parse(readFileSync(trayRecord, "utf8"));
    const trayAlive = isAlive(trayPid);
    // This fixture tray persists without a quit command, so a live tray here
    // is still our orphan, not a historical PID from a terminated server.
    if (trayAlive) liveTrayPid = trayPid;
    let drained = null;
    try { drained = JSON.parse(readFileSync(drainRecord, "utf8")); } catch {}
    return { code, pids, output, trayAlive, drained };
  } finally {
    clearTimeout(watchdog);
    clearInterval(stopWhenReady);
    child.kill();
    // Never signal historical server PIDs: the OS may already have reused them.
    if (liveTrayPid) {
      try { process.kill(liveTrayPid, "SIGKILL"); } catch {}
      const deadline = Date.now() + 2000;
      while (isAlive(liveTrayPid) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("public CLI child lifecycle", () => {
  it("waits for the owned server's durable drain before exiting on SIGTERM", async () => {
    const result = await runLauncher({ tray: true, crash: false, shutdown: true });
    expect(result.code, result.output).toBe(0);
    expect(result.drained).toEqual(["usage-drained", "database-closed"]);
    expect(result.pids).toHaveLength(1);
    expect(result.output).not.toContain("Restarting in");
    expect(result.trayAlive).toBe(false);
  }, 10000);

  it.each([true, false])("recovers a crashed server once and exits on clean close (tray=%s)", async tray => {
    const result = await runLauncher({ tray, crash: true });
    expect(result.code).toBe(0);
    expect(result.pids).toHaveLength(2);
    expect(result.pids[0]).not.toBe(result.pids[1]);
    expect(result.output.match(/Restarting in/g)).toHaveLength(1);
    expect(result.trayAlive).toBe(false);
  }, 10000);

  it("terminates its native tray resource when the server closes cleanly", async () => {
    const result = await runLauncher({ tray: true, crash: false });
    expect(result.code).toBe(0);
    expect(result.pids).toHaveLength(1);
    expect(result.output).not.toContain("Restarting in");
    expect(result.trayAlive).toBe(false);
  }, 10000);

});
