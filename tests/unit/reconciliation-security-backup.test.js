import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

const shutdownEvents = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
let root;
let previousListeners;
let adapters;
let backups;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(tmpdir(), "reconciliation-security-backup-"));
  vi.stubEnv("HOME", path.join(root, "home"));
  vi.stubEnv("DATA_DIR", path.join(root, "data"));
  fs.mkdirSync(process.env.HOME, { mode: 0o700 });
  previousListeners = new Map(shutdownEvents.map(event => [event, process.rawListeners(event)]));
  adapters = [];
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  backups = await import("@/lib/db/backup.js");
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

function legacyFile() {
  const source = path.join(root, "legacy.json");
  const bytes = Buffer.from(JSON.stringify({ apiKey: "synthetic-only-key", padding: "x".repeat(200000) }));
  fs.writeFileSync(source, bytes, { mode: 0o644 });
  return { source, bytes };
}

async function nativeAdapter() {
  const { createNodeSqliteAdapter } = await import("@/lib/db/adapters/nodeSqliteAdapter.js");
  const adapter = await createNodeSqliteAdapter(path.join(root, "source.sqlite"));
  adapters.push(adapter);
  adapter.exec("CREATE TABLE synthetic_state(id TEXT PRIMARY KEY, value TEXT); CREATE TABLE requestDetails(id TEXT PRIMARY KEY, data TEXT)");
  adapter.run("INSERT INTO synthetic_state VALUES (?, ?)", ["fixture", "synthetic-only-secret"]);
  adapter.run("INSERT INTO requestDetails VALUES (?, ?)", ["excluded", "synthetic-request-payload"]);
  return adapter;
}

