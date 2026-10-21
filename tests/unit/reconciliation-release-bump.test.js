import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "../..");
const directories = [];
const prefixes = ["", "cli/", "tests/", "gitbook/"];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const dir = mkdtempSync(resolve(process.env.RUNNER_TEMP || tmpdir(), "reconciliation-bump-"));
  directories.push(dir);
  mkdirSync(resolve(dir, "scripts"));
  for (const file of ["bump-version.mjs", "check-release-version.mjs"]) copyFileSync(resolve(root, "scripts", file), resolve(dir, "scripts", file));
  for (const prefix of prefixes) {
    mkdirSync(resolve(dir, prefix), { recursive: true });
    const name = prefix === "cli/" ? "@joyccn/zenrouter" : "fixture";
    writeFileSync(resolve(dir, prefix, "package.json"), JSON.stringify({ name, version: "0.9.7", dependencies: { untouched: "^1.0.0" } }));
    writeFileSync(resolve(dir, prefix, "package-lock.json"), JSON.stringify({ name, version: "0.9.7", lockfileVersion: 3, packages: { "": { name, version: "0.9.7" }, "node_modules/untouched": { version: "1.0.0", integrity: "fixture" } } }));
  }
  return dir;
}
const snapshot = dir => prefixes.flatMap(prefix => ["package.json", "package-lock.json"].map(file => readFileSync(resolve(dir, prefix, file), "utf8")));
const run = (dir, arg) => spawnSync(process.execPath, [resolve(dir, "scripts/bump-version.mjs"), arg], { encoding: "utf8", timeout: 5000 });

describe("version bump synchronizes the release guard's complete input set", () => {
  it.each([["patch", "0.9.8"], ["minor", "0.10.0"], ["major", "1.0.0"], ["2.3.4", "2.3.4"]])("%s synchronizes all four manifests and both lock roots", (arg, version) => {
    const dir = fixture();
    const result = run(dir, arg);
    expect(result.status, result.stderr).toBe(0);
    for (const prefix of prefixes) {
      const manifest = JSON.parse(readFileSync(resolve(dir, prefix, "package.json"), "utf8"));
      const lock = JSON.parse(readFileSync(resolve(dir, prefix, "package-lock.json"), "utf8"));
      expect([manifest.version, lock.version, lock.packages[""].version]).toEqual([version, version, version]);
      expect(manifest.dependencies).toEqual({ untouched: "^1.0.0" });
      expect(lock.packages["node_modules/untouched"]).toEqual({ version: "1.0.0", integrity: "fixture" });
    }
  });

  it.each(["01.2.3", "1.2.3\n", "1.2.3-beta", "not-a-version"])("rejects invalid target %j without writing any file", target => {
    const dir = fixture();
    const before = snapshot(dir);
    expect(run(dir, target).status).not.toBe(0);
    expect(snapshot(dir)).toEqual(before);
  });

  it.each(["stale-lock", "malformed-lock", "wrong-identity"])("preflights %s before changing any manifest", problem => {
    const dir = fixture();
    const path = resolve(dir, problem === "wrong-identity" ? "cli/package.json" : "gitbook/package-lock.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (problem === "wrong-identity") value.name = "untrusted-cli";
    else value.packages[""].version = "0.0.0";
    writeFileSync(path, problem === "malformed-lock" ? "{" : JSON.stringify(value));
    const before = snapshot(dir);
    expect(run(dir, "patch").status).not.toBe(0);
    expect(snapshot(dir)).toEqual(before);
  });

  it("rolls earlier writes back even when restoring the unwritable lock also fails", () => {
    const dir = fixture();
    const before = snapshot(dir);
    const preload = resolve(dir, "deny-write.cjs");
    writeFileSync(preload, `const fs = require('node:fs'); const original = fs.writeFileSync; fs.writeFileSync = (file, ...args) => { if (String(file).endsWith('gitbook/package-lock.json')) throw Error('Fixture lock is not writable'); return original(file, ...args); }; require('node:module').syncBuiltinESMExports();`);
    const result = spawnSync(process.execPath, ["--require", preload, resolve(dir, "scripts/bump-version.mjs"), "patch"], { encoding: "utf8", timeout: 5000 });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("not writable");
    expect(snapshot(dir)).toEqual(before);
  });
});
