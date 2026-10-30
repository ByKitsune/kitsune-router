import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

let root;
const previousDataDir = process.env.DATA_DIR;
const previousHome = process.env.HOME;
const pathsUrl = new URL("../../src/lib/db/paths.js", import.meta.url).href;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(tmpdir(), "reconciliation-security-paths-"));
  process.env.DATA_DIR = path.join(root, "data");
  process.env.HOME = root;
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  if (root) fs.rmSync(root, { recursive: true, force: true });
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
});

function runWithPermissiveUmask(body) {
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
    import fs from 'node:fs';
    process.umask(0);
    ${body}
  `], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: root,
      DATA_DIR: process.env.DATA_DIR,
      RUN_LIVE_TESTS: "0", RUN_REAL: "0", RUN_E2E: "0",
      DISABLE_BACKGROUND_TOKEN_REFRESH: "1", KITSUNE_ROUTER_DISABLE_MITM: "1", DISABLE_MITM_BYPASS: "1",
    },
    encoding: "utf8",
  }));
}

// Establish the synthetic prior state explicitly; creation modes alone are
// filtered by the executor's umask and can accidentally skip hardening coverage.
function writeModeFixture(file, contents, mode) {
  fs.writeFileSync(file, contents, { mode });
  fs.chmodSync(file, mode);
}

describe.skipIf(process.platform === "win32")("private database filesystem boundary", () => {
  it("creates private directories and a private SQLite file even with a permissive umask", () => {
    const result = runWithPermissiveUmask(`
      const { ensureDirs, DB_DIR, BACKUPS_DIR, DATA_FILE } = await import(${JSON.stringify(pathsUrl)});
      ensureDirs();
      console.log(JSON.stringify({
        modes: [process.env.DATA_DIR, DB_DIR, BACKUPS_DIR].map(dir => fs.statSync(dir).mode & 0o777),
        fileMode: fs.existsSync(DATA_FILE) ? fs.statSync(DATA_FILE).mode & 0o777 : null,
      }));
    `);
    expect(result).toEqual({ modes: [0o700, 0o700, 0o700], fileMode: 0o600 });
  });

  it("keeps native SQLite journals and shared memory owner-only", () => {
    const result = runWithPermissiveUmask(`
      const { ensureDirs, DATA_FILE } = await import(${JSON.stringify(pathsUrl)});
      const { DatabaseSync } = await import('node:sqlite');
      ensureDirs();
      const db = new DatabaseSync(DATA_FILE);
      db.exec('PRAGMA journal_mode = WAL; CREATE TABLE secrets(value TEXT)');
      db.prepare('INSERT INTO secrets VALUES (?)').run('synthetic-only');
      const modes = [DATA_FILE, DATA_FILE + '-wal', DATA_FILE + '-shm'].map(file => fs.statSync(file).mode & 0o777);
      db.close();
      console.log(JSON.stringify(modes));
    `);
    expect(result).toEqual([0o600, 0o600, 0o600]);
  });

  it("hardens permissions without replacing existing database bytes or inode", async () => {
    const { ensureDirs, DB_DIR, DATA_FILE } = await import("@/lib/db/paths.js");
    fs.mkdirSync(DB_DIR, { recursive: true });
    writeModeFixture(DATA_FILE, "existing synthetic state", 0o644);
    fs.chmodSync(DB_DIR, 0o755);
    const inode = fs.statSync(DATA_FILE).ino;

    ensureDirs();

    expect(fs.readFileSync(DATA_FILE, "utf8")).toBe("existing synthetic state");
    expect(fs.statSync(DATA_FILE).ino).toBe(inode);
    expect(fs.statSync(DATA_FILE).mode & 0o777).toBe(0o600);
    expect(fs.statSync(DB_DIR).mode & 0o777).toBe(0o700);
  });

  it("rejects a database symlink without touching its target", async () => {
    const { ensureDirs, DB_DIR, DATA_FILE } = await import("@/lib/db/paths.js");
    fs.mkdirSync(DB_DIR, { recursive: true });
    const target = path.join(root, "target.sqlite");
    writeModeFixture(target, "untouched synthetic target", 0o640);
    fs.symlinkSync(target, DATA_FILE);

    expect(() => ensureDirs()).toThrow();
    expect(fs.readFileSync(target, "utf8")).toBe("untouched synthetic target");
    expect(fs.statSync(target).mode & 0o777).toBe(0o640);
    expect(fs.lstatSync(DATA_FILE).isSymbolicLink()).toBe(true);
  });

  it("rejects a hard-linked database without changing the linked file", async () => {
    const { ensureDirs, DB_DIR, DATA_FILE } = await import("@/lib/db/paths.js");
    fs.mkdirSync(DB_DIR, { recursive: true });
    const target = path.join(root, "linked.sqlite");
    writeModeFixture(target, "untouched synthetic hard link", 0o640);
    fs.linkSync(target, DATA_FILE);

    expect(() => ensureDirs()).toThrow();
    expect(fs.readFileSync(target, "utf8")).toBe("untouched synthetic hard link");
    expect(fs.statSync(target).mode & 0o777).toBe(0o640);
  });

  it("rejects a database-directory symlink without modifying the target directory", async () => {
    const { ensureDirs, DB_DIR } = await import("@/lib/db/paths.js");
    // Resolving DATA_DIR is lazy: the fixture must create the symlink's parent,
    // not rely on importing paths.js to initialize application directories.
    fs.mkdirSync(path.dirname(DB_DIR), { recursive: true, mode: 0o700 });
    const target = path.join(root, "target-directory");
    fs.mkdirSync(target, { mode: 0o755 });
    fs.chmodSync(target, 0o755);
    fs.symlinkSync(target, DB_DIR);

    expect(() => ensureDirs()).toThrow();
    expect(fs.lstatSync(DB_DIR).isSymbolicLink()).toBe(true);
    expect(fs.readdirSync(target)).toEqual([]);
    expect(fs.statSync(target).mode & 0o777).toBe(0o755);
  });

  it("fails before database creation if private-directory permissions cannot be applied", async () => {
    const { ensureDirs, DB_DIR, DATA_FILE } = await import("@/lib/db/paths.js");
    const chmod = fs.chmodSync;
    vi.spyOn(fs, "chmodSync").mockImplementation((file, mode) => {
      if (file === DB_DIR) throw Object.assign(new Error("synthetic permission failure"), { code: "EPERM" });
      return chmod(file, mode);
    });

    expect(() => ensureDirs()).toThrow("synthetic permission failure");
    expect(fs.existsSync(DATA_FILE)).toBe(false);
  });

  it("fails closed when the filesystem does not honor private directory modes", async () => {
    const { ensureDirs, DB_DIR, DATA_FILE } = await import("@/lib/db/paths.js");
    fs.mkdirSync(DB_DIR, { recursive: true });
    fs.chmodSync(DB_DIR, 0o755);
    const chmod = fs.chmodSync;
    vi.spyOn(fs, "chmodSync").mockImplementation((file, mode) => {
      if (file !== DB_DIR) return chmod(file, mode);
    });

    expect(() => ensureDirs()).toThrow();
    expect(fs.existsSync(DATA_FILE)).toBe(false);
  });

  it("fails closed without replacing state when database permissions cannot be applied", async () => {
    const { ensureDirs, DB_DIR, DATA_FILE } = await import("@/lib/db/paths.js");
    fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, "synthetic state retained");
    vi.spyOn(fs, "fchmodSync").mockImplementation(() => {
      throw Object.assign(new Error("synthetic file permission failure"), { code: "EPERM" });
    });

    expect(() => ensureDirs()).toThrow("synthetic file permission failure");
    expect(fs.readFileSync(DATA_FILE, "utf8")).toBe("synthetic state retained");
  });

  it("does not initialize an alternative database when configured DATA_DIR creation is denied", async () => {
    const mkdir = fs.mkdirSync;
    vi.spyOn(fs, "mkdirSync").mockImplementation((dir, options) => {
      if (dir === process.env.DATA_DIR) {
        throw Object.assign(new Error("synthetic data-directory failure"), { code: "EACCES" });
      }
      return mkdir(dir, options);
    });
    const { ensureDirs } = await import("@/lib/db/paths.js");

    expect(() => ensureDirs()).toThrow();
    expect(fs.existsSync(path.join(root, ".kitsune-router", "db"))).toBe(false);
  });
});
