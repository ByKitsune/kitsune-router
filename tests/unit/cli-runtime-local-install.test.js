import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const filename = fileURLToPath(new URL("../../cli/hooks/sqliteRuntime.js", import.meta.url));
const ownedDirs = [];
afterEach(() => {
  for (const dir of ownedDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function capturedInstall(platform) {
  const selectedPath = platform === "win32" ? path.win32 : path.posix;
  const cwd = platform === "win32" ? "C:\\Fixture User\\App Data\\runtime" : "/tmp/fixture user/private runtime";
  const inherited = Object.freeze({
    PATH: "synthetic-path", NPM_CONFIG_GLOBAL: "true", npm_config_global: "true",
    NPM_CONFIG_PREFIX: "synthetic-global-prefix", npm_config_prefix: "synthetic-other-prefix",
    NPM_CONFIG_LOCATION: "global", npm_config_location: "global",
    HTTPS_PROXY: "http://synthetic-proxy.invalid:8080", HTTP_PROXY: "http://synthetic-proxy.invalid:8080",
    NO_PROXY: "localhost", NODE_EXTRA_CA_CERTS: "synthetic-ca.pem", npm_config_cafile: "synthetic-npm-ca.pem",
    npm_config_registry: "https://synthetic-registry.invalid", npm_config_userconfig: "synthetic-auth.npmrc",
    npm_config_strict_ssl: "true", NPM_TOKEN: "synthetic-auth-token",
  });
  const before = { ...inherited };
  const fixtureModule = { exports: {} };
  let call;
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module: fixtureModule, exports: fixtureModule.exports, console,
    process: { env: inherited, platform, versions: process.versions },
    require(name) {
      if (name === "path") return selectedPath;
      if (name === "./dataDirectory") return { resolveDataDirectory: () => cwd };
      if (name === "child_process") return { spawnSync(command, args, options) {
        call = { command, args: [...args], options };
        return { status: 0, stdout: "fixture installed", stderr: "" };
      } };
      return require(name);
    },
  }, { filename });
  const options = { cwd, pkgs: ["sql.js@1.15.2"], extraArgs: ["--ignore-scripts", "--no-save"], timeout: 12345 };
  const original = structuredClone(options);
  const result = fixtureModule.exports.runNpmInstall(options);
  expect(options).toEqual(original);
  expect(inherited).toEqual(before);
  return { call, cwd, inherited, result };
}

describe("runtime npm installs stay in the private local project", () => {
  it.each(["linux", "win32"])("isolates global lifecycle selectors and preserves transport/auth configuration on %s", platform => {
    const { call, cwd, inherited, result } = capturedInstall(platform);
    expect(call.command).toBe(platform === "win32" ? "npm.cmd" : "npm");
    expect(call.options.cwd).toBe(cwd);
    expect(call.options.env).not.toBe(inherited);
    expect(call.options.env.npm_config_global).toBe("false");
    expect(call.options.env.npm_config_prefix).toBe(cwd);
    expect(call.options.env.npm_config_location).toBe("project");
    for (const key of ["NPM_CONFIG_GLOBAL", "NPM_CONFIG_PREFIX", "NPM_CONFIG_LOCATION"]) expect(call.options.env).not.toHaveProperty(key);
    for (const key of Object.keys(inherited).filter(key => !/^npm_config_(global|prefix|location)$/i.test(key))) {
      expect(call.options.env[key], key).toBe(inherited[key]);
    }
    expect(call.args).toEqual(expect.arrayContaining(["sql.js@1.15.2", "--ignore-scripts", "--no-save", "--global=false", "--location=project"]));
    expect(call.args).not.toContain(cwd);
    expect(call.options).toMatchObject({ timeout: 12345, encoding: "utf8", shell: platform === "win32" });
    expect(result).toEqual({ ok: true, code: 0, stdout: "fixture installed", stderr: "" });
  });

  // Real npm, no registry or lifecycle scripts. The inherited-global case fails
  // on the original helper by putting the fixture in this test's global prefix.
  // Native Windows invocation is covered by the contract above, not certified
  // by a POSIX npm fixture.
  it.skipIf(process.platform === "win32").each([true, false])("installs an offline fixture locally with inherited global=%s and a different prefix", global => {
    const area = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune runtime local install "));
    ownedDirs.push(area);
    const runtime = path.join(area, "private runtime");
    const prefix = path.join(area, "isolated global prefix");
    const fixture = path.join(area, "offline fixture package");
    for (const dir of [runtime, prefix, fixture]) fs.mkdirSync(dir, { recursive: true });
    const name = "kitsune-runtime-local-fixture";
    fs.writeFileSync(path.join(runtime, "package.json"), JSON.stringify({ name: "private-runtime-fixture", version: "1.0.0", private: true }));
    fs.writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
    const userconfig = path.join(area, "fixture npmrc");
    fs.writeFileSync(userconfig, "global=true\n");
    const env = { ...process.env, npm_config_global: String(global), npm_config_prefix: prefix,
      npm_config_location: "global", npm_config_userconfig: userconfig, npm_config_cache: path.join(area, "npm cache"), npm_config_update_notifier: "false" };
    const script = `const {runNpmInstall}=require(${JSON.stringify(filename)});process.stdout.write(JSON.stringify(runNpmInstall({cwd:${JSON.stringify(runtime)},pkgs:[${JSON.stringify(`file:${fixture}`)}],extraArgs:["--offline","--ignore-scripts","--package-lock=false"],timeout:30000})));`;
    const child = spawnSync(process.execPath, ["-e", script], { env, encoding: "utf8", timeout: 45000 });
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(child.stderr).toBe("");
    const result = JSON.parse(child.stdout);
    expect(result.ok, result.stderr).toBe(true);
    expect(result.stderr).toBe("");
    expect(JSON.parse(fs.readFileSync(path.join(runtime, "node_modules", name, "package.json"), "utf8")).name).toBe(name);
    expect(fs.readdirSync(prefix)).toEqual([]);
    expect(fs.readFileSync(userconfig, "utf8")).toBe("global=true\n");
  }, 60000);
});
