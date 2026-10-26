import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkInstalledDependencies } from "../../scripts/check-installed-dependencies.mjs";

const directories = new Set();
const script = resolve("scripts/check-installed-dependencies.mjs");

function writeJson(path, value) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "zen-installed-deps-"));
  directories.add(root);
  const manifest = { name: "synthetic-install", version: "0.9.13", dependencies: { next: "^16.4.2" },
    devDependencies: { vitest: "^5.0.3" }, optionalDependencies: { "better-sqlite3": "^13.0.3" } };
  const lock = { version: manifest.version, packages: { "": manifest,
    "node_modules/next": { version: "16.4.2" }, "node_modules/vitest": { version: "5.0.3" },
    "node_modules/better-sqlite3": { version: "13.0.3" } } };
  writeJson(join(root, "package.json"), manifest);
  writeJson(join(root, "package-lock.json"), lock);
  for (const name of ["next", "vitest", "better-sqlite3"]) writeJson(join(root, "node_modules", name, "package.json"), { name, version: lock.packages[`node_modules/${name}`].version });
  return { root, manifest, lock };
}

afterEach(() => {
  for (const root of directories) rmSync(root, { recursive: true, force: true });
  directories.clear();
});

describe("installed dependency/lockfile boundary", () => {
  it("guards application, CLI and docs source builds plus both test entrypoints", () => {
    const read = path => JSON.parse(readFileSync(resolve(path), "utf8")).scripts;
    const app = read("package.json");
    expect(app.prebuild).toBe("node scripts/check-installed-dependencies.mjs");
    expect(app["prebuild:bun"]).toBe(app.prebuild);
    expect(app.pretest).toBe("node scripts/check-installed-dependencies.mjs . tests");
    expect(read("tests/package.json").pretest).toBe("node ../scripts/check-installed-dependencies.mjs .. .");
    expect(read("cli/package.json").prebuild).toBe("node ../scripts/check-installed-dependencies.mjs");
    expect(read("gitbook/package.json").prebuild).toBe("node ../scripts/check-installed-dependencies.mjs");
  });

  it("accepts an exact direct dependency installation without loading package code", () => {
    const { root } = fixture();
    writeFileSync(join(root, "node_modules/next/index.js"), "throw new Error('package code must not run')");
    expect(checkInstalledDependencies(root)).toEqual({ project: "synthetic-install", version: "0.9.13", checked: 3, optionalSkipped: 0 });
  });

  it("rejects the actual stale-Next deployment regression instead of changing the lockfile", () => {
    const { root } = fixture();
    const before = readFileSync(join(root, "package-lock.json"), "utf8");
    writeJson(join(root, "node_modules/next/package.json"), { name: "next", version: "16.3.8" });
    expect(() => checkInstalledDependencies(root)).toThrow("next: installed 16.3.8, locked 16.4.2");
    expect(readFileSync(join(root, "package-lock.json"), "utf8")).toBe(before);
  });

  it("checks dev dependencies too, since build/test tools must not come from a stale install", () => {
    const { root } = fixture();
    writeJson(join(root, "node_modules/vitest/package.json"), { version: "5.0.2" });
    expect(() => checkInstalledDependencies(root)).toThrow("vitest: installed 5.0.2, locked 5.0.3");
  });

  it("permits a missing optional native package without weakening required dependencies", () => {
    const { root } = fixture();
    rmSync(join(root, "node_modules/better-sqlite3"), { recursive: true });
    expect(checkInstalledDependencies(root)).toMatchObject({ checked: 2, optionalSkipped: 1 });
    rmSync(join(root, "node_modules/next"), { recursive: true });
    expect(() => checkInstalledDependencies(root)).toThrow("next: not installed");
  });

  it("rejects a stale installed optional dependency", () => {
    const { root } = fixture();
    writeJson(join(root, "node_modules/better-sqlite3/package.json"), { version: "13.0.2" });
    expect(() => checkInstalledDependencies(root)).toThrow("better-sqlite3: installed 13.0.2, locked 13.0.3");
  });

  it.each(["manifest", "lock", "locked root"])("rejects a mismatched %s application version", which => {
    const { root, manifest, lock } = fixture();
    if (which === "manifest") writeJson(join(root, "package.json"), { ...manifest, version: "0.9.12" });
    if (which === "lock") writeJson(join(root, "package-lock.json"), { ...lock, version: "0.9.12" });
    if (which === "locked root") {
      lock.packages[""].version = "0.9.12";
      writeJson(join(root, "package-lock.json"), lock);
    }
    expect(() => checkInstalledDependencies(root)).toThrow("package version differs");
  });

  it("rejects dependency-spec drift even when the installed version matches the old lock", () => {
    const { root, manifest } = fixture();
    manifest.dependencies.next = "^16.4.3";
    writeJson(join(root, "package.json"), manifest);
    expect(() => checkInstalledDependencies(root)).toThrow("dependencies.next differs");
  });

  it("rejects a manifest dependency missing its locked package entry", () => {
    const { root, lock } = fixture();
    delete lock.packages["node_modules/next"];
    writeJson(join(root, "package-lock.json"), lock);
    expect(() => checkInstalledDependencies(root)).toThrow("next: missing locked package version");
  });

  it("fails closed for corrupt installed metadata", () => {
    const { root } = fixture();
    writeFileSync(join(root, "node_modules/next/package.json"), "not json");
    expect(() => checkInstalledDependencies(root)).toThrow("next: unreadable installed package metadata");
  });

  it("does not use a parent node_modules to hide an incomplete nested installation", () => {
    const { root, manifest, lock } = fixture();
    const nested = join(root, "nested");
    writeJson(join(nested, "package.json"), manifest);
    writeJson(join(nested, "package-lock.json"), lock);
    expect(() => checkInstalledDependencies(nested)).toThrow("next: not installed");
  });

  it("checks multiple explicit projects from the CLI", () => {
    const first = fixture();
    const second = fixture();
    const results = JSON.parse(execFileSync(process.execPath, [script, first.root, second.root], { encoding: "utf8" }));
    expect(results).toHaveLength(2);
    expect(results.every(result => result.checked === 3)).toBe(true);
  });

  it("defaults the CLI to its current project and returns a nonzero status for drift", () => {
    const { root } = fixture();
    expect(JSON.parse(execFileSync(process.execPath, [script], { cwd: root, encoding: "utf8" }))[0].checked).toBe(3);
    writeJson(join(root, "node_modules/next/package.json"), { version: "16.3.8" });
    try {
      execFileSync(process.execPath, [script], { cwd: root, stdio: "pipe" });
      expect.fail("stale dependencies passed verification");
    } catch (error) {
      expect(error.status).toBe(1);
      expect(String(error.stderr)).toContain("Run npm ci");
    }
  });
});
