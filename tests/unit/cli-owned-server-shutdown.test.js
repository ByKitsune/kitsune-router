import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { shutdownGraceMs, stopOwnedServer } = require("../../cli/hooks/serverShutdown.js");
const fixtures = [];
afterEach(async () => {
  for (const { root, children } of fixtures.splice(0)) {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
      }
    }
    rmSync(root, { recursive: true, force: true });
  }
});
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "kitsune-owned-shutdown-"));
  const fixture = { root, children: [] };
  fixtures.push(fixture);
  return fixture;
}
function launch(fixture, script, ipc = false) {
  const child = spawn(process.execPath, [script], {
    cwd: fixture.root, detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe", ...(ipc ? ["ipc"] : [])],
    env: { PATH: process.env.PATH, HOME: fixture.root, DATA_DIR: join(fixture.root, "data"),
      KITSUNE_ROUTER_MIGRATION: "skip", KITSUNE_ROUTER_SHUTDOWN_DEADLINE_MS: "2000" },
  });
  fixture.children.push(child);
  let output = "";
  child.stderr.on("data", chunk => { output += chunk; });
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`server fixture did not start: ${output}`)), 3000);
    child.once("error", reject);
    child.stdout.on("data", chunk => {
      output += chunk;
      if (output.includes("READY")) { clearTimeout(deadline); resolve(child); }
    });
  });
}

describe("owned launcher server shutdown", () => {
  it.each(["request", "disconnect"])("lets the real managed wrapper drain on private IPC %s", async mode => {
    const fixture = createFixture();
    const { root } = fixture;
    copyFileSync(new URL("../../custom-server.js", import.meta.url), join(root, "custom-server.js"));
    copyFileSync(new URL("../../shutdown-lifecycle.cjs", import.meta.url), join(root, "shutdown-lifecycle.cjs"));
    mkdirSync(join(root, "cli/hooks"), { recursive: true });
    copyFileSync(new URL("../../cli/hooks/dataDirectory.js", import.meta.url), join(root, "cli/hooks/dataDirectory.js"));
    writeFileSync(join(root, "server.js"), `
      const fs = require('node:fs');
      const { registerShutdownHook } = require('./shutdown-lifecycle.cjs');
      const order = [];
      registerShutdownHook('usage', 30, async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        order.push('usage');
      });
      registerShutdownHook('db', 60, () => { order.push('database'); fs.writeFileSync('drained.json', JSON.stringify(order)); });
      const helper = require('node:child_process').spawnSync(process.execPath, ['-e', 'process.stdout.write(String(Boolean(process.connected)))'], { env: { ...process.env }, encoding: 'utf8' });
      if (helper.stdout !== 'false') process.exit(2);
      setInterval(() => {}, 1000);
      console.log('READY');
    `);
    const child = await launch(fixture, join(root, "custom-server.js"), true);
    // Windows uses IPC because its SIGTERM is an immediate termination. This
    // exercises that request on the real wrapper without claiming native Win.
    if (mode === "request") {
      const first = stopOwnedServer(child, { platform: "win32", graceMs: 2500 });
      expect(stopOwnedServer(child, { platform: "win32" })).toBe(first);
      expect(await first).toEqual({ code: 0, forced: false });
    } else {
      const exited = new Promise(resolve => child.once("exit", resolve));
      child.disconnect();
      expect(await exited).toBe(0);
    }
    expect(JSON.parse(readFileSync(join(root, "drained.json"), "utf8"))).toEqual(["usage", "database"]);
  });

  it.skipIf(process.platform === "win32")("escalates a stuck owned group without stopping an unrelated process", async () => {
    const fixture = createFixture();
    const script = join(fixture.root, "server.js");
    writeFileSync(script, `
      process.on('SIGTERM', () => {});
      const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      require('node:fs').writeFileSync(process.pid + '.child', String(child.pid));
      setInterval(() => {}, 1000);
      console.log('READY');
    `);
    const stuck = await launch(fixture, script);
    const unrelated = await launch(fixture, script);
    expect(await stopOwnedServer(stuck, { graceMs: 30, forceWaitMs: 1000 })).toEqual({ code: 1, forced: true });
    expect(stuck.signalCode).toBe("SIGKILL");
    const descendantPid = Number(readFileSync(join(fixture.root, `${stuck.pid}.child`), "utf8"));
    const running = () => {
      try {
        process.kill(descendantPid, 0);
        // Linux can retain an already-killed orphan as a zombie until pid1
        // reaps it; it is no longer executing or holding sockets/resources.
        if (process.platform === "linux") return !/^State:\s+Z/m.test(readFileSync(`/proc/${descendantPid}/status`, "utf8"));
        return true;
      } catch { return false; }
    };
    for (let i = 0; i < 20 && running(); i++) await new Promise(resolve => setTimeout(resolve, 10));
    expect(running()).toBe(false);
    expect(unrelated.exitCode).toBeNull();
    expect(unrelated.signalCode).toBeNull();
    expect(() => process.kill(unrelated.pid, 0)).not.toThrow();
  });

  it("honors the server drain deadline and ignores invalid values", () => {
    expect(shutdownGraceMs({ KITSUNE_ROUTER_SHUTDOWN_DEADLINE_MS: "30000" })).toBe(31000);
    for (const value of ["", "0", "-1", "garbage"]) {
      expect(shutdownGraceMs({ KITSUNE_ROUTER_SHUTDOWN_DEADLINE_MS: value })).toBe(16000);
    }
  });
});
