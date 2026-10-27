import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL("../../src/mitm/manager.js", import.meta.url), "utf8");
const directories = [];
const PASSWORD = "synthetic sudo password 🔒 not an operator credential";
const MACHINE_ID = "synthetic-machine-id";
const LEGACY_SALT = "zenrouter-mitm-pwd";
const KEY_NAME = "mitm-password.key";

function temporaryInstallation() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "reconciliation-mitm-password-"));
  directories.push(directory);
  return directory;
}

// This self-contained loader is also used by the concurrent worker test. All
// crypto and filesystem operations are real except explicit I/O fault cases.
// OS commands, DNS, certificates, service startup and host machine-ID access are
// forbidden. The private save helper is read from the real module's VM scope;
// production exports are not changed just for tests.
function loadManager(actualSource, directory, options = {}) {
  const nativeFs = require("node:fs");
  const nativePath = require("node:path");
  const vm = require("node:vm");
  const fixtureModule = { exports: {} };
  let settings = structuredClone(options.settings || { theme: "keep-theme", mitmEnabled: false });
  const updates = [];
  const logs = [];
  let machineIdCalls = 0;
  const forbidden = () => { throw new Error("External MITM side effect forbidden in password test"); };
  const context = vm.createContext({
    module: fixtureModule,
    exports: fixtureModule.exports,
    Buffer,
    URL,
    __dirname: directory,
    process: {
      env: { HOME: nativePath.join(directory, "home"), DATA_DIR: directory, MITM_SERVER_PATH: nativePath.join(directory, "no-server.js") },
      platform: process.platform,
      cwd: () => directory,
      getuid: process.getuid?.bind(process),
      kill: forbidden,
    },
    require(name) {
      if (name === "fs") return options.filesystem ? { ...nativeFs, ...options.filesystem } : nativeFs;
      if (["path", "crypto"].includes(name)) return require(name);
      if (name === "os") return { homedir: () => nativePath.join(directory, "home"), tmpdir: () => directory };
      if (name === "./paths") return { DATA_DIR: options.resolvedDataDir || directory, MITM_DIR: nativePath.join(directory, "mitm") };
      if (name === "./logger") return { log: value => logs.push(value), err: value => logs.push(value) };
      if (name === "node-machine-id") return { machineIdSync() {
        machineIdCalls++;
        if (options.machineUnavailable) throw new Error("Synthetic machine-ID failure");
        return options.machineId || "synthetic-machine-id";
      } };
      if (name === "child_process") return { exec: forbidden, execSync: forbidden, spawn: forbidden };
      if (name === "net") return { createServer: forbidden };
      if (name === "https") return { request: forbidden };
      if (name === "./dns/dnsConfig") return {
        addDNSEntry: forbidden, removeDNSEntry: forbidden, removeAllDNSEntries: forbidden,
        removeAllDNSEntriesSync: forbidden, checkAllDNSStatus: forbidden,
        TOOL_HOSTS: {}, isSudoAvailable: forbidden, isSudoPasswordRequired: forbidden,
      };
      if (name === "./winElevated.js") return { isAdmin: forbidden };
      if (name === "./cert/generate") return { generateCert: forbidden };
      if (name === "./cert/install") return { installCert: forbidden, uninstallCert: forbidden };
      if (name === "./cert/rootCA") return { isCertExpired: forbidden };
      if (name === "./config") return { LSOF_BIN: "forbidden-test-command" };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  vm.runInContext(actualSource, context, { filename: "src/mitm/manager.js" });
  const manager = fixtureModule.exports;
  manager.initDbHooks(async () => {
    if (options.getError) throw options.getError;
    return structuredClone(settings);
  }, options.readOnly ? null : async patch => {
    if (options.updateError) throw options.updateError;
    updates.push(structuredClone(patch));
    settings = { ...settings, ...patch };
  });
  return {
    manager,
    save: vm.runInContext("saveMitmSettings", context),
    getSettings: () => structuredClone(settings),
    getMachineIdCalls: () => machineIdCalls,
    updates,
    logs,
  };
}

function keyFile(directory) {
  return path.join(directory, "auth", KEY_NAME);
}

function seedKey(directory, key = crypto.randomBytes(32)) {
  fs.mkdirSync(path.join(directory, "auth"), { recursive: true, mode: 0o700 });
  fs.writeFileSync(keyFile(directory), key, { mode: 0o600 });
  return key;
}

// Independent native-crypto fixtures for the historical wire format and for
// imported v2 settings; no production crypto helper is copied or substituted.
function ciphertext(key, version = "") {
  const iv = Buffer.from("000102030405060708090a0b", "hex");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(PASSWORD, "utf8"), cipher.final()]);
  return `${version}${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data.toString("hex")}`;
}

function decryptV2(stored, key) {
  const [version, iv, tag, data] = stored.split(":");
  expect(version).toBe("v2");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(data, "hex")), decipher.final()]).toString("utf8");
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("MITM password installation key", () => {
  it("persists a random 256-bit key and v2 authenticated ciphertext across reloads without consulting machine ID", async () => {
    const directory = temporaryInstallation();
    const fixture = loadManager(source, directory);
    await fixture.save(true, PASSWORD);

    const stored = fixture.getSettings().mitmSudoEncrypted;
    expect(stored).toMatch(/^v2:[a-f0-9]{24}:[a-f0-9]{32}:(?:[a-f0-9]{2})+$/);
    const key = fs.readFileSync(keyFile(directory));
    expect(key).toHaveLength(32);
    expect(key.equals(Buffer.alloc(32))).toBe(false);
    expect(key.equals(crypto.createHash("sha256").update(MACHINE_ID + LEGACY_SALT).digest())).toBe(false);
    expect(decryptV2(stored, key)).toBe(PASSWORD);
    expect(fixture.getMachineIdCalls()).toBe(0);
    expect(fixture.getSettings()).toMatchObject({ mitmEnabled: true, theme: "keep-theme" });

    const reloaded = loadManager(source, directory, { settings: fixture.getSettings(), machineUnavailable: true });
    expect(await reloaded.manager.loadEncryptedPassword()).toBe(PASSWORD);
    expect(reloaded.getMachineIdCalls()).toBe(0);
    await reloaded.save(true, PASSWORD);
    expect(fs.readFileSync(keyFile(directory))).toEqual(key);
    expect(reloaded.getSettings().mitmSudoEncrypted).not.toBe(stored);
    expect(decryptV2(reloaded.getSettings().mitmSudoEncrypted, key)).toBe(PASSWORD);
    expect([...fixture.logs, ...reloaded.logs].join("\n")).not.toContain(PASSWORD);
    expect([...fixture.logs, ...reloaded.logs].join("\n")).not.toContain(key.toString("hex"));
  });

  it.each([false, true])("keeps independent installation keys even when machine-ID failure is %s", async (machineUnavailable) => {
    const firstDir = temporaryInstallation();
    const secondDir = temporaryInstallation();
    const first = loadManager(source, firstDir, { machineUnavailable });
    const second = loadManager(source, secondDir, { machineUnavailable });
    await first.save(true, PASSWORD);
    await second.save(true, PASSWORD);

    const firstKey = fs.readFileSync(keyFile(firstDir));
    const secondKey = fs.readFileSync(keyFile(secondDir));
    expect(firstKey).not.toEqual(secondKey);
    expect(firstKey).not.toEqual(crypto.createHash("sha256").update(LEGACY_SALT).digest());
    expect(() => decryptV2(first.getSettings().mitmSudoEncrypted, secondKey)).toThrow();
    expect(first.getMachineIdCalls()).toBe(0);
    expect(second.getMachineIdCalls()).toBe(0);
  });

  it.skipIf(process.platform === "win32")("hardens an existing auth directory and valid key to owner-only without replacing the key", async () => {
    const directory = temporaryInstallation();
    const key = seedKey(directory);
    fs.chmodSync(path.join(directory, "auth"), 0o755);
    fs.chmodSync(keyFile(directory), 0o644);
    const fixture = loadManager(source, directory);
    await fixture.save(true, PASSWORD);
    expect(fs.statSync(path.join(directory, "auth")).mode & 0o777).toBe(0o700);
    expect(fs.statSync(keyFile(directory)).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(keyFile(directory))).toEqual(key);
    expect(decryptV2(fixture.getSettings().mitmSudoEncrypted, key)).toBe(PASSWORD);
  });

  it.skipIf(process.platform === "win32")("creates the auth directory and key owner-only without relying on the process umask", async () => {
    const directory = temporaryInstallation();
    const fixture = loadManager(source, directory);
    await fixture.save(true, PASSWORD);
    expect(fs.statSync(path.join(directory, "auth")).mode & 0o777).toBe(0o700);
    expect(fs.statSync(keyFile(directory)).mode & 0o777).toBe(0o600);
  });

  it.each([
    { name: "current machine-ID key", legacyKey: crypto.createHash("sha256").update(MACHINE_ID + LEGACY_SALT).digest(), machineUnavailable: false },
    { name: "historical fixed-salt key with working machine ID", legacyKey: crypto.createHash("sha256").update(LEGACY_SALT).digest(), machineUnavailable: false },
    { name: "historical fixed-salt key without machine ID", legacyKey: crypto.createHash("sha256").update(LEGACY_SALT).digest(), machineUnavailable: true },
  ])("reads a real legacy $name without creating a key or rewriting DB settings", async ({ legacyKey, machineUnavailable }) => {
    const directory = temporaryInstallation();
    const stored = ciphertext(legacyKey);
    const fixture = loadManager(source, directory, { settings: { mitmSudoEncrypted: stored, theme: "keep-theme" }, machineUnavailable });
    expect(await fixture.manager.loadEncryptedPassword()).toBe(PASSWORD);
    expect(fixture.getSettings()).toEqual({ mitmSudoEncrypted: stored, theme: "keep-theme" });
    expect(fixture.updates).toEqual([]);
    expect(fs.existsSync(path.join(directory, "auth"))).toBe(false);
  });

  it("upgrades a legacy password only on an explicit successful save while preserving unrelated settings", async () => {
    const directory = temporaryInstallation();
    const legacy = ciphertext(crypto.createHash("sha256").update(MACHINE_ID + LEGACY_SALT).digest());
    const fixture = loadManager(source, directory, { settings: { mitmSudoEncrypted: legacy, theme: "keep-theme", dnsToolEnabled: { fixture: false } } });
    expect(await fixture.manager.loadEncryptedPassword()).toBe(PASSWORD);
    expect(fixture.updates).toHaveLength(0);
    await fixture.save(true, PASSWORD);
    expect(decryptV2(fixture.getSettings().mitmSudoEncrypted, fs.readFileSync(keyFile(directory)))).toBe(PASSWORD);
    expect(fixture.getSettings()).toMatchObject({ theme: "keep-theme", dnsToolEnabled: { fixture: false } });
    expect(fixture.updates).toHaveLength(1);
    expect(Object.keys(fixture.updates[0]).sort()).toEqual(["mitmEnabled", "mitmSudoEncrypted"]);
  });

  it.each(["update hook absent", "update hook rejects"])("does not claim or write a transparent legacy migration when %s", async (failure) => {
    const directory = temporaryInstallation();
    const legacy = ciphertext(crypto.createHash("sha256").update(MACHINE_ID + LEGACY_SALT).digest());
    const fixture = loadManager(source, directory, {
      settings: { mitmSudoEncrypted: legacy, theme: "keep-theme" },
      readOnly: failure === "update hook absent",
      updateError: failure === "update hook rejects" ? new Error("Synthetic persistence failure") : undefined,
    });
    expect(await fixture.manager.loadEncryptedPassword()).toBe(PASSWORD);
    expect(fixture.getSettings().mitmSudoEncrypted).toBe(legacy);
    expect(fixture.updates).toEqual([]);
    expect(fs.existsSync(keyFile(directory))).toBe(false);
    await fixture.save(true, PASSWORD);
    expect(fixture.getSettings().mitmSudoEncrypted).toBe(legacy);
    expect(await fixture.manager.loadEncryptedPassword()).toBe(PASSWORD);
  });

  it("fails closed on v2 key loss without creating a replacement during load or a new password save", async () => {
    const directory = temporaryInstallation();
    const stored = ciphertext(crypto.randomBytes(32), "v2:");
    const fixture = loadManager(source, directory, { settings: { mitmSudoEncrypted: stored, theme: "keep-theme" } });
    expect(await fixture.manager.loadEncryptedPassword()).toBeNull();
    await fixture.save(true, PASSWORD);
    expect(fixture.updates).toEqual([]);
    expect(fixture.getSettings()).toEqual({ mitmSudoEncrypted: stored, theme: "keep-theme" });
    expect(fs.existsSync(keyFile(directory))).toBe(false);
    expect(fixture.getMachineIdCalls()).toBe(0);
  });

  it("allows non-password settings updates and explicit password clearing without a lost key, then safely initializes a new key", async () => {
    const directory = temporaryInstallation();
    const stored = ciphertext(crypto.randomBytes(32), "v2:");
    const fixture = loadManager(source, directory, { settings: { mitmSudoEncrypted: stored, mitmEnabled: true, theme: "keep-theme" } });
    await fixture.save(false, null);
    expect(fixture.getSettings()).toEqual({ mitmSudoEncrypted: stored, mitmEnabled: false, theme: "keep-theme" });
    expect(fs.existsSync(keyFile(directory))).toBe(false);
    await fixture.manager.clearEncryptedPassword();
    expect(fixture.getSettings().mitmSudoEncrypted).toBeNull();
    await fixture.save(true, PASSWORD);
    const key = fs.readFileSync(keyFile(directory));
    expect(decryptV2(fixture.getSettings().mitmSudoEncrypted, key)).toBe(PASSWORD);
    expect(fixture.getSettings()).toMatchObject({ mitmEnabled: true, theme: "keep-theme" });
  });

  it.each([
    { name: "empty", corrupt: Buffer.alloc(0) },
    { name: "invalid text", corrupt: Buffer.from("corrupt installation key") },
    { name: "31 bytes", corrupt: Buffer.alloc(31) },
    { name: "32 damaged bytes", corrupt: Buffer.alloc(32) },
    { name: "33 bytes", corrupt: Buffer.alloc(33) },
  ])("retains corrupt key bytes ($name) and stored settings without falling back", async ({ corrupt }) => {
    const directory = temporaryInstallation();
    seedKey(directory, corrupt);
    const stored = ciphertext(crypto.randomBytes(32), "v2:");
    const fixture = loadManager(source, directory, { settings: { mitmSudoEncrypted: stored, theme: "keep-theme" } });
    expect(await fixture.manager.loadEncryptedPassword()).toBeNull();
    await fixture.save(true, PASSWORD);
    expect(fixture.updates).toEqual([]);
    expect(fixture.getSettings().mitmSudoEncrypted).toBe(stored);
    expect(fs.readFileSync(keyFile(directory))).toEqual(corrupt);
    expect(fixture.getMachineIdCalls()).toBe(0);
  });

  it("does not cache the installation key across its removal or corruption", async () => {
    const directory = temporaryInstallation();
    const key = seedKey(directory);
    const stored = ciphertext(key, "v2:");
    const fixture = loadManager(source, directory, { settings: { mitmSudoEncrypted: stored } });
    expect(await fixture.manager.loadEncryptedPassword()).toBe(PASSWORD);
    fs.unlinkSync(keyFile(directory));
    expect(await fixture.manager.loadEncryptedPassword()).toBeNull();
    await fixture.save(true, PASSWORD);
    expect(fs.existsSync(keyFile(directory))).toBe(false);
    fs.writeFileSync(keyFile(directory), "bad", { mode: 0o600 });
    expect(await fixture.manager.loadEncryptedPassword()).toBeNull();
    await fixture.save(true, PASSWORD);
    expect(fixture.updates).toEqual([]);
    expect(fs.readFileSync(keyFile(directory), "utf8")).toBe("bad");
  });

  it("detects same-size random key corruption before overwriting an existing v2 password", async () => {
    const directory = temporaryInstallation();
    const key = seedKey(directory);
    const stored = ciphertext(key, "v2:");
    const fixture = loadManager(source, directory, { settings: { mitmSudoEncrypted: stored } });
    expect(await fixture.manager.loadEncryptedPassword()).toBe(PASSWORD);
    const damaged = crypto.randomBytes(32);
    fs.writeFileSync(keyFile(directory), damaged);
    expect(await fixture.manager.loadEncryptedPassword()).toBeNull();
    await fixture.save(true, PASSWORD);
    expect(fixture.updates).toEqual([]);
    expect(fixture.getSettings().mitmSudoEncrypted).toBe(stored);
    expect(fs.readFileSync(keyFile(directory))).toEqual(damaged);
  });

  it.each(["EACCES", "EPERM"])("never replaces an unreadable existing key on %s", async (code) => {
    const directory = temporaryInstallation();
    const key = seedKey(directory);
    const stored = ciphertext(key, "v2:");
    const denied = () => { throw Object.assign(new Error("Synthetic key access denied"), { code }); };
    const fixture = loadManager(source, directory, {
      settings: { mitmSudoEncrypted: stored },
      filesystem: {
        openSync(file, ...args) { return String(file) === keyFile(directory) ? denied() : fs.openSync(file, ...args); },
        readFileSync(file, ...args) { return String(file) === keyFile(directory) ? denied() : fs.readFileSync(file, ...args); },
      },
    });
    expect(await fixture.manager.loadEncryptedPassword()).toBeNull();
    await fixture.save(true, PASSWORD);
    expect(fixture.updates).toEqual([]);
    expect(fs.readFileSync(keyFile(directory))).toEqual(key);
    expect(fixture.getMachineIdCalls()).toBe(0);
  });

  it.skipIf(process.platform === "win32")("fails closed for owner-unreadable key permissions even when the runtime user could bypass mode bits", async () => {
    const directory = temporaryInstallation();
    const key = seedKey(directory);
    fs.chmodSync(keyFile(directory), 0o000);
    const fixture = loadManager(source, directory, { settings: { mitmSudoEncrypted: ciphertext(key, "v2:") } });
    try {
      expect(await fixture.manager.loadEncryptedPassword()).toBeNull();
      await fixture.save(true, PASSWORD);
      expect(fixture.updates).toEqual([]);
      expect(fs.statSync(keyFile(directory)).mode & 0o777).toBe(0);
    } finally {
      fs.chmodSync(keyFile(directory), 0o600);
    }
  });

  it("fails closed if creating the auth directory is denied instead of using machine-ID encryption", async () => {
    const directory = temporaryInstallation();
    const fixture = loadManager(source, directory, { filesystem: {
      mkdirSync(file, ...args) {
        if (String(file) === path.join(directory, "auth")) throw Object.assign(new Error("Synthetic directory access denied"), { code: "EACCES" });
        return fs.mkdirSync(file, ...args);
      },
    } });
    await fixture.save(true, PASSWORD);
    expect(fixture.updates).toEqual([]);
    expect(fs.existsSync(keyFile(directory))).toBe(false);
    expect(fixture.getMachineIdCalls()).toBe(0);
  });

  it("does not follow the legacy paths module's HOME fallback when configured DATA_DIR is inaccessible", async () => {
    const directory = temporaryInstallation();
    const fallback = path.join(directory, "home", ".kitsune-router");
    const fixture = loadManager(source, directory, {
      resolvedDataDir: fallback,
      filesystem: { mkdirSync(file, ...args) {
        if (String(file) === path.join(directory, "auth")) throw Object.assign(new Error("Synthetic configured DATA_DIR denial"), { code: "EACCES" });
        return fs.mkdirSync(file, ...args);
      } },
    });
    await fixture.save(true, PASSWORD);
    expect(fixture.updates).toEqual([]);
    expect(fs.existsSync(keyFile(directory))).toBe(false);
    expect(fs.existsSync(keyFile(fallback))).toBe(false);
  });

  it.each(["corrupt", "unreadable"])("does not replace a pre-existing %s key even before any v2 password was saved", async (kind) => {
    const directory = temporaryInstallation();
    const original = seedKey(directory, kind === "corrupt" ? Buffer.from("bad") : crypto.randomBytes(32));
    const fixture = loadManager(source, directory, { filesystem: kind === "unreadable" ? {
      openSync(file, ...args) {
        if (String(file) === keyFile(directory)) throw Object.assign(new Error("Synthetic read denial"), { code: "EACCES" });
        return fs.openSync(file, ...args);
      },
    } : undefined });
    await fixture.save(true, PASSWORD);
    expect(fixture.updates).toEqual([]);
    expect(fs.readFileSync(keyFile(directory))).toEqual(original);
    expect(fixture.getMachineIdCalls()).toBe(0);
  });

  it.skipIf(process.platform === "win32").each(["directory", "file"])("fails closed if existing %s permissions cannot be hardened", async (kind) => {
    const directory = temporaryInstallation();
    const key = seedKey(directory);
    fs.chmodSync(path.join(directory, "auth"), kind === "directory" ? 0o755 : 0o700);
    fs.chmodSync(keyFile(directory), kind === "file" ? 0o644 : 0o600);
    const denied = () => { throw Object.assign(new Error("Synthetic permission hardening failure"), { code: "EPERM" }); };
    const fixture = loadManager(source, directory, {
      settings: { mitmSudoEncrypted: ciphertext(key, "v2:") },
      filesystem: kind === "directory" ? { chmodSync: denied } : { fchmodSync: denied },
    });
    expect(await fixture.manager.loadEncryptedPassword()).toBeNull();
    await fixture.save(true, PASSWORD);
    expect(fixture.updates).toEqual([]);
    expect(fs.readFileSync(keyFile(directory))).toEqual(key);
  });

  it.skipIf(process.platform === "win32").each(["directory", "file"])("rejects a %s owned by a different account without changing key bytes", async (kind) => {
    const directory = temporaryInstallation();
    const key = seedKey(directory);
    const fixture = loadManager(source, directory, {
      settings: { mitmSudoEncrypted: ciphertext(key, "v2:") },
      filesystem: kind === "directory" ? {
        lstatSync(file, ...args) {
          const stat = fs.lstatSync(file, ...args);
          if (String(file) === path.join(directory, "auth")) stat.uid += 1;
          return stat;
        },
      } : { fstatSync(fd, ...args) { const stat = fs.fstatSync(fd, ...args); stat.uid += 1; return stat; } },
    });
    expect(await fixture.manager.loadEncryptedPassword()).toBeNull();
    await fixture.save(true, PASSWORD);
    expect(fixture.updates).toEqual([]);
    expect(fs.readFileSync(keyFile(directory))).toEqual(key);
  });

  it("does not publish a key or save settings when durable key persistence fails", async () => {
    const directory = temporaryInstallation();
    const fixture = loadManager(source, directory, { filesystem: {
      fsyncSync() { throw Object.assign(new Error("Synthetic storage failure"), { code: "EIO" }); },
    } });
    await fixture.save(true, PASSWORD);
    expect(fixture.updates).toEqual([]);
    expect(fs.existsSync(keyFile(directory))).toBe(false);
    expect(fs.existsSync(path.join(directory, "auth")) ? fs.readdirSync(path.join(directory, "auth")) : []).toEqual([]);
    expect(fixture.getMachineIdCalls()).toBe(0);
  });

  it("does not fall back to a nonexclusive publication method if atomic key publication fails", async () => {
    const directory = temporaryInstallation();
    const fixture = loadManager(source, directory, { filesystem: {
      linkSync() { throw Object.assign(new Error("Synthetic exclusive publication failure"), { code: "EPERM" }); },
    } });
    await fixture.save(true, PASSWORD);
    expect(fixture.updates).toEqual([]);
    expect(fs.existsSync(keyFile(directory))).toBe(false);
    expect(fs.readdirSync(path.join(directory, "auth"))).toEqual([]);
    expect(fixture.getMachineIdCalls()).toBe(0);
  });

  it("uses the existing complete winner on an exclusive-creation race instead of overwriting it", async () => {
    const directory = temporaryInstallation();
    const winner = crypto.randomBytes(32);
    const fixture = loadManager(source, directory, { filesystem: {
      linkSync(temporary, final) {
        fs.writeFileSync(final, winner, { flag: "wx", mode: 0o600 });
        return fs.linkSync(temporary, final);
      },
    } });
    await fixture.save(true, PASSWORD);
    expect(fs.readFileSync(keyFile(directory))).toEqual(winner);
    expect(decryptV2(fixture.getSettings().mitmSudoEncrypted, winner)).toBe(PASSWORD);
    expect(fs.readdirSync(path.join(directory, "auth"))).toEqual([KEY_NAME]);
  });

  it("does not save a new password if existing settings cannot be read", async () => {
    const directory = temporaryInstallation();
    const fixture = loadManager(source, directory, { getError: new Error("Synthetic settings read failure") });
    await fixture.save(true, PASSWORD);
    expect(fixture.updates).toEqual([]);
    expect(fs.existsSync(keyFile(directory))).toBe(false);
  });

  it("does not log passwords or key material contained in a persistence error", async () => {
    const directory = temporaryInstallation();
    const key = seedKey(directory);
    const fixture = loadManager(source, directory, { updateError: new Error(`${PASSWORD} ${key.toString("hex")}`) });
    await fixture.save(true, PASSWORD);
    expect(fixture.updates).toEqual([]);
    expect(fixture.logs.join("\n")).not.toContain(PASSWORD);
    expect(fixture.logs.join("\n")).not.toContain(key.toString("hex"));
  });

  it("preserves the saved ciphertext and does not log credentials when an explicit clear fails", async () => {
    const directory = temporaryInstallation();
    const key = seedKey(directory);
    const stored = ciphertext(key, "v2:");
    const fixture = loadManager(source, directory, {
      settings: { mitmSudoEncrypted: stored },
      updateError: new Error(`${PASSWORD} ${key.toString("hex")}`),
    });
    await fixture.manager.clearEncryptedPassword();
    expect(await fixture.manager.loadEncryptedPassword()).toBe(PASSWORD);
    expect(fixture.getSettings().mitmSudoEncrypted).toBe(stored);
    expect(fixture.logs.join("\n")).not.toContain(PASSWORD);
    expect(fixture.logs.join("\n")).not.toContain(key.toString("hex"));
  });

  it("requires the installation key alongside an imported DB ciphertext and is independent of the destination machine ID", async () => {
    const firstDir = temporaryInstallation();
    const key = seedKey(firstDir);
    const stored = ciphertext(key, "v2:");
    const secondDir = temporaryInstallation();
    const imported = loadManager(source, secondDir, { settings: { mitmSudoEncrypted: stored }, machineId: "different-machine" });
    expect(await imported.manager.loadEncryptedPassword()).toBeNull();
    expect(fs.existsSync(keyFile(secondDir))).toBe(false);
    seedKey(secondDir, fs.readFileSync(keyFile(firstDir)));
    expect(await imported.manager.loadEncryptedPassword()).toBe(PASSWORD);
    expect(imported.getMachineIdCalls()).toBe(0);
    expect(imported.updates).toEqual([]);
  });

  it.skipIf(process.platform === "win32")("rejects a key-file symlink without changing its target or stored settings", async () => {
    const directory = temporaryInstallation();
    const target = path.join(directory, "unrelated-fixture");
    const key = crypto.randomBytes(32);
    fs.writeFileSync(target, key, { mode: 0o600 });
    fs.mkdirSync(path.join(directory, "auth"), { mode: 0o700 });
    fs.symlinkSync(target, keyFile(directory));
    const fixture = loadManager(source, directory, { settings: { mitmSudoEncrypted: ciphertext(key, "v2:") } });
    expect(await fixture.manager.loadEncryptedPassword()).toBeNull();
    await fixture.save(true, PASSWORD);
    expect(fixture.updates).toEqual([]);
    expect(fs.lstatSync(keyFile(directory)).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target)).toEqual(key);
  });

  it.skipIf(process.platform === "win32")("rejects a symlinked auth directory without writing into its target", async () => {
    const directory = temporaryInstallation();
    const target = path.join(directory, "unrelated-fixture");
    fs.mkdirSync(target, { mode: 0o700 });
    fs.symlinkSync(target, path.join(directory, "auth"), "dir");
    const fixture = loadManager(source, directory);
    await fixture.save(true, PASSWORD);
    expect(fixture.updates).toEqual([]);
    expect(fs.readdirSync(target)).toEqual([]);
    expect(fs.lstatSync(path.join(directory, "auth")).isSymbolicLink()).toBe(true);
  });

  it.each(["v3", "tampered v2"])("does not fall back to legacy decryption for %s ciphertext", async (kind) => {
    const directory = temporaryInstallation();
    const key = seedKey(directory);
    const stored = kind === "v3"
      ? ciphertext(key, "v3:")
      : ciphertext(crypto.createHash("sha256").update(LEGACY_SALT).digest(), "v2:");
    const fixture = loadManager(source, directory, { settings: { mitmSudoEncrypted: stored } });
    expect(await fixture.manager.loadEncryptedPassword()).toBeNull();
    expect(fixture.getMachineIdCalls()).toBe(0);
    expect(fixture.updates).toEqual([]);
  });

  it("shares one atomically published key across concurrent independent manager instances", async () => {
    const directory = temporaryInstallation();
    const gate = new SharedArrayBuffer(4);
    const workers = [];
    const ready = [];
    const saved = [];
    for (let index = 0; index < 6; index++) {
      const worker = new Worker(`
        const { parentPort, workerData } = require("node:worker_threads");
        const loadManager = (${loadManager.toString()});
        const fixture = loadManager(workerData.source, workerData.directory, { machineUnavailable: true });
        parentPort.postMessage({ phase: "ready" });
        Atomics.wait(new Int32Array(workerData.gate), 0, 0);
        fixture.save(true, workerData.password).then(() => {
          parentPort.postMessage({ phase: "saved", settings: fixture.getSettings() });
        });
      `, { eval: true, workerData: { source, directory, password: PASSWORD, gate } });
      workers.push(worker);
      ready.push(new Promise((resolve, reject) => {
        worker.on("message", message => { if (message.phase === "ready") resolve(); });
        worker.once("error", reject);
      }));
      saved.push(new Promise((resolve, reject) => {
        worker.on("message", message => { if (message.phase === "saved") resolve(message.settings); });
        worker.once("error", reject);
      }));
    }
    try {
      await Promise.all(ready);
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0);
      const settings = await Promise.all(saved);
      const key = fs.readFileSync(keyFile(directory));
      expect(fs.readdirSync(path.join(directory, "auth"))).toEqual([KEY_NAME]);
      for (const entry of settings) {
        expect(decryptV2(entry.mitmSudoEncrypted, key)).toBe(PASSWORD);
        const reloaded = loadManager(source, directory, { settings: entry, machineId: "different-synthetic-machine" });
        expect(await reloaded.manager.loadEncryptedPassword()).toBe(PASSWORD);
      }
    } finally {
      await Promise.all(workers.map(worker => worker.terminate()));
    }
  }, 15000);
});
