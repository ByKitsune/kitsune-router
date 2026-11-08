import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const installer = fs.readFileSync(new URL("../../install.sh", import.meta.url), "utf8");
const configuration = installer.slice(installer.indexOf("# Configuration"), installer.indexOf("# Helpers"));
const functions = [...installer.matchAll(/^\w+\(\) \{[\s\S]*?^\}/gm)].map(([body]) => body).join("\n");
const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
const areas = [];

afterEach(() => {
  for (const area of areas.splice(0)) fs.rmSync(area, { recursive: true, force: true });
});

function fixture() {
  const area = fs.mkdtempSync(path.join(os.tmpdir(), "router launcher's safety "));
  areas.push(area);
  const bin = path.join(area, "global bin");
  const links = path.join(area, "user bin");
  const global = path.join(area, "global packages");
  const target = path.join(global, "node_modules/@bykitsune/router/cli.js");
  const runtime = path.join(area, "selected bun's");
  for (const directory of [bin, links, path.dirname(target)]) fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(target, "original package JS bytes\n");
  fs.writeFileSync(runtime, `#!/bin/sh
if [ "$1 $2 $3" = 'pm -g bin' ]; then printf '%s\\n' ${quote(bin)}; exit 0; fi
if [ "$1 $2 $3" = 'pm -g ls' ]; then printf '%s node_modules (1 installed)\\n' ${quote(global)}; exit 0; fi
if [ "$1 $2" = 'add -g' ]; then
  [ ! -f ${quote(path.join(area, "fail-add"))} ] || exit 71
  if [ -e ${quote(path.join(bin, "kitsune-router"))} ] && [ ! -L ${quote(path.join(bin, "kitsune-router"))} ]; then
    printf 'error: failed to link package: EEXIST\\n' >&2; exit 1
  fi
  ln -sf ${quote(target)} ${quote(path.join(bin, "kitsune-router"))}
  exit 0
fi
if [ "$1" = ${quote(target)} ]; then printf 'fixture-version\\n'; exit 0; fi
exit 99
`);
  fs.chmodSync(runtime, 0o755);
  return { area, bin, links, target, runtime };
}

function run(f, action) {
  return spawnSync("bash", ["--noprofile", "--norc", "-s"], {
    input: `set -e\n${configuration}\n${functions}
log_info() { :; }
log_step() { :; }
log_success() { :; }
log_warn() { printf '%s\\n' "$1" >&2; }
log_error() { printf '%s\\n' "$1" >&2; }
get_link_dir() { printf '%s\\n' ${quote(f.links)}; }
RUNTIME=bun
BUN_CMD=${quote(f.runtime)}
${action}
`,
    cwd: f.area, env: { PATH: process.env.PATH, HOME: f.area, NODE_ENV: "test" }, encoding: "utf8", timeout: 5000,
  });
}

describe("Bun launcher file ownership and reinstall safety", () => {
  it("reinstalls marked global wrappers when the package manager rejects ordinary bin files", () => {
    const f = fixture();
    const result = run(f, 'install_via_npm; install_via_npm; "$BUN_CLI_CMD" --version');
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toBe("fixture-version\n");
    expect(result.stderr).toBe("");
    expect(fs.readFileSync(f.target, "utf8")).toBe("original package JS bytes\n");
    for (const directory of [f.bin, f.links]) {
      const entry = path.join(directory, "kitsune-router");
      expect(fs.lstatSync(entry).isSymbolicLink()).toBe(false);
      expect(fs.statSync(entry).mode & 0o777).toBe(0o755);
      expect(fs.readdirSync(directory)).toEqual(["kitsune-router"]);
    }
  });

  it("restores the previous launcher when Bun fails before recreating its bin", () => {
    const f = fixture();
    expect(run(f, "install_via_npm").status).toBe(0);
    const entry = path.join(f.bin, "kitsune-router");
    const previous = fs.readFileSync(entry, "utf8");
    fs.writeFileSync(path.join(f.area, "fail-add"), "synthetic failure");
    const result = run(f, "install_via_npm");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("bun add -g failed");
    expect(fs.readFileSync(entry, "utf8")).toBe(previous);
    expect(fs.readdirSync(f.bin)).toEqual(["kitsune-router"]);
  });

  it("retains an unrelated user command instead of retiring it as our launcher", () => {
    const f = fixture();
    const entry = path.join(f.bin, "kitsune-router");
    fs.writeFileSync(entry, "unrelated user command\n");
    const result = run(f, "install_via_npm");
    expect(result.status).toBe(1);
    expect(fs.readFileSync(entry, "utf8")).toBe("unrelated user command\n");
    expect(fs.readdirSync(f.bin)).toEqual(["kitsune-router"]);
  });

  it.each([false, true])("rejects directory launcher destinations without writing inside them, symbolic=%s", symbolic => {
    const f = fixture();
    const destination = path.join(f.links, "kitsune-router");
    const directory = symbolic ? path.join(f.area, "operator directory") : destination;
    fs.mkdirSync(directory);
    if (symbolic) fs.symlinkSync(directory, destination, "dir");
    const result = run(f, `create_bun_launcher ${quote(f.target)} ${quote(destination)}`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Launcher destination is a directory");
    expect(fs.readdirSync(directory)).toEqual([]);
    if (symbolic) expect(fs.lstatSync(destination).isSymbolicLink()).toBe(true);
  });
});
