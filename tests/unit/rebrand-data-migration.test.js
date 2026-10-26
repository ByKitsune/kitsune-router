import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { resolveDataDirectory, migrateDirectory, migrateLegacyEnvironment } = require("../../cli/hooks/dataDirectory.js");
const secrets = require("../../cli/hooks/runtimeSecrets.js");
const dataDirectorySource = fs.readFileSync(new URL("../../cli/hooks/dataDirectory.js", import.meta.url), "utf8");
const homes = [];
const JWT_SECRET = "synthetic-stable-secret-not-production";

function fixture(name = "zenrouter") {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-migration-"));
  homes.push(home);
  const source = path.join(home, `.${name}`);
  fs.mkdirSync(path.join(source, "db"), { recursive: true });
  const db = new DatabaseSync(path.join(source, "db", "data.sqlite"));
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT); INSERT INTO settings VALUES ('theme', 'dark')");
  db.close();
  fs.mkdirSync(path.join(source, "auth"));
  fs.writeFileSync(path.join(source, "auth", "mitm-password.key"), "synthetic-encryption-key");
  fs.writeFileSync(path.join(source, "secrets.json"), JSON.stringify({ JWT_SECRET, API_KEY_SECRET: "synthetic-api-key-secret-not-production", MACHINE_ID_SALT: "synthetic-stable-machine-salt-not-production" }));
  fs.writeFileSync(path.join(source, "machine-id"), "synthetic-stable-machine");
  return { home, source, target: path.join(home, ".kitsune-router"), resolve: (env = {}) => resolveDataDirectory({ home, env, platform: "linux" }) };
}

afterEach(() => { vi.restoreAllMocks(); for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true }); });

// Permission faults, cross-platform ownership checks and race windows are
// injected without loading production HOME, env, machine IDs or OS commands.
function loadResolver(f, { filesystem = {}, platform = process.platform, versions = process.versions, sqlite, execute = () => { throw new Error("Unexpected OS command in migration test"); } } = {}) {
  const fixtureModule = { exports: {} };
  vm.runInNewContext(dataDirectorySource, {
    module: fixtureModule, exports: fixtureModule.exports, Buffer,
    process: { env: {}, platform, versions, pid: process.pid, getuid: process.getuid?.bind(process), kill: process.kill.bind(process) },
    require(name) {
      if (name === "node:fs") return { ...fs, ...filesystem };
      if (name === "node:os") return { homedir: () => f.home };
      if (name === "node:module") return { createRequire: () => name => {
        if (name === "bun:sqlite") return sqlite;
        throw new Error(`Unexpected runtime migration dependency: ${name}`);
      } };
      if (name === "node:child_process") return { execFileSync: execute };
      if (name === "bun:sqlite") return sqlite;
      if (["node:path", "node:crypto", "node:sqlite"].includes(name)) return require(name);
      throw new Error(`Unexpected migration dependency: ${name}`);
    },
  });
  return fixtureModule.exports;
}