describe.skipIf(process.platform === "win32")("private backup writers before any secret bytes", () => {
  it("creates and validates a 0700 backup directory before use", () => {
    const directory = backups.makeBackupDir("synthetic-private");
    expect(fs.lstatSync(directory).isDirectory()).toBe(true);
    expect(fs.statSync(directory).mode & 0o777).toBe(0o700);
  });

  it("rejects a backup-directory symlink without modifying its target", () => {
    const directory = backups.makeBackupDir("synthetic-symlink");
    fs.rmdirSync(directory);
    const target = path.join(root, "unrelated-directory");
    fs.mkdirSync(target, { mode: 0o755 });
    fs.chmodSync(target, 0o755);
    fs.symlinkSync(target, directory);
    expect(() => backups.makeBackupDir("synthetic-symlink")).toThrow();
    expect(fs.statSync(target).mode & 0o777).toBe(0o755);
    expect(fs.readdirSync(target)).toEqual([]);
  });

  it("copies unchanged source bytes into a 0600 file that is private at its first write", () => {
    const { source, bytes } = legacyFile();
    const directory = backups.makeBackupDir("synthetic-json");
    const destination = path.join(directory, "legacy.json");
    const modes = [];
    const write = fs.writeSync;
    vi.spyOn(fs, "writeSync").mockImplementation((fd, ...args) => {
      modes.push(fs.fstatSync(fd).mode & 0o777);
      return write(fd, ...args);
    });
    const copy = fs.copyFileSync;
    vi.spyOn(fs, "copyFileSync").mockImplementation((from, to, ...args) => {
      modes.push(fs.existsSync(to) ? fs.statSync(to).mode & 0o777 : null);
      return copy(from, to, ...args);
    });
    expect(backups.backupFile(source, directory)).toBe(destination);
    expect(modes.length).toBeGreaterThan(0);
    expect(modes.every(mode => mode === 0o600)).toBe(true);
    expect(fs.statSync(destination).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(destination)).toEqual(bytes);
    expect(fs.readFileSync(source)).toEqual(bytes);
    expect(fs.statSync(source).mode & 0o777).toBe(0o644);
  });

  it.each(["existing", "symlink", "hardlink"])("preserves a %s destination collision when copying legacy state", kind => {
    const { source } = legacyFile();
    const directory = backups.makeBackupDir(`synthetic-copy-${kind}`);
    const destination = path.join(directory, "legacy.json");
    const sentinel = path.join(root, "sentinel");
    fs.writeFileSync(sentinel, "synthetic-prior-state", { mode: 0o640 });
    if (kind === "existing") fs.writeFileSync(destination, "synthetic-prior-state", { mode: 0o640 });
    if (kind === "symlink") fs.symlinkSync(sentinel, destination);
    if (kind === "hardlink") fs.linkSync(sentinel, destination);
    const before = fs.lstatSync(destination);
    expect(() => backups.backupFile(source, directory)).toThrow();
    expect(fs.readFileSync(destination, "utf8")).toBe("synthetic-prior-state");
    expect(fs.readFileSync(sentinel, "utf8")).toBe("synthetic-prior-state");
    expect(fs.lstatSync(destination).ino).toBe(before.ino);
    expect(fs.statSync(sentinel).mode & 0o777).toBe(0o640);
  });

  it.each(["symlink", "hardlink"])("refuses a %s legacy source without creating a backup", kind => {
    const { source, bytes } = legacyFile();
    const linked = path.join(root, "linked.json");
    if (kind === "symlink") fs.symlinkSync(source, linked);
    else fs.linkSync(source, linked);
    const directory = backups.makeBackupDir(`synthetic-source-${kind}`);
    expect(() => backups.backupFile(linked, directory)).toThrow();
    expect(fs.readdirSync(directory)).toEqual([]);
    expect(fs.readFileSync(source)).toEqual(bytes);
  });

  it("rejects a destination filename that would escape its private directory", () => {
    const { source } = legacyFile();
    const directory = backups.makeBackupDir("synthetic-escape");
    const escaped = path.join(directory, "..", "escaped.json");
    expect(() => backups.backupFile(source, directory, "../escaped.json")).toThrow();
    expect(fs.existsSync(escaped)).toBe(false);
  });

  it("keeps the missing legacy source behavior without creating an empty backup", () => {
    const directory = backups.makeBackupDir("synthetic-absent");
    expect(backups.backupFile(path.join(root, "absent.json"), directory)).toBeNull();
    expect(fs.readdirSync(directory)).toEqual([]);
  });

  it("removes only its new incomplete copy after a write failure and preserves source bytes", () => {
    const { source, bytes } = legacyFile();
    const directory = backups.makeBackupDir("synthetic-write-failure");
    vi.spyOn(fs, "writeSync").mockImplementation(() => { throw Object.assign(new Error("synthetic disk full"), { code: "ENOSPC" }); });
    expect(() => backups.backupFile(source, directory)).toThrow("synthetic disk full");
    expect(fs.readdirSync(directory)).toEqual([]);
    expect(fs.readFileSync(source)).toEqual(bytes);
  });

  it("fails before copying when owner-only destination permissions cannot be applied", () => {
    const { source, bytes } = legacyFile();
    const directory = backups.makeBackupDir("synthetic-copy-permissions");
    const chmod = fs.fchmodSync;
    vi.spyOn(fs, "fchmodSync").mockImplementation((fd, mode) => {
      if (fs.fstatSync(fd).isFile()) throw new Error("synthetic file permission failure");
      return chmod(fd, mode);
    });
    let failure;
    try { backups.backupFile(source, directory); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: "DB_BACKUP_PERMISSIONS" });
    expect(fs.readdirSync(directory)).toEqual([]);
    expect(fs.readFileSync(source)).toEqual(bytes);
  });

  it("precreates a private SQLite backup before ATTACH and produces an integrity-checked lightweight copy", async () => {
    const adapter = await nativeAdapter();
    const directory = backups.makeBackupDir("synthetic-sqlite");
    const destination = path.join(directory, "data.sqlite");
    const exec = adapter.exec.bind(adapter);
    let beforeAttach;
    vi.spyOn(adapter, "exec").mockImplementation(sql => {
      if (/^ATTACH DATABASE/.test(sql)) {
        beforeAttach = fs.existsSync(destination) ? { mode: fs.statSync(destination).mode & 0o777, size: fs.statSync(destination).size } : null;
      }
      return exec(sql);
    });
    expect(backups.backupDbLite(adapter, directory)).toBe(destination);
    expect(beforeAttach).toEqual({ mode: 0o600, size: 0 });
    expect(fs.statSync(destination).mode & 0o777).toBe(0o600);
    const copy = new DatabaseSync(destination, { readOnly: true });
    try {
      expect(copy.prepare("PRAGMA quick_check").get().quick_check).toBe("ok");
      expect(copy.prepare("SELECT value FROM synthetic_state WHERE id = ?").get("fixture").value).toBe("synthetic-only-secret");
      expect(copy.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name)).toEqual(["synthetic_state"]);
    } finally {
      copy.close();
    }
    expect(adapter.get("SELECT COUNT(*) AS n FROM requestDetails").n).toBe(1);
  });

  it.each(["existing", "symlink", "hardlink"])("does not delete a %s SQLite destination collision", async kind => {
    const adapter = await nativeAdapter();
    const directory = backups.makeBackupDir(`synthetic-db-${kind}`);
    const destination = path.join(directory, "data.sqlite");
    const sentinel = path.join(root, "sentinel.sqlite");
    fs.writeFileSync(sentinel, "synthetic-prior-backup", { mode: 0o640 });
    if (kind === "existing") fs.writeFileSync(destination, "synthetic-prior-backup", { mode: 0o640 });
    if (kind === "symlink") fs.symlinkSync(sentinel, destination);
    if (kind === "hardlink") fs.linkSync(sentinel, destination);
    const inode = fs.lstatSync(destination).ino;
    expect(() => backups.backupDbLite(adapter, directory)).toThrow();
    expect(fs.readFileSync(destination, "utf8")).toBe("synthetic-prior-backup");
    expect(fs.lstatSync(destination).ino).toBe(inode);
    expect(fs.readFileSync(sentinel, "utf8")).toBe("synthetic-prior-backup");
    expect(fs.statSync(sentinel).mode & 0o777).toBe(0o640);
  });

  it("rejects unenforced owner-only permissions before native ATTACH", async () => {
    const adapter = await nativeAdapter();
    const directory = backups.makeBackupDir("synthetic-attach-permissions");
    const chmod = fs.fchmodSync;
    vi.spyOn(fs, "fchmodSync").mockImplementation((fd, mode) => chmod(fd, fs.fstatSync(fd).isFile() ? 0o644 : mode));
    let failure;
    try { backups.backupDbLite(adapter, directory); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: "DB_BACKUP_PERMISSIONS" });
    expect(fs.readdirSync(directory)).toEqual([]);
    expect(adapter.all("PRAGMA database_list").map(row => row.name)).toEqual(["main"]);
    expect(adapter.get("SELECT value FROM synthetic_state WHERE id = ?", ["fixture"]).value).toBe("synthetic-only-secret");
  });

  it("does not report a sql.js ATTACH failure as a completed host backup", async () => {
    const { createSqlJsAdapter } = await import("@/lib/db/adapters/sqljsAdapter.js");
    const adapter = await createSqlJsAdapter(path.join(root, "fallback.sqlite"));
    adapters.push(adapter);
    adapter.exec("CREATE TABLE synthetic_state(value TEXT)");
    const directory = backups.makeBackupDir("synthetic-fallback");
    expect(() => backups.backupDbLite(adapter, directory)).toThrow();
    expect(fs.readdirSync(directory)).toEqual([]);
  });
});

