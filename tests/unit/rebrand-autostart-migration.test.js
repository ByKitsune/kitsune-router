import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL("../../cli/src/cli/tray/autostart.js", import.meta.url), "utf8");
const homes = [];

afterEach(() => { for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true }); });

function fixture(platform = "linux") {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-autostart-migration-"));
  homes.push(home);
  const appdata = path.join(home, "AppData");
  const directory = platform === "linux" ? path.join(home, ".config", "autostart")
    : platform === "darwin" ? path.join(home, "Library", "LaunchAgents")
      : path.join(appdata, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
  fs.mkdirSync(directory, { recursive: true });
  const cli = path.join(home, "new & installation", "cli.js");
  fs.mkdirSync(path.dirname(cli));
  fs.writeFileSync(cli, "// synthetic launcher, never executed");
  const fixtureModule = { exports: {} };
  let systemCommands = 0;
  const options = { platform, home, env: { APPDATA: appdata }, sourceName: "zenrouter" };
  vm.runInNewContext(source, {
    module: fixtureModule, exports: fixtureModule.exports, __dirname: directory,
    process: { platform, pid: process.pid, execPath: "/synthetic/node", argv: [], env: options.env },
    require(name) {
      if (name === "child_process") return { execFileSync() { systemCommands++; throw new Error("Automatic startup migration must never invoke OS commands"); } };
      if (name === "os") return { homedir: () => home };
      if (["fs", "path", "crypto"].includes(name)) return require(name);
      throw new Error(`Unexpected auto-start dependency: ${name}`);
    },
  });
  const extension = platform === "linux" ? "desktop" : platform === "darwin" ? "plist" : "vbs";
  const legacy = path.join(directory, platform === "darwin" ? "com.zenrouter.autostart.plist" : `zenrouter.${extension}`);
  const target = path.join(directory, platform === "darwin" ? "com.bykitsune.router.autostart.plist" : `kitsune-router.${extension}`);
  return { home, cli, legacy, target, directory, options, api: fixtureModule.exports, commands: () => systemCommands, migrate: () => fixtureModule.exports.migrateLegacyAutoStart(cli, options) };
}

function desktop({ name = "ZenRouter", exec = "/synthetic/node /synthetic/node_modules/zenrouter/cli.js --tray --skip-update", enabled = true } = {}) {
  return `[Desktop Entry]\nType=Application\nName=${name}\nComment=${name} API Proxy\nExec=${exec}\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=${enabled}\n`;
}

describe("legacy opt-in auto-start migration", () => {
  it("backs up and replaces a recognized desktop record without executing a command", () => {
    const f = fixture();
    const original = desktop();
    fs.writeFileSync(f.legacy, original);
    expect(f.migrate().migrated).toBe(true);
    expect(fs.existsSync(f.legacy)).toBe(false);
    expect(fs.readFileSync(`${f.legacy}.kitsune-router-backup`, "utf8")).toBe(original);
    const migrated = fs.readFileSync(f.target, "utf8");
    expect(migrated).toContain("Name=Kitsune Router");
    expect(migrated).toContain(`Exec="/synthetic/node" "${f.cli}" --tray --skip-update`);
    expect(f.migrate().migrated).toBe(false);
    expect(f.commands()).toBe(0);
  });

  it.each([
    desktop({ enabled: false }),
    desktop({ exec: "sh -c 'zenrouter --tray'" }),
    desktop({ exec: "/synthetic/node /synthetic/node_modules/zenrouter/cli.js --tray --skip-update --host 0.0.0.0" }),
    `${desktop()}X-Custom-Action=retain\n`,
    desktop({ exec: "/synthetic/node /operator/custom/cli.js --tray --skip-update" }),
  ])("leaves customized, disabled and unrecognized desktop records unchanged", original => {
    const f = fixture();
    fs.writeFileSync(f.legacy, original);
    expect(f.migrate().warnings.join(" ")).toMatch(/retained unchanged/);
    expect(fs.readFileSync(f.legacy, "utf8")).toBe(original);
    expect(fs.existsSync(f.target)).toBe(false);
    expect(fs.existsSync(`${f.legacy}.kitsune-router-backup`)).toBe(false);
  });

  it("never overwrites an already configured new record or a legacy backup", () => {
    const f = fixture();
    fs.writeFileSync(f.legacy, desktop());
    fs.writeFileSync(f.target, "operator startup record");
    expect(f.migrate().migrated).toBe(false);
    expect(fs.readFileSync(f.target, "utf8")).toBe("operator startup record");
    fs.unlinkSync(f.target);
    fs.writeFileSync(`${f.legacy}.kitsune-router-backup`, "operator backup");
    expect(f.migrate().warnings.join(" ")).toMatch(/backup already exists/);
    expect(fs.readFileSync(`${f.legacy}.kitsune-router-backup`, "utf8")).toBe("operator backup");
    expect(fs.readFileSync(f.legacy, "utf8")).toBe(desktop());
  });

  it("only migrates the state installation selected by the data migration", () => {
    const f = fixture();
    const other = path.join(f.directory, "9router.desktop");
    fs.writeFileSync(f.legacy, desktop());
    fs.writeFileSync(other, desktop({ name: "9Router", exec: "/synthetic/node /synthetic/node_modules/9router/cli.js --tray --skip-update" }));
    expect(f.migrate().migrated).toBe(true);
    expect(fs.existsSync(other)).toBe(true);
  });

  it("migrates only the known direct-runtime Windows VBS form and preserves its backup", () => {
    const f = fixture("win32");
    const original = 'Set WshShell = CreateObject("WScript.Shell")\r\nWshShell.Run """C:\\synthetic\\node.exe"" ""C:\\synthetic\\node_modules\\zenrouter\\cli.js"" --tray --skip-update", 0, False\r\n';
    fs.writeFileSync(f.legacy, original);
    expect(f.migrate().migrated).toBe(true);
    expect(fs.readFileSync(`${f.legacy}.kitsune-router-backup`, "utf8")).toBe(original);
    expect(fs.readFileSync(f.target, "utf8")).toContain(`""${f.cli}"" --tray --skip-update`);
    expect(f.commands()).toBe(0);
  });

  it("migrates recognized launchd records without loading or unloading an agent and XML-escapes paths", () => {
    const f = fixture("darwin");
    // Use the actual generator once to construct its historical exact format.
    // Stubbed launchctl always throws; only explicit enable is invoked here.
    expect(f.api.enableAutoStart(f.cli)).toBe(true);
    const generated = fs.readFileSync(f.target, "utf8");
    expect(generated).toContain("new &amp; installation");
    const original = generated.replaceAll("com.bykitsune.router.autostart", "com.zenrouter.autostart")
      .replaceAll("/tmp/kitsune-router", "/tmp/zenrouter")
      .replace(f.cli.replaceAll("&", "&amp;"), "/synthetic/node_modules/zenrouter/cli.js");
    fs.writeFileSync(f.legacy, original);
    fs.unlinkSync(f.target);
    const before = f.commands();
    expect(f.migrate().migrated).toBe(true);
    expect(f.commands()).toBe(before);
    expect(fs.readFileSync(`${f.legacy}.kitsune-router-backup`, "utf8")).toBe(original);
    expect(fs.readFileSync(f.target, "utf8")).toBe(generated);
  });

  it.skipIf(process.platform === "win32")("rejects startup symlinks instead of following or removing outside files", () => {
    const f = fixture();
    const external = path.join(f.home, "operator-record");
    fs.writeFileSync(external, desktop());
    fs.symlinkSync(external, f.legacy);
    expect(() => f.migrate()).toThrow(/regular private file/);
    expect(fs.readFileSync(external, "utf8")).toBe(desktop());
    expect(fs.existsSync(f.target)).toBe(false);
  });
});
