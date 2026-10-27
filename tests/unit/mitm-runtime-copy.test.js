import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const sourcePath = require.resolve("../../src/mitm/manager.js");
const directories = [];

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kitsunerouter-mitm-runtime-"));
  directories.push(directory);
  const bundled = path.join(directory, "node_modules", "@bykitsune", "router", "app", "src", "mitm", "server.js");
  const runtime = path.join(directory, "state", "runtime", "mitm", "server.js");
  fs.mkdirSync(path.dirname(bundled), { recursive: true });
  fs.mkdirSync(path.dirname(runtime), { recursive: true });
  return { directory, bundled, runtime };
}

function importManager({ directory, bundled }) {
  const fixtureModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), {
    module: fixtureModule,
    exports: fixtureModule.exports,
    __dirname: path.dirname(bundled),
    process: {
      env: { HOME: directory, DATA_DIR: path.join(directory, "state"), MITM_SERVER_PATH: bundled },
      platform: process.platform,
      cwd: () => directory,
    },
    console,
    require(name) {
      if (name === "./paths") return { DATA_DIR: path.join(directory, "state"), MITM_DIR: path.join(directory, "state", "mitm") };
      if (name === "./logger") return { log() {}, err() {} };
      if (["./dns/dnsConfig", "./winElevated.js", "./cert/generate", "./cert/install", "./cert/rootCA", "./config"].includes(name)) return {};
      if (name === "child_process") return {
        exec() { throw new Error("Runtime-copy import must not run OS commands"); },
        execSync() { throw new Error("Runtime-copy import must not run OS commands"); },
        spawn() { throw new Error("Runtime-copy import must not start a child"); },
      };
      return require(name);
    },
  }, { filename: sourcePath });
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("MITM import-time runtime bundle copy", () => {
  it("replaces a stale runtime bundle even when its bytes have the same length", () => {
    const value = fixture();
    const stale = "module.exports = 'obsolete vulnerable runtime';\n";
    const fresh = "module.exports = 'repaired protected runtime!';\n";
    expect(Buffer.byteLength(fresh)).toBe(Buffer.byteLength(stale));
    fs.writeFileSync(value.bundled, fresh);
    fs.writeFileSync(value.runtime, stale);
    importManager(value);
    expect(fs.readFileSync(value.runtime, "utf8")).toBe(fresh);
  });

  it("leaves identical runtime bytes untouched instead of copying on every import", () => {
    const value = fixture();
    fs.writeFileSync(value.bundled, "identical bundled server\n");
    fs.copyFileSync(value.bundled, value.runtime);
    const timestamp = new Date("2020-01-01T00:00:00Z");
    fs.utimesSync(value.runtime, timestamp, timestamp);
    importManager(value);
    expect(fs.statSync(value.runtime).mtimeMs).toBe(timestamp.getTime());
  });

  it("copies a missing runtime bundle into the relocatable state directory", () => {
    const value = fixture();
    fs.writeFileSync(value.bundled, "self-contained bundled server\n");
    importManager(value);
    expect(fs.readFileSync(value.runtime, "utf8")).toBe("self-contained bundled server\n");
  });
});