describe.skipIf(process.platform === "win32")("legacy migration restart safety", () => {
  it.each(["symlink", "hardlink"])("imports legacy state on the second boot after repairing a rejected %s backup source", async kind => {
    const { ensureDirs, DATA_FILE, DB_DIR } = await import("@/lib/db/paths.js");
    ensureDirs();
    const legacy = {
      settings: { requireLogin: true, requireApiKey: true, password: "synthetic-legacy-hash" },
      providerConnections: [{ id: "legacy-account", provider: "openai", authType: "apikey", name: "Legacy account", apiKey: "synthetic-legacy-provider-key", isActive: true }],
      apiKeys: [{ id: "legacy-client", key: "synthetic-legacy-client-key", name: "Legacy client", isActive: true }],
    };
    const bytes = JSON.stringify(legacy);
    const legacyPath = path.join(process.env.DATA_DIR, "db.json");
    const details = path.join(process.env.DATA_DIR, "request-details.json");
    const detailsSource = path.join(root, "details-source.json");
    fs.writeFileSync(legacyPath, bytes);
    fs.writeFileSync(detailsSource, '{"records":[]}');
    if (kind === "symlink") fs.symlinkSync(detailsSource, details);
    else fs.linkSync(detailsSource, details);
    const { createNodeSqliteAdapter } = await import("@/lib/db/adapters/nodeSqliteAdapter.js");
    const first = await createNodeSqliteAdapter(DATA_FILE);
    adapters.push(first);
    const inode = fs.statSync(DATA_FILE).ino;
    const { runMigrationOnce } = await import("@/lib/db/migrate.js");
    await expect(runMigrationOnce(first)).rejects.toThrow(/backup source/i);
    const hadMeta = first.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_meta'");
    const firstMeta = hadMeta ? first.all("SELECT key, value FROM _meta") : [];
    expect(fs.existsSync(path.join(DB_DIR, ".migrated-from-json"))).toBe(false);
    first.close();
    adapters.pop();

    // Ordinary repair and restart: real filesystem, same persisted SQLite file,
    // no clock advance or manual metadata reset and no filesystem/DB mocks.
    fs.unlinkSync(details);
    fs.writeFileSync(details, '{"records":[]}');
    vi.resetModules();
    const { createNodeSqliteAdapter: reopen } = await import("@/lib/db/adapters/nodeSqliteAdapter.js");
    const second = await reopen(DATA_FILE);
    adapters.push(second);
    const { runMigrationOnce: migrateAfterRestart } = await import("@/lib/db/migrate.js");
    await expect(migrateAfterRestart(second)).resolves.toBeUndefined();
    expect(second.get("SELECT COUNT(*) AS n FROM providerConnections").n).toBe(1);
    expect(second.get("SELECT key FROM apiKeys WHERE id = 'legacy-client'").key).toBe("synthetic-legacy-client-key");
    expect(JSON.parse(second.get("SELECT data FROM settings WHERE id = 1").data)).toEqual(legacy.settings);
    expect(firstMeta).toEqual([]);
    expect(fs.statSync(DATA_FILE).ino).toBe(inode);
    expect(fs.readFileSync(legacyPath, "utf8")).toBe(bytes);
    expect(fs.readFileSync(detailsSource, "utf8")).toBe('{"records":[]}');
    expect(fs.existsSync(path.join(DB_DIR, ".migrated-from-json"))).toBe(true);
  });

  it("does not mark a backup failure completed when the same native adapter retries", async () => {
    const { ensureDirs, DATA_FILE, DB_DIR } = await import("@/lib/db/paths.js");
    ensureDirs();
    fs.writeFileSync(path.join(process.env.DATA_DIR, "db.json"), '{"settings":{"requireLogin":false}}');
    const source = path.join(root, "details-source.json");
    const details = path.join(process.env.DATA_DIR, "request-details.json");
    fs.writeFileSync(source, '{"records":[]}');
    fs.symlinkSync(source, details);
    const { createNodeSqliteAdapter } = await import("@/lib/db/adapters/nodeSqliteAdapter.js");
    const adapter = await createNodeSqliteAdapter(DATA_FILE);
    adapters.push(adapter);
    const { runMigrationOnce } = await import("@/lib/db/migrate.js");
    await expect(runMigrationOnce(adapter)).rejects.toThrow(/backup source/i);
    fs.unlinkSync(details);
    fs.writeFileSync(details, '{"records":[]}');
    await expect(runMigrationOnce(adapter)).resolves.toBeUndefined();
    expect(JSON.parse(adapter.get("SELECT data FROM settings WHERE id = 1").data)).toEqual({ requireLogin: false });
    expect(fs.existsSync(path.join(DB_DIR, ".migrated-from-json"))).toBe(true);
  });

  it("rolls fresh schema stamps back after a late legacy constraint failure and imports on a repaired second boot", async () => {
    const { ensureDirs, DATA_FILE, DB_DIR } = await import("@/lib/db/paths.js");
    ensureDirs();
    const legacy = {
      settings: { requireLogin: true },
      providerConnections: [{ id: "retry-account", provider: "openai", authType: "apikey", apiKey: "synthetic-retry-key" }],
      apiKeys: [{ id: "retry-client", key: "synthetic-retry-client" }],
      combos: [{ id: "invalid-combo", name: null }],
    };
    const original = JSON.stringify(legacy);
    const source = path.join(process.env.DATA_DIR, "db.json");
    fs.writeFileSync(source, original);
    const { createNodeSqliteAdapter } = await import("@/lib/db/adapters/nodeSqliteAdapter.js");
    const first = await createNodeSqliteAdapter(DATA_FILE);
    adapters.push(first);
    const { runMigrationOnce } = await import("@/lib/db/migrate.js");
    await expect(runMigrationOnce(first)).rejects.toMatchObject({ name: "MigrationAborted" });
    expect(first.all("SELECT name FROM sqlite_master WHERE type = 'table'")).toEqual([]);
    expect(fs.existsSync(path.join(DB_DIR, ".migrated-from-json"))).toBe(false);
    expect(fs.readFileSync(source, "utf8")).toBe(original);
    first.close();
    adapters.pop();

    fs.writeFileSync(source, JSON.stringify({ ...legacy, combos: [] }));
    // The earlier successful safety snapshot remains untouched; a later boot
    // takes its own snapshot rather than reusing/overwriting that timestamp.
    vi.advanceTimersByTime(1000);
    vi.resetModules();
    const { createNodeSqliteAdapter: reopen } = await import("@/lib/db/adapters/nodeSqliteAdapter.js");
    const second = await reopen(DATA_FILE);
    adapters.push(second);
    const { runMigrationOnce: migrateAfterRestart } = await import("@/lib/db/migrate.js");
    await expect(migrateAfterRestart(second)).resolves.toBeUndefined();
    expect(second.get("SELECT COUNT(*) AS n FROM providerConnections").n).toBe(1);
    expect(second.get("SELECT key FROM apiKeys WHERE id = 'retry-client'").key).toBe("synthetic-retry-client");
    expect(JSON.parse(second.get("SELECT data FROM settings WHERE id = 1").data)).toEqual(legacy.settings);
    expect(fs.existsSync(path.join(DB_DIR, ".migrated-from-json"))).toBe(true);
  });
});
