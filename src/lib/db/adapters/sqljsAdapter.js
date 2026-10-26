import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import { PRAGMA_SQL } from "../schema.js";
import { registerAdapterShutdown } from "../helpers/adapterLifecycle.js";

let SQL = null;

async function loadSql() {
  if (SQL) return SQL;
  SQL = await initSqlJs();
  return SQL;
}

export async function createSqlJsAdapter(filePath) {
  const SQLLib = await loadSql();
  const lockPath = `${filePath}.sqljs-owner`;
  try { fs.mkdirSync(lockPath, { mode: 0o700 }); }
  catch (cause) {
    throw Object.assign(new Error("[sql.js] Exclusive owner unavailable; a live or crashed sql.js owner must be resolved before opening", { cause }), { code: "SQLJS_EXCLUSIVE_OWNER" });
  }
  let db;
  try {
    const buf = fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
    db = new SQLLib.Database(buf);
    db.exec(PRAGMA_SQL);
  } catch (error) { fs.rmdirSync(lockPath); throw error; }

  let dirty = false;
  let saveTimer = null;
  const SAVE_DEBOUNCE_MS = 100;

  let persistSeq = 0;

  /**
   * Publish the database atomically: full image to a temp file in the SAME
   * directory, fsync, then rename over the target.
   *
   * sql.js has no incremental write path — every save rewrites the whole image —
   * and `writeFileSync` opens with O_TRUNC, so the previous version was destroyed
   * before the new one was written. For the length of that write the file on disk
   * was 0 bytes and then partial, which is a window that grows with the database
   * and recurs on every save. Two consequences:
   *
   *   - a crash or power loss mid-write left no usable database at all, not a
   *     stale one — sql.js is the fallback driver that always works, so this is
   *     the driver users without build tools run on;
   *   - another process reading the file (a backup job, `sqlite3`) saw a truncated
   *     image and reported corruption, which the SQLite locking protocol does not
   *     cover here because sql.js writes through the filesystem, not through SQLite.
   *
   * The temp file is deliberately a sibling: `rename()` is only atomic within a
   * filesystem, so a temp in os.tmpdir() could land on another device.
   */
  function persist() {
    const data = db.export();
    const dir = path.dirname(filePath);
    const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${persistSeq++}`);

    let fd;
    try {
      // Exclusive creation rejects collisions/symlinks without truncating state.
      // Verify permissions before writing bytes, not after publishing the image.
      fd = fs.openSync(tmpPath, "wx", 0o600);
      if (process.platform !== "win32") {
        fs.fchmodSync(fd, 0o600);
        if ((fs.fstatSync(fd).mode & 0o777) !== 0o600) {
          throw new Error("[sqljs] Cannot secure database replacement permissions");
        }
      }
      fs.writeFileSync(fd, Buffer.from(data));
      fs.fsyncSync(fd);
    } catch (err) {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* already closed */ } }
      if (fd !== undefined) { try { fs.unlinkSync(tmpPath); } catch { /* nothing to clean up */ } }
      throw err;
    }
    fs.closeSync(fd);

    try {
      fs.renameSync(tmpPath, filePath);
      if (process.platform !== "win32") {
        const directory = fs.openSync(dir, fs.constants.O_RDONLY);
        try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
      }
    } catch (err) {
      try { fs.unlinkSync(tmpPath); } catch { /* nothing to clean up */ }
      throw err;
    }
    dirty = false;
  }

  function scheduleSave() {
    dirty = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (dirty) {
        try { persist(); } catch (e) { console.error("[sqljs] save failed:", e); }
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function paramsObj(params) {
    if (!params || (Array.isArray(params) && params.length === 0)) return undefined;
    return params;
  }

  function run(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(paramsObj(params));
      stmt.step();
      const changes = db.getRowsModified();
      const lastInsertRowid = db.exec("SELECT last_insert_rowid() as id")[0]?.values?.[0]?.[0] ?? null;
      scheduleSave();
      return { changes, lastInsertRowid };
    } finally {
      stmt.free();
    }
  }

  function get(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(paramsObj(params));
      if (stmt.step()) return stmt.getAsObject();
      return undefined;
    } finally {
      stmt.free();
    }
  }

  function all(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(paramsObj(params));
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  function exec(sql) {
    db.exec(sql);
    scheduleSave();
  }

  function transaction(fn) {
    const sp = `sp_${Math.random().toString(36).slice(2)}`;
    db.exec(`SAVEPOINT ${sp}`);
    try {
      const result = fn();
      db.exec(`RELEASE ${sp}`);
      scheduleSave();
      return result;
    } catch (e) {
      try { db.exec(`ROLLBACK TO ${sp}`); db.exec(`RELEASE ${sp}`); } catch {}
      throw e;
    }
  }

  let closed = false;
  function flushDurable() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (dirty) persist();
  }

  function close() {
    if (closed) return;
    flushDurable();
    releaseShutdown();
    db.close();
    fs.rmdirSync(lockPath);
    closed = true;
  }

  const releaseShutdown = registerAdapterShutdown(close);
  return { driver: "sql.js", singleProcessOnly: true, run, get, all, exec, transaction, flushDurable, close, raw: db };
}
