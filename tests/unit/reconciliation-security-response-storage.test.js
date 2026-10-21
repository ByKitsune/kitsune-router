import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let root;
let previousListeners;
let adapters;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(tmpdir(), "reconciliation-security-response-storage-"));
  previousListeners = new Map(shutdownEvents.map(event => [event, process.rawListeners(event)]));
  vi.stubEnv("HOME", path.join(root, "home"));
  vi.stubEnv("DATA_DIR", path.join(root, "data"));
  fs.mkdirSync(process.env.HOME, { mode: 0o700 });
  adapters = [];
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
});

afterEach(() => {
  for (const adapter of adapters) adapter.close();
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
  for (const event of shutdownEvents) {
    for (const listener of process.rawListeners(event)) {
      if (!previousListeners.get(event).includes(listener)) process.removeListener(event, listener);
    }
  }
  vi.unstubAllEnvs();
  vi.resetModules();
  fs.rmSync(root, { recursive: true, force: true });
});

async function sqlJs() {
  const { createSqlJsAdapter } = await import("@/lib/db/adapters/sqljsAdapter.js");
  const file = path.join(root, "state.sqlite");
  const adapter = await createSqlJsAdapter(file);
  adapters.push(adapter);
  return { adapter, file };
}

describe.skipIf(process.platform === "win32")("sql.js private atomic replacement", () => {
  it("creates owner-only replacement files before any bytes are written and keeps them private after rename", async () => {
    const { adapter, file } = await sqlJs();
    const write = fs.writeFileSync;
    const observedModes = [];
    vi.spyOn(fs, "writeFileSync").mockImplementation((target, ...args) => {
      if (typeof target === "number") observedModes.push(fs.fstatSync(target).mode & 0o777);
      return write(target, ...args);
    });
    adapter.exec("CREATE TABLE synthetic_state(value TEXT)");
    adapter.run("INSERT INTO synthetic_state VALUES (?)", ["synthetic-secret-state"]);
    await vi.advanceTimersByTimeAsync(100);
    expect(observedModes).toEqual([0o600]);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    adapter.run("INSERT INTO synthetic_state VALUES (?)", ["synthetic-secret-second"]);
    await vi.advanceTimersByTimeAsync(100);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    const check = new DatabaseSync(file, { readOnly: true });
    try {
      expect(check.prepare("SELECT value FROM synthetic_state").all()).toEqual([
        { value: "synthetic-secret-state" }, { value: "synthetic-secret-second" },
      ]);
    } finally {
      check.close();
    }
  });

  it("refuses a pre-existing temporary symlink without truncating its target or deleting the link", async () => {
    const { adapter, file } = await sqlJs();
    const target = path.join(root, "sentinel");
    fs.writeFileSync(target, "synthetic-sentinel");
    const collision = path.join(root, `.state.sqlite.tmp-${process.pid}-0`);
    fs.symlinkSync(target, collision);
    vi.spyOn(console, "error").mockImplementation(() => {});
    adapter.exec("CREATE TABLE synthetic_state(value TEXT)");
    await vi.advanceTimersByTimeAsync(100);
    expect(fs.readFileSync(target, "utf8") === "synthetic-sentinel").toBe(true);
    expect(fs.lstatSync(collision).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("preserves the prior persisted image if a replacement write fails", async () => {
    const { adapter, file } = await sqlJs();
    adapter.exec("CREATE TABLE synthetic_state(value TEXT)");
    adapter.run("INSERT INTO synthetic_state VALUES (?)", ["synthetic-old-value"]);
    await vi.advanceTimersByTimeAsync(100);
    const before = fs.readFileSync(file);
    const write = fs.writeFileSync;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = vi.spyOn(fs, "writeFileSync").mockImplementation((target, ...args) => {
      if (typeof target === "number") throw Object.assign(new Error("synthetic disk failure"), { code: "ENOSPC" });
      return write(target, ...args);
    });
    adapter.run("INSERT INTO synthetic_state VALUES (?)", ["synthetic-new-value"]);
    await vi.advanceTimersByTimeAsync(100);
    expect(fs.readFileSync(file)).toEqual(before);
    expect(fs.readdirSync(root).filter(name => name.includes(".tmp-"))).toEqual([]);
    failing.mockRestore();
  });

  it("does not publish when a filesystem fails to apply private replacement permissions", async () => {
    const { adapter, file } = await sqlJs();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(fs, "fchmodSync").mockImplementation(() => { throw new Error("synthetic permission failure"); });
    adapter.exec("CREATE TABLE synthetic_state(value TEXT)");
    await vi.advanceTimersByTimeAsync(100);
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.readdirSync(root).filter(name => name.includes(".tmp-"))).toEqual([]);
  });
});

async function nativeMigrationFixture() {
  const { ensureDirs, DATA_FILE, BACKUPS_DIR } = await import("@/lib/db/paths.js");
  ensureDirs();
  const { createNodeSqliteAdapter } = await import("@/lib/db/adapters/nodeSqliteAdapter.js");
  const adapter = await createNodeSqliteAdapter(DATA_FILE);
  adapters.push(adapter);
  return { adapter, file: DATA_FILE, backups: BACKUPS_DIR };
}

describe.skipIf(process.platform === "win32")("migration backup permissions and integrity", () => {
  it("publishes legacy JSON backups as private files without changing source bytes", async () => {
    fs.mkdirSync(process.env.DATA_DIR, { recursive: true, mode: 0o700 });
    const source = path.join(process.env.DATA_DIR, "db.json");
    const bytes = JSON.stringify({ settings: { mitmSudoEncrypted: "synthetic-secret-legacy" } });
    fs.writeFileSync(source, bytes, { mode: 0o644 });
    const { adapter, backups } = await nativeMigrationFixture();
    const { runMigrationOnce } = await import("@/lib/db/migrate.js");
    await runMigrationOnce(adapter);
    const directories = fs.readdirSync(backups);
    expect(directories).toHaveLength(1);
    const file = path.join(backups, directories[0], "db.json");
    expect(fs.statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(file, "utf8")).toBe(bytes);
    expect(fs.readFileSync(source, "utf8")).toBe(bytes);
  });

  it("takes a private SQLite safety backup before schema synchronization", async () => {
    const { adapter, backups } = await nativeMigrationFixture();
    adapter.exec("CREATE TABLE _meta(key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE settings(id INTEGER PRIMARY KEY, data TEXT NOT NULL)");
    adapter.run("INSERT INTO _meta VALUES (?, ?)", ["backupSchemaVersion", "1"]);
    adapter.run("INSERT INTO _meta VALUES (?, ?)", ["schemaVersion", "1"]);
    adapter.run("INSERT INTO settings VALUES (?, ?)", [1, '{"synthetic":"preserved"}']);
    const { runMigrationOnce } = await import("@/lib/db/migrate.js");
    await runMigrationOnce(adapter);
    const directories = fs.readdirSync(backups);
    expect(directories).toHaveLength(1);
    const file = path.join(backups, directories[0], "data.sqlite");
    expect(fs.statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    const check = new DatabaseSync(file, { readOnly: true });
    try {
      expect(check.prepare("SELECT data FROM settings WHERE id = 1").get().data).toBe('{"synthetic":"preserved"}');
    } finally {
      check.close();
    }
  });

  it("does not overwrite an existing SQLite backup with the same timestamp", async () => {
    const { adapter } = await nativeMigrationFixture();
    adapter.exec("CREATE TABLE _meta(key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE settings(id INTEGER PRIMARY KEY, data TEXT NOT NULL)");
    adapter.run("INSERT INTO _meta VALUES (?, ?)", ["backupSchemaVersion", "1"]);
    adapter.run("INSERT INTO _meta VALUES (?, ?)", ["schemaVersion", "1"]);
    const { makeBackupDir } = await import("@/lib/db/backup.js");
    const backupDir = makeBackupDir("schema-1-to-2");
    const backup = path.join(backupDir, "data.sqlite");
    fs.writeFileSync(backup, "synthetic-prior-backup");
    const { runMigrationOnce } = await import("@/lib/db/migrate.js");
    await runMigrationOnce(adapter);
    expect(fs.readFileSync(backup, "utf8") === "synthetic-prior-backup").toBe(true);
  });

  it("does not overwrite an existing legacy backup before import", async () => {
    fs.mkdirSync(process.env.DATA_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(process.env.DATA_DIR, "db.json"), JSON.stringify({ settings: { requireLogin: true } }));
    const { adapter } = await nativeMigrationFixture();
    const { makeBackupDir } = await import("@/lib/db/backup.js");
    const backupDir = makeBackupDir("migrate-from-json");
    const backup = path.join(backupDir, "db.json");
    fs.writeFileSync(backup, "synthetic-prior-legacy-backup");
    const { runMigrationOnce } = await import("@/lib/db/migrate.js");
    await expect(runMigrationOnce(adapter)).rejects.toThrow(/backup.*exist|overwrite/i);
    expect(fs.readFileSync(backup, "utf8")).toBe("synthetic-prior-legacy-backup");
  });

  it("retains sql.js best-effort backup semantics without blocking fallback schema synchronization", async () => {
    const { ensureDirs, DATA_FILE } = await import("@/lib/db/paths.js");
    ensureDirs();
    const { createSqlJsAdapter } = await import("@/lib/db/adapters/sqljsAdapter.js");
    const adapter = await createSqlJsAdapter(DATA_FILE);
    adapters.push(adapter);
    adapter.exec("CREATE TABLE _meta(key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE settings(id INTEGER PRIMARY KEY, data TEXT NOT NULL)");
    adapter.run("INSERT INTO _meta VALUES (?, ?)", ["backupSchemaVersion", "1"]);
    adapter.run("INSERT INTO _meta VALUES (?, ?)", ["schemaVersion", "1"]);
    adapter.run("INSERT INTO settings VALUES (?, ?)", [1, '{"synthetic":"preserved"}']);
    const { runMigrationOnce } = await import("@/lib/db/migrate.js");
    await expect(runMigrationOnce(adapter)).resolves.toBeUndefined();
    expect(adapter.get("SELECT data FROM settings WHERE id = 1").data).toBe('{"synthetic":"preserved"}');
    expect(adapter.all("SELECT name FROM sqlite_master WHERE type = 'table'").map(row => row.name)).toContain("usageHistory");
  });

  it("fails before schema changes when a backup cannot be made owner-only", async () => {
    const { adapter } = await nativeMigrationFixture();
    adapter.exec("CREATE TABLE _meta(key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE settings(id INTEGER PRIMARY KEY, data TEXT NOT NULL)");
    adapter.run("INSERT INTO _meta VALUES (?, ?)", ["backupSchemaVersion", "1"]);
    adapter.run("INSERT INTO _meta VALUES (?, ?)", ["schemaVersion", "1"]);
    const open = fs.openSync;
    const backupFds = new Set();
    vi.spyOn(fs, "openSync").mockImplementation((file, ...args) => {
      const fd = open(file, ...args);
      if (String(file).includes(`${path.sep}backups${path.sep}`)) backupFds.add(fd);
      return fd;
    });
    const chmod = fs.fchmodSync;
    vi.spyOn(fs, "fchmodSync").mockImplementation((fd, mode) => {
      if (backupFds.has(fd)) throw new Error("synthetic backup permission failure");
      return chmod(fd, mode);
    });
    const { runMigrationOnce } = await import("@/lib/db/migrate.js");
    await expect(runMigrationOnce(adapter)).rejects.toMatchObject({ code: "DB_BACKUP_PERMISSIONS" });
    expect(adapter.all("SELECT name FROM sqlite_master WHERE type = 'table'").map(row => row.name)).toEqual(["_meta", "settings"]);
  });
});