describe("Kitsune Router state migration", () => {
  it("migrates SQLite and security material without changing or deleting the original", () => {
    const f = fixture();
    for (const [file, content] of Object.entries({
      "auth/cli-secret": "synthetic-stable-cli-secret", "mitm/rootCA.key": "synthetic-ca-private-key", "mitm/rootCA.crt": "synthetic-ca-certificate",
      "mitm/aliases.json": '{"copilot":{"old":"new"}}', "db/backups/data.sqlite.backup": "synthetic-backup-image", "db/backups/archived.sqlite-wal": "synthetic-archived-backup-sidecar", "tunnel/config.json": '{"token":"synthetic-tunnel-token"}',
    })) {
      fs.mkdirSync(path.dirname(path.join(f.source, file)), { recursive: true });
      fs.writeFileSync(path.join(f.source, file), content);
    }
    const original = fs.readFileSync(path.join(f.source, "db", "data.sqlite"));
    expect(f.resolve()).toBe(f.target);
    const migrated = new DatabaseSync(path.join(f.target, "db", "data.sqlite"), { readOnly: true });
    expect(migrated.prepare("SELECT value FROM settings WHERE key = 'theme'").get().value).toBe("dark");
    migrated.close();
    for (const name of ["secrets.json", "machine-id", "auth/mitm-password.key", "auth/cli-secret", "mitm/rootCA.key", "mitm/rootCA.crt", "mitm/aliases.json", "db/backups/data.sqlite.backup", "db/backups/archived.sqlite-wal", "tunnel/config.json"]) {
      expect(fs.readFileSync(path.join(f.target, name))).toEqual(fs.readFileSync(path.join(f.source, name)));
    }
    expect(fs.readFileSync(path.join(f.source, "db", "data.sqlite"))).toEqual(original);
    expect(JSON.parse(fs.readFileSync(path.join(f.target, ".migration.json"))).originalRetained).toBe(true);
    if (process.platform !== "win32") expect(fs.statSync(path.join(f.target, "secrets.json")).mode & 0o777).toBe(0o600);
    expect(f.resolve()).toBe(f.target);
  });

  it("preserves an explicit DATA_DIR and supports an explicit fresh start", () => {
    const f = fixture();
    const explicit = path.join(f.home, "operator-state");
    expect(f.resolve({ DATA_DIR: explicit })).toBe(explicit);
    expect(fs.existsSync(f.target)).toBe(false);
    expect(f.resolve({ KITSUNE_ROUTER_MIGRATION: "skip" })).toBe(f.target);
    expect(fs.existsSync(f.target)).toBe(false);
  });

  it("never overwrites a new installation", () => {
    const f = fixture();
    fs.mkdirSync(f.target);
    fs.writeFileSync(path.join(f.target, "db.json"), '{"settings":{"theme":"new-theme"}}');
    fs.writeFileSync(path.join(f.target, "secrets.json"), "new-installation");
    expect(f.resolve()).toBe(f.target);
    expect(fs.readFileSync(path.join(f.target, "secrets.json"), "utf8")).toBe("new-installation");
    expect(fs.existsSync(path.join(f.target, "db"))).toBe(false);
  });

  it("requires selection when two legacy installations exist", () => {
    const f = fixture();
    fs.mkdirSync(path.join(f.home, ".9router"));
    fs.writeFileSync(path.join(f.home, ".9router", "db.json"), "{}");
    expect(() => f.resolve()).toThrow(/Multiple legacy/);
    expect(f.resolve({ KITSUNE_ROUTER_MIGRATE_FROM: f.source })).toBe(f.target);
  });

  it.skipIf(process.platform !== "linux")("rejects live databases, symlinks and concurrent migration locks", () => {
    const f = fixture();
    const open = new DatabaseSync(path.join(f.source, "db", "data.sqlite"));
    try { expect(() => f.resolve()).toThrow(/open in another process/); } finally { open.close(); }
    const external = path.join(f.home, "external-secret");
    fs.writeFileSync(external, "not-for-migration");
    fs.symlinkSync(external, path.join(f.source, "unsafe"));
    expect(() => f.resolve()).toThrow(/symbolic link/);
    fs.unlinkSync(path.join(f.source, "unsafe"));
    fs.writeFileSync(path.join(f.source, ".kitsune-router-migration.lock"), "operator-review-required");
    expect(() => f.resolve()).toThrow();
    expect(fs.existsSync(f.target)).toBe(false);
    expect(fs.readFileSync(external, "utf8")).toBe("not-for-migration");
    expect(fs.existsSync(`${f.target}.migration.lock`)).toBe(false);
  });

  it("rejects corruption without creating an empty replacement database", () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.source, "db", "data.sqlite"), "not-a-database");
    expect(() => f.resolve()).toThrow();
    expect(fs.existsSync(f.target)).toBe(false);
    expect(fs.readFileSync(path.join(f.source, "db", "data.sqlite"), "utf8")).toBe("not-a-database");
    expect(fs.readdirSync(f.home)).toEqual([".zenrouter"]);
  });

  it("imports legacy JSON state and skips regenerable runtime dependencies", () => {
    const f = fixture("9router");
    fs.rmSync(path.join(f.source, "db"), { recursive: true });
    fs.writeFileSync(path.join(f.source, "db.json"), JSON.stringify({ settings: { theme: "dark" } }));
    fs.mkdirSync(path.join(f.source, "runtime"));
    fs.writeFileSync(path.join(f.source, "runtime", "generated"), "not-portable");
    f.resolve();
    expect(JSON.parse(fs.readFileSync(path.join(f.target, "db.json"))).settings.theme).toBe("dark");
    expect(fs.existsSync(path.join(f.target, "runtime"))).toBe(false);
  });

  it.skipIf(process.platform === "win32")("keeps portable helpers executable while stripping group/world permissions", () => {
    const f = fixture();
    const executable = path.join(f.source, "bin", "cloudflared");
    fs.mkdirSync(path.dirname(executable));
    fs.writeFileSync(executable, "synthetic helper; never executed");
    fs.chmodSync(executable, 0o755);
    f.resolve();
    expect(fs.statSync(path.join(f.target, "bin", "cloudflared")).mode & 0o777).toBe(0o700);
    expect(fs.statSync(executable).mode & 0o777).toBe(0o755);
  });

  it("refuses a precreated empty or secrets-only target instead of hiding legacy accounts", () => {
    const f = fixture();
    fs.mkdirSync(f.target);
    expect(() => f.resolve()).toThrow(/empty replacement/);
    fs.writeFileSync(path.join(f.target, "secrets.json"), JSON.stringify({ JWT_SECRET }));
    expect(() => f.resolve()).toThrow(/empty replacement/);
    expect(f.resolve({ KITSUNE_ROUTER_MIGRATION: "skip" })).toBe(f.target);
    expect(f.resolve({ DATA_DIR: f.target })).toBe(f.target);
    expect(fs.existsSync(path.join(f.target, "db"))).toBe(false);
  });

  it.each([
    ["empty", {}],
    ["secrets-only", { "secrets.json": '{"JWT_SECRET":"synthetic-target-secret-never-replace"}' }],
    ["unknown", { "operator-settings": "retain-unknown-target-state" }],
    ["installer and secrets", { "node/bin/node": "synthetic-runtime-never-executed", "secrets.json": '{"JWT_SECRET":"synthetic-target-secret-never-replace"}' }],
    ["installer and unknown", { "node/bin/node": "synthetic-runtime-never-executed", "operator-settings": "retain-unknown-target-state" }],
    ["existing database", { "db.json": '{"settings":{"theme":"retain-new-theme"}}' }],
  ])("never ignores a selected custom source beside an existing %s target", (_kind, files) => {
    const f = fixture("custom-legacy");
    expect(fs.existsSync(path.join(f.home, ".zenrouter"))).toBe(false);
    expect(fs.existsSync(path.join(f.home, ".9router"))).toBe(false);
    const originals = ["db/data.sqlite", "secrets.json", "machine-id", "auth/mitm-password.key"]
      .map(file => [file, fs.readFileSync(path.join(f.source, file))]);
    fs.mkdirSync(f.target);
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(f.target, file)), { recursive: true });
      fs.writeFileSync(path.join(f.target, file), content);
    }
    const entries = fs.readdirSync(f.home).sort();
    const targetEntries = fs.readdirSync(f.target).sort();
    const inodes = Object.keys(files).map(file => fs.statSync(path.join(f.target, file)).ino);

    expect(() => f.resolve({ KITSUNE_ROUTER_MIGRATE_FROM: f.source })).toThrow(/Selected legacy installation conflicts/);

    originals.forEach(([file, bytes]) => expect(fs.readFileSync(path.join(f.source, file))).toEqual(bytes));
    Object.entries(files).forEach(([file, content], index) => {
      expect(fs.readFileSync(path.join(f.target, file), "utf8")).toBe(content);
      expect(fs.statSync(path.join(f.target, file)).ino).toBe(inodes[index]);
    });
    expect(fs.existsSync(path.join(f.target, "db"))).toBe(false);
    expect(fs.existsSync(path.join(f.target, ".migration.json"))).toBe(false);
    expect(fs.existsSync(path.join(f.source, ".kitsune-router-migration.lock"))).toBe(false);
    expect(fs.readdirSync(f.target).sort()).toEqual(targetEntries);
    expect(fs.readdirSync(f.home).sort()).toEqual(entries);
  });

  it("keeps DATA_DIR and explicit skip authoritative over a custom migration source", () => {
    const f = fixture("custom-legacy");
    fs.mkdirSync(f.target);
    const file = path.join(f.target, "secrets.json");
    const original = '{"JWT_SECRET":"synthetic-target-secret-never-replace"}';
    fs.writeFileSync(file, original);
    const controls = { KITSUNE_ROUTER_MIGRATE_FROM: f.source };
    expect(f.resolve({ ...controls, KITSUNE_ROUTER_MIGRATION: "skip" })).toBe(f.target);
    expect(f.resolve({ ...controls, DATA_DIR: f.target })).toBe(f.target);
    expect(f.resolve({ ...controls, DATA_DIR: f.source })).toBe(f.source);
    expect(fs.readFileSync(file, "utf8")).toBe(original);
    expect(fs.existsSync(path.join(f.target, "db"))).toBe(false);
    expect(fs.existsSync(path.join(f.target, ".migration.json"))).toBe(false);
  });

  it.each([true, false])("reopens a matching completed custom-source migration without rerunning it (database=%s)", database => {
    const f = fixture("custom-legacy");
    if (!database) fs.rmSync(path.join(f.source, "db"), { recursive: true });
    const controls = { KITSUNE_ROUTER_MIGRATE_FROM: f.source };
    expect(f.resolve(controls)).toBe(f.target);
    const manifest = fs.readFileSync(path.join(f.target, ".migration.json"));
    const file = path.join(f.target, "secrets.json");
    const updated = '{"JWT_SECRET":"synthetic-post-migration-secret-retained"}';
    fs.writeFileSync(file, updated);
    expect(f.resolve({ KITSUNE_ROUTER_MIGRATE_FROM: path.join(f.source, ".") })).toBe(f.target);
    // A lingering selection is harmless after the original is moved to backup.
    fs.renameSync(f.source, path.join(f.home, "retained-original-backup"));
    expect(f.resolve(controls)).toBe(f.target);
    expect(fs.readFileSync(file, "utf8")).toBe(updated);
    expect(fs.readFileSync(path.join(f.target, ".migration.json"))).toEqual(manifest);
    expect(fs.existsSync(path.join(f.target, "db", "data.sqlite"))).toBe(database);
  });

  it("refuses a different explicit source after migration without replacing the completed target", () => {
    const f = fixture("custom-legacy");
    expect(f.resolve({ KITSUNE_ROUTER_MIGRATE_FROM: f.source })).toBe(f.target);
    const originals = ["db/data.sqlite", "secrets.json", ".migration.json"]
      .map(file => [file, fs.readFileSync(path.join(f.target, file))]);
    const other = path.join(f.home, "other-legacy");
    fs.mkdirSync(other);
    fs.writeFileSync(path.join(other, "db.json"), '{"settings":{"theme":"other-legacy"}}');
    expect(() => f.resolve({ KITSUNE_ROUTER_MIGRATE_FROM: other })).toThrow(/Selected legacy installation conflicts/);
    originals.forEach(([file, bytes]) => expect(fs.readFileSync(path.join(f.target, file))).toEqual(bytes));
    expect(f.resolve({ KITSUNE_ROUTER_MIGRATE_FROM: other, KITSUNE_ROUTER_MIGRATION: "skip" })).toBe(f.target);
    expect(f.resolve({ KITSUNE_ROUTER_MIGRATE_FROM: other, DATA_DIR: f.target })).toBe(f.target);
    expect(fs.readFileSync(path.join(other, "db.json"), "utf8")).toBe('{"settings":{"theme":"other-legacy"}}');
  });

  it("honors a custom source beside installer-only artifacts instead of starting empty", () => {
    const f = fixture("custom-legacy");
    const helper = path.join(f.target, "node", "bin", "node");
    fs.mkdirSync(path.dirname(helper), { recursive: true });
    fs.writeFileSync(helper, "synthetic-managed-runtime-never-executed");
    const inode = fs.statSync(helper).ino;
    const original = fs.readFileSync(path.join(f.source, "db", "data.sqlite"));
    const controls = { KITSUNE_ROUTER_MIGRATE_FROM: f.source };
    expect(f.resolve(controls)).toBe(f.target);
    expect(f.resolve(controls)).toBe(f.target);
    expect(fs.readFileSync(helper, "utf8")).toBe("synthetic-managed-runtime-never-executed");
    expect(fs.statSync(helper).ino).toBe(inode);
    expect(fs.existsSync(path.join(f.target, "db", "data.sqlite"))).toBe(true);
    expect(fs.readFileSync(path.join(f.target, "secrets.json"))).toEqual(fs.readFileSync(path.join(f.source, "secrets.json")));
    expect(fs.readFileSync(path.join(f.source, "db", "data.sqlite"))).toEqual(original);
  });

  it("can reopen a verified settings/key-only migration before the first database is created", () => {
    const f = fixture();
    fs.rmSync(path.join(f.source, "db"), { recursive: true });
    expect(f.resolve()).toBe(f.target);
    expect(f.resolve()).toBe(f.target);
    expect(secrets.ensureRuntimeSecrets({ DATA_DIR: f.target }).JWT_SECRET).toBe(JWT_SECRET);
    expect(fs.existsSync(path.join(f.target, "db"))).toBe(false);
  });

  it("migrates beside official installer artifacts without replacing managed Node or source app files", () => {
    const f = fixture();
    const artifacts = { "node/bin/node": "synthetic-managed-node-never-executed", "app/cli/cli.js": "synthetic-source-launcher-never-executed", "runtime/node_modules/fixture/package.json": '{"name":"synthetic-dependency"}' };
    for (const [file, contents] of Object.entries(artifacts)) {
      fs.mkdirSync(path.dirname(path.join(f.target, file)), { recursive: true });
      fs.writeFileSync(path.join(f.target, file), contents);
    }
    const originalInodes = Object.keys(artifacts).map(file => fs.statSync(path.join(f.target, file)).ino);
    expect(f.resolve()).toBe(f.target);
    expect(f.resolve()).toBe(f.target);
    Object.entries(artifacts).forEach(([file, contents], index) => {
      expect(fs.readFileSync(path.join(f.target, file), "utf8")).toBe(contents);
      expect(fs.statSync(path.join(f.target, file)).ino).toBe(originalInodes[index]);
    });
    expect(fs.readFileSync(path.join(f.target, "secrets.json"))).toEqual(fs.readFileSync(path.join(f.source, "secrets.json")));
    const db = new DatabaseSync(path.join(f.target, "db", "data.sqlite"), { readOnly: true });
    try { expect(db.prepare("SELECT value FROM settings WHERE key='theme'").get().value).toBe("dark"); }
    finally { db.close(); }
  });

  it("does not apply the installer exception to mixed state or to a root-level file named like a transient directory", () => {
    const f = fixture();
    fs.mkdirSync(path.join(f.target, "node"), { recursive: true });
    const persistent = path.join(f.target, "operator-settings");
    fs.writeFileSync(persistent, "retain-user-settings");
    expect(() => f.resolve()).toThrow(/empty replacement/);
    expect(fs.readFileSync(persistent, "utf8")).toBe("retain-user-settings");
    fs.unlinkSync(persistent);
    fs.rmdirSync(path.join(f.target, "node"));
    fs.writeFileSync(path.join(f.target, "node"), "not-installer-directory");
    expect(() => f.resolve()).toThrow(/non-directory/);
    expect(fs.readFileSync(path.join(f.target, "node"), "utf8")).toBe("not-installer-directory");
  });

  it("rechecks an installer-only target under lock and refuses a concurrently created setting", () => {
    const f = fixture();
    fs.mkdirSync(path.join(f.target, "node"), { recursive: true });
    fs.writeFileSync(path.join(f.target, "node", "managed"), "keep-runtime");
    let injected = false;
    const resolver = loadResolver(f, { filesystem: { openSync(file, flags, mode) {
      const fd = fs.openSync(file, flags, mode);
      if (!injected && file === `${f.target}.migration.lock`) {
        injected = true;
        fs.writeFileSync(path.join(f.target, "secrets.json"), "synthetic-concurrent-user-setting");
      }
      return fd;
    } } });
    expect(() => resolver.resolveDataDirectory({ home: f.home, env: {} })).toThrow(/changed concurrently/);
    expect(fs.readFileSync(path.join(f.target, "node", "managed"), "utf8")).toBe("keep-runtime");
    expect(fs.readFileSync(path.join(f.target, "secrets.json"), "utf8")).toBe("synthetic-concurrent-user-setting");
    expect(fs.existsSync(path.join(f.target, "db"))).toBe(false);
  });

  it.each(["db/data.sqlite.sqljs-owner", "db/.sqljs-owner", ".runtime-secrets.lock"])("refuses unresolved ownership marker %s", (name) => {
    const f = fixture();
    fs.mkdirSync(path.join(f.source, name));
    expect(() => f.resolve()).toThrow(/ownership marker|setup is locked/);
    expect(fs.existsSync(f.target)).toBe(false);
  });

  it.each(["", "not SQLite"])("refuses a missing SQLite header (%s) without generating keys", (content) => {
    const f = fixture();
    fs.writeFileSync(path.join(f.source, "db", "data.sqlite"), content);
    expect(() => f.resolve()).toThrow(/empty|header/);
    expect(fs.existsSync(f.target)).toBe(false);
    expect(fs.readFileSync(path.join(f.source, "secrets.json"), "utf8")).toContain(JWT_SECRET);
  });

  it.each(["db.json", "usage.json", "secrets.json"])("rejects invalid legacy %s before publishing state", file => {
    const f = fixture();
    fs.writeFileSync(path.join(f.source, file), "{not valid JSON");
    expect(() => f.resolve()).toThrow(/unreadable or invalid/);
    expect(fs.existsSync(f.target)).toBe(false);
  });

  it("refuses stale JSON when a previously imported SQLite database is missing", () => {
    const f = fixture();
    fs.unlinkSync(path.join(f.source, "db", "data.sqlite"));
    fs.writeFileSync(path.join(f.source, "db.json"), '{"settings":{"theme":"stale"}}');
    fs.writeFileSync(path.join(f.source, "db", ".migrated-from-json"), "synthetic-import-marker");
    expect(() => f.resolve()).toThrow(/SQLite database is missing/);
    expect(fs.existsSync(f.target)).toBe(false);
  });

  it("refuses dangling or hard-linked state and nested destinations", () => {
    const f = fixture();
    expect(() => migrateDirectory(f.source, path.join(f.source, "nested"))).toThrow(/inside the legacy/);
    const linked = path.join(f.source, "linked-secret");
    fs.linkSync(path.join(f.source, "secrets.json"), linked);
    expect(() => f.resolve()).toThrow(/hard-linked/);
    fs.unlinkSync(linked);
    fs.symlinkSync(path.join(f.home, "missing"), linked);
    expect(() => f.resolve()).toThrow(/symbolic link/);
    expect(fs.existsSync(f.target)).toBe(false);
  });

  it("never replaces an empty target created in the publication race window", () => {
    const f = fixture();
    const resolver = loadResolver(f, { filesystem: { mkdirSync(directory, options) {
      if (directory === f.target) {
        fs.mkdirSync(directory);
        fs.writeFileSync(path.join(directory, "operator-file"), "keep-concurrent-target");
      }
      return fs.mkdirSync(directory, options);
    } } });
    expect(() => resolver.resolveDataDirectory({ home: f.home, env: {} })).toThrow();
    expect(fs.readdirSync(f.target)).toEqual(["operator-file"]);
    expect(fs.readFileSync(path.join(f.target, "operator-file"), "utf8")).toBe("keep-concurrent-target");
    expect(fs.existsSync(path.join(f.source, ".kitsune-router-migration.lock"))).toBe(false);
  });

  it("marks failed destination publication so future startup cannot use a partial installation", () => {
    const f = fixture();
    const resolver = loadResolver(f, { filesystem: { copyFileSync(source, destination, flags) {
      if (destination.startsWith(`${f.target}${path.sep}`)) throw Object.assign(new Error("Synthetic disk full"), { code: "ENOSPC" });
      return fs.copyFileSync(source, destination, flags);
    } } });
    expect(() => resolver.resolveDataDirectory({ home: f.home, env: {} })).toThrow(/disk full/);
    expect(() => f.resolve()).toThrow(/incomplete/);
    expect(() => f.resolve({ DATA_DIR: f.target })).toThrow(/incomplete/);
    expect(fs.existsSync(path.join(f.source, "db", "data.sqlite"))).toBe(true);
    expect(fs.existsSync(`${f.target}.migration.lock`)).toBe(false);
  });

  it("detects a setting that changes after inventory instead of migrating mixed generations", () => {
    const f = fixture();
    let changed = false;
    const resolver = loadResolver(f, { filesystem: { openSync(file, flags, mode) {
      const fd = fs.openSync(file, flags, mode);
      if (!changed && String(file).includes(".migration-") && String(file).endsWith("secrets.json")) {
        changed = true;
        fs.writeFileSync(path.join(f.source, "secrets.json"), JSON.stringify({ JWT_SECRET: "synthetic-concurrent-changed-secret" }));
      }
      return fd;
    } } });
    expect(() => resolver.resolveDataDirectory({ home: f.home, env: {} })).toThrow(/changed/);
    expect(fs.existsSync(f.target)).toBe(false);
    expect(fs.readdirSync(f.home)).toEqual([".zenrouter"]);
  });

  it.skipIf(process.platform === "win32")("recovers committed WAL pages using only a scratch copy and leaves original WAL/SHM bytes intact", () => {
    const f = fixture();
    const database = path.join(f.source, "db", "data.sqlite");
    // Exit without close to leave a crash-recovery WAL with committed rows.
    const code = `const { DatabaseSync }=require('node:sqlite'); const db=new DatabaseSync(process.argv[1]); db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; INSERT INTO settings VALUES ('wal-setting','committed')"); process.exit(0);`;
    const child = spawnSync(process.execPath, ["-e", code, database], { encoding: "utf8", timeout: 5000, env: { HOME: f.home, DATA_DIR: f.source, PATH: process.env.PATH || "" } });
    expect(child.status, child.stderr).toBe(0);
    const files = [database, `${database}-wal`, `${database}-shm`].filter(file => fs.existsSync(file));
    expect(files).toContain(`${database}-wal`);
    const originals = files.map(file => fs.readFileSync(file));
    f.resolve();
    const migrated = new DatabaseSync(path.join(f.target, "db", "data.sqlite"), { readOnly: true });
    try { expect(migrated.prepare("SELECT value FROM settings WHERE key='wal-setting'").get().value).toBe("committed"); }
    finally { migrated.close(); }
    files.forEach((file, index) => expect(fs.readFileSync(file)).toEqual(originals[index]));
  });

  it("fails closed on uninspectable Windows ownership and WAL recovery without using shell paths", () => {
    const f = fixture();
    const resolver = loadResolver(f, { platform: "win32", execute(command, args) {
      expect(command).toBe("powershell.exe");
      expect(args.at(-2)).toBe("-EncodedCommand");
      throw new Error("Synthetic sharing violation");
    } });
    expect(() => resolver.migrateDirectory(f.source, f.target)).toThrow(/exclusive legacy database ownership/);
    fs.writeFileSync(path.join(f.source, "db", "data.sqlite-wal"), "synthetic-wal");
    expect(() => resolver.migrateDirectory(f.source, f.target)).toThrow(/Legacy WAL/);
    expect(fs.existsSync(f.target)).toBe(false);
  });

  it("fails closed when macOS cannot inspect open SQLite handles", () => {
    const f = fixture();
    const resolver = loadResolver(f, { platform: "darwin", execute() { throw Object.assign(new Error("lsof unavailable"), { code: "ENOENT" }); } });
    expect(() => resolver.migrateDirectory(f.source, f.target)).toThrow(/exclusive legacy database ownership/);
    expect(fs.existsSync(f.target)).toBe(false);
  });

  it("uses the Bun SQLite read-only constructor without a Node-only dependency", () => {
    const f = fixture();
    const options = [];
    const resolver = loadResolver(f, { versions: { ...process.versions, bun: "synthetic" }, sqlite: { Database: class {
      constructor(file, config) { options.push(config); return new DatabaseSync(file, { readOnly: config.readonly }); }
    } } });
    expect(resolver.migrateDirectory(f.source, f.target)).toBe(f.target);
    expect(options).toEqual([{ readonly: true, create: false }, { readonly: true, create: false }]);
  });

  it("keeps DATA_DIR authoritative on Windows including rooted POSIX-looking paths", () => {
    const f = fixture();
    const result = resolveDataDirectory({ env: { DATA_DIR: "/operator-state" }, home: "C:\\Users\\synthetic", platform: "win32" });
    expect(result).toBe(path.win32.resolve("/operator-state"));
    expect(fs.existsSync(f.target)).toBe(false);
    expect(resolveDataDirectory({ env: { APPDATA: "C:\\Synthetic\\AppData", KITSUNE_ROUTER_MIGRATION: "skip" }, home: "C:\\Synthetic", platform: "win32" })).toBe("C:\\Synthetic\\AppData\\kitsune-router");
  });

  it("maps legacy environment overrides once without overriding canonical or control values", () => {
    const env = { ZENROUTER_REQUEST_TIMING: "1", ZENROUTER_MAX_OLD_SPACE_SIZE: "384", ZENROUTER_DISABLE_MITM: "1", KITSUNE_ROUTER_DISABLE_MITM: "", NINEROUTER_SQLJS_SINGLE_PROCESS: "true", ZENROUTER_MIGRATION: "skip", ZENROUTER_PEER_TOKEN: "synthetic-untrusted-legacy-proof", NINEROUTER_MANAGED_SHUTDOWN: "1", NINE_ROUTER_PROXY_MANAGED: "1" };
    expect(migrateLegacyEnvironment(env)).toMatchObject({ KITSUNE_ROUTER_REQUEST_TIMING: "1", KITSUNE_ROUTER_MAX_OLD_SPACE_SIZE: "384", KITSUNE_ROUTER_DISABLE_MITM: "", KITSUNE_ROUTER_SQLJS_SINGLE_PROCESS: "true" });
    expect(env.KITSUNE_ROUTER_MIGRATION).toBeUndefined();
    expect(env.KITSUNE_ROUTER_PEER_TOKEN).toBeUndefined();
    expect(env.KITSUNE_ROUTER_MANAGED_SHUTDOWN).toBeUndefined();
    expect(env.KITSUNE_ROUTER_PROXY_MANAGED).toBeUndefined();
    expect(env.ZENROUTER_REQUEST_TIMING).toBe("1");
  });

  it("loads migrated data-directory env settings before generating secrets, without rewriting the source env or DATA_DIR", () => {
    const f = fixture();
    const content = `JWT_SECRET="${JWT_SECRET}"\nZENROUTER_MAX_OLD_SPACE_SIZE=384\nZENROUTER_REQUEST_TIMING=1\nDATA_DIR=/do-not-follow\n`;
    fs.writeFileSync(path.join(f.source, ".env"), content);
    const env = { KITSUNE_ROUTER_REQUEST_TIMING: "0" };
    expect(f.resolve(env)).toBe(f.target);
    expect(env).toMatchObject({ JWT_SECRET, KITSUNE_ROUTER_MAX_OLD_SPACE_SIZE: "384", KITSUNE_ROUTER_REQUEST_TIMING: "0" });
    expect(env.DATA_DIR).toBeUndefined();
    expect(fs.readFileSync(path.join(f.source, ".env"), "utf8")).toBe(content);
    expect(fs.readFileSync(path.join(f.target, ".env"), "utf8")).toBe(content);
    expect(secrets.ensureRuntimeSecrets({ ...env, DATA_DIR: f.target }).JWT_SECRET).toBe(JWT_SECRET);
  });

  it("preserves corrupt runtime secrets and never replaces an unavailable explicit directory with default state", () => {
    const f = fixture();
    f.resolve();
    const file = path.join(f.target, "secrets.json");
    fs.writeFileSync(file, "{not valid JSON");
    expect(() => secrets.ensureRuntimeSecrets({ DATA_DIR: f.target })).toThrow(/refusing to replace keys/);
    expect(fs.readFileSync(file, "utf8")).toBe("{not valid JSON");
    const notDirectory = path.join(f.home, "not-a-directory");
    fs.writeFileSync(notDirectory, "keep");
    expect(() => secrets.ensureRuntimeSecrets({ DATA_DIR: path.join(notDirectory, "child") })).toThrow();
    expect(fs.readFileSync(notDirectory, "utf8")).toBe("keep");
  });

  it("never loads peer or managed lifecycle proofs from a migrated .env, including canonical spellings", () => {
    const f = fixture();
    const content = ["ZENROUTER_PEER_TOKEN=synthetic-old-proof", "NINEROUTER_PEER_TOKEN=synthetic-other-proof", "KITSUNE_ROUTER_PEER_TOKEN=synthetic-file-proof", "ZENROUTER_MANAGED_SHUTDOWN=1", "KITSUNE_ROUTER_MANAGED_SHUTDOWN=1", "KITSUNE_ROUTER_PROXY_MANAGED=1", "ZENROUTER_MAX_OLD_SPACE_SIZE=384"].join("\n");
    fs.writeFileSync(path.join(f.source, ".env"), content);
    const env = {};
    f.resolve(env);
    for (const key of ["ZENROUTER_PEER_TOKEN", "NINEROUTER_PEER_TOKEN", "KITSUNE_ROUTER_PEER_TOKEN", "ZENROUTER_MANAGED_SHUTDOWN", "KITSUNE_ROUTER_MANAGED_SHUTDOWN", "KITSUNE_ROUTER_PROXY_MANAGED"]) expect(env[key]).toBeUndefined();
    expect(env.KITSUNE_ROUTER_MAX_OLD_SPACE_SIZE).toBe("384");
    const bootEnv = { KITSUNE_ROUTER_PEER_TOKEN: "synthetic-fresh-custom-server-proof" };
    f.resolve(bootEnv);
    expect(bootEnv.KITSUNE_ROUTER_PEER_TOKEN).toBe("synthetic-fresh-custom-server-proof");
  });

  it("does not truncate runtime secrets when another setup holds the exclusive lock", () => {
    const f = fixture();
    f.resolve();
    const file = path.join(f.target, "secrets.json");
    const before = fs.readFileSync(file);
    fs.writeFileSync(path.join(f.target, ".runtime-secrets.lock"), "synthetic-other-setup");
    expect(() => secrets.ensureRuntimeSecrets({ DATA_DIR: f.target })).toThrow(/locked/);
    expect(fs.readFileSync(file)).toEqual(before);
    expect(fs.readFileSync(path.join(f.target, ".runtime-secrets.lock"), "utf8")).toBe("synthetic-other-setup");
  });

  it.each(["--help", "--version"])("keeps informational CLI %s free of state/dependency initialization", (flag) => {
    const f = fixture();
    fs.writeFileSync(path.join(f.source, ".kitsune-router-migration.lock"), "synthetic-locked-source");
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../cli/cli.js", import.meta.url)), flag], { encoding: "utf8", timeout: 5000, env: { HOME: f.home, USERPROFILE: f.home, DATA_DIR: f.target, PATH: process.env.PATH || "" } });
    expect(result.status, result.stderr).toBe(0);
    expect(fs.existsSync(f.target)).toBe(false);
    expect(result.stdout).toMatch(flag === "--help" ? /Usage: kitsune-router/ : /^\d+\.\d+\.\d+/);
  });
});
