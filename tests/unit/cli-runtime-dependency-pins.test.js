import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rootPackage = require("../../package.json");
const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function runtimeInstallRequests() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-router-runtime-pins-"));
  tempDirs.push(dataDir);
  const fixtureModule = { exports: {} };
  const calls = [];
  const filename = new URL("../../cli/hooks/sqliteRuntime.js", import.meta.url);
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module: fixtureModule,
    exports: fixtureModule.exports,
    __dirname: path.join(dataDir, "hooks"),
    console,
    process: { env: { HOME: dataDir, DATA_DIR: dataDir }, platform: process.platform, arch: process.arch, versions: process.versions, report: process.report },
    require(name) {
      if (name === "./dataDirectory") return { resolveDataDirectory: () => dataDir };
      if (name === "child_process") return {
        spawnSync(command, args) { calls.push({ command, args }); return { status: 0, stdout: "", stderr: "" }; },
      };
      return require(name);
    },
  }, { filename: filename.pathname });
  fixtureModule.exports.ensureSqliteRuntime({ silent: true });
  return calls;
}

describe("CLI runtime dependency pins", () => {
  it("installs the same sql.js stable version as the app fallback", () => {
    const calls = runtimeInstallRequests();
    expect(calls.some(({ args }) => args.includes(`sql.js@${rootPackage.dependencies["sql.js"].replace(/^\^/, "")}`))).toBe(true);
  });

  it("keeps the optional bundled N-API SQLite release and skips lifecycle builds", () => {
    const sqlite = runtimeInstallRequests().find(({ args }) => args.some((arg) => arg.startsWith("better-sqlite3@")));
    expect(sqlite.args).toEqual(expect.arrayContaining([
      `better-sqlite3@${rootPackage.optionalDependencies["better-sqlite3"].replace(/^\^/, "")}`,
      "--ignore-scripts", "--no-save",
    ]));
  });
});
