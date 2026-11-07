import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { resolveServerRuntime } = require("../../cli/hooks/serverRuntime.js");
const fixtures = [];

afterEach(() => {
  for (const directory of fixtures.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune source runtime "));
  fixtures.push(root);
  const cli = path.join(root, "cli");
  fs.mkdirSync(cli);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "kitsune-router-app" }));
  fs.writeFileSync(path.join(root, "next.config.mjs"), "");
  return { root, cli };
}

function build(directory, dist = ".next", custom = true) {
  fs.mkdirSync(path.join(directory, dist), { recursive: true });
  fs.writeFileSync(path.join(directory, "server.js"), "generated server");
  fs.writeFileSync(path.join(directory, dist, "BUILD_ID"), "synthetic-production-build");
  if (custom) {
    fs.writeFileSync(path.join(directory, "custom-server.js"), "custom server");
    if (directory.split(path.sep).includes("standalone")) {
      fs.writeFileSync(path.join(directory, "shutdown-lifecycle.cjs"), "startup closure");
      fs.mkdirSync(path.join(directory, "cli", "hooks"), { recursive: true });
      fs.writeFileSync(path.join(directory, "cli", "hooks", "dataDirectory.js"), "startup closure");
    }
  }
}

describe("source and packaged CLI production runtime resolution", () => {
  it.each(["--dir", "--branch"])("rejects missing %s values before network or install work", option => {
    const result = spawnSync("bash", [fileURLToPath(new URL("../../install.sh", import.meta.url)), option], {
      encoding: "utf8", timeout: 5000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${option} requires a non-empty value`);
    expect(result.stdout).not.toContain("Checking connectivity");
  });
  it.each([false, true])("starts the actual source standalone build with nested=%s", nested => {
    const { root, cli } = fixture();
    const output = path.join(root, ".next", "standalone", ...(nested ? [path.basename(root)] : []));
    build(output);
    expect(resolveServerRuntime(cli)).toEqual({ directory: output, serverPath: path.join(output, "custom-server.js") });
  });

  it("prefers the source build when a checkout retains an older packaged CLI bundle", () => {
    const { root, cli } = fixture();
    const packaged = path.join(cli, "app");
    build(packaged, ".next-cli-build");
    const source = path.join(root, ".next", "standalone");
    build(source);
    expect(resolveServerRuntime(cli)).toEqual({ directory: source, serverPath: path.join(source, "custom-server.js") });
  });

  it("uses a complete packaged bundle when no completed source build is present", () => {
    const { root, cli } = fixture();
    const packaged = path.join(cli, "app");
    build(packaged, ".next-cli-build");
    const incomplete = path.join(root, ".next", "standalone");
    fs.mkdirSync(incomplete, { recursive: true });
    fs.writeFileSync(path.join(incomplete, "server.js"), "incomplete source build");
    expect(resolveServerRuntime(cli)).toEqual({ directory: packaged, serverPath: path.join(packaged, "custom-server.js") });
  });

  it.each(["custom-server.js", "shutdown-lifecycle.cjs", "cli/hooks/dataDirectory.js"])("skips source output missing %s even with BUILD_ID", missing => {
    const { root, cli } = fixture();
    const source = path.join(root, ".next", "standalone");
    build(source);
    fs.rmSync(path.join(source, missing));
    expect(() => resolveServerRuntime(cli)).toThrow("Production standalone build not found");
    const packaged = path.join(cli, "app");
    build(packaged, ".next-cli-build");
    expect(resolveServerRuntime(cli)).toEqual({ directory: packaged, serverPath: path.join(packaged, "custom-server.js") });
  });

  it("uses Next's generated server when the optional custom server is absent", () => {
    const { cli } = fixture();
    const packaged = path.join(cli, "app");
    build(packaged, ".next", false);
    expect(resolveServerRuntime(cli).serverPath).toBe(path.join(packaged, "server.js"));
  });

  it("rejects a missing or incomplete build rather than a version-only success", () => {
    const { root, cli } = fixture();
    expect(() => resolveServerRuntime(cli)).toThrow("Production standalone build not found");
    const output = path.join(root, ".next", "standalone");
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, "server.js"), "incomplete generated server");
    expect(() => resolveServerRuntime(cli)).toThrow("Production standalone build not found");
  });

  it("does not discover an unrelated neighboring project's server", () => {
    const { root, cli } = fixture();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "unrelated-project" }));
    build(path.join(root, ".next", "standalone"));
    expect(() => resolveServerRuntime(cli)).toThrow("Production standalone build not found");
  });

  it("checks an incomplete CLI without migration, runtime installs, or state creation", () => {
    const { root, cli } = fixture();
    const hooks = path.join(cli, "hooks");
    fs.mkdirSync(hooks);
    fs.copyFileSync(new URL("../../cli/cli.js", import.meta.url), path.join(cli, "cli.js"));
    fs.copyFileSync(new URL("../../cli/hooks/serverRuntime.js", import.meta.url), path.join(hooks, "serverRuntime.js"));
    fs.writeFileSync(path.join(cli, "package.json"), JSON.stringify({ version: "1.0.0" }));
    const home = path.join(root, "unused-home");
    const result = spawnSync(process.execPath, [path.join(cli, "cli.js"), "--check-install"], {
      env: { PATH: process.env.PATH, HOME: home, DATA_DIR: path.join(home, "state") }, encoding: "utf8", timeout: 5000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Production standalone build not found");
    expect(fs.existsSync(home)).toBe(false);
  });
});
