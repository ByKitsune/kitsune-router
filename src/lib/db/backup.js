// DB safety backups — taken ONLY before a schema change (see migrate.js).
//
// ⚠️ AGENT/DEV NOTES:
// - Backups are a best-effort safety net before schema migrations. There is NO
//   automated restore path; recovery is manual (copy a backup file back).
// - Backups intentionally EXCLUDE the `requestDetails` table (observability log,
//   auto-pruned, non-critical) so a multi-hundred-MB DB backs up as a few MB.
// - Only the newest KEEP_BACKUPS are kept; older ones are pruned automatically.
import fs from "node:fs";
import path from "node:path";
import { BACKUPS_DIR, ensureDirs } from "./paths.js";
import { timestampSlug, getAppVersion } from "./version.js";

const KEEP_BACKUPS = 3;

// Tables excluded from safety backups (large, non-critical, reproducible).
const BACKUP_EXCLUDE_TABLES = ["requestDetails"];

function backupName(name) {
  if (typeof name !== "string" || !name || name === "." || name === ".." || /[\\/:\0]/.test(name)) {
    throw new Error("Invalid backup filename");
  }
  return name;
}

function privateMode(fd, mode, directory = false) {
  try {
    const stat = fs.fstatSync(fd);
    if (directory ? !stat.isDirectory() : (!stat.isFile() || stat.nlink > 1)) {
      throw new Error("Refusing non-regular or hard-linked backup");
    }
    if (process.platform !== "win32") {
      fs.fchmodSync(fd, mode);
      if ((fs.fstatSync(fd).mode & 0o777) !== mode) throw new Error("Backup permissions are not owner-only");
    }
    return stat;
  } catch (cause) {
    const error = new Error("[DB] Cannot secure backup permissions", { cause });
    error.code = "DB_BACKUP_PERMISSIONS";
    throw error;
  }
}

function validateBackupDir(dir) {
  if (!fs.lstatSync(dir).isDirectory()) throw new Error("Refusing backup-directory symbolic link or non-directory");
  // Windows directory ACLs cannot be validated through POSIX file modes.
  if (process.platform === "win32") return;
  const fd = fs.openSync(dir, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_DIRECTORY || 0));
  try { privateMode(fd, 0o700, true); } finally { fs.closeSync(fd); }
}

function removeCreatedBackup(file, stat) {
  try {
    const current = fs.lstatSync(file);
    if (current.ino === stat.ino && current.dev === stat.dev) fs.unlinkSync(file);
  } catch { /* Never remove a collision or another writer's replacement. */ }
}

function createPrivateBackup(file) {
  // O_EXCL rejects existing files, symlinks and hardlinks without following or
  // truncating them. Permission checks precede every byte and native ATTACH.
  const fd = fs.openSync(file, "wx", 0o600);
  const stat = fs.fstatSync(fd);
  try {
    privateMode(fd, 0o600);
    return { fd, stat };
  } catch (error) {
    fs.closeSync(fd);
    removeCreatedBackup(file, stat);
    throw error;
  }
}

export function makeBackupDir(label) {
  ensureDirs();
  const ver = getAppVersion();
  const slug = backupName(`${label}-${ver}-${timestampSlug()}`);
  const dir = path.join(BACKUPS_DIR, slug);
  try { fs.mkdirSync(dir, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
  validateBackupDir(dir);
  return dir;
}

export function backupFile(srcPath, destDir, destName = null) {
  let sourceStat;
  try { sourceStat = fs.lstatSync(srcPath); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (!sourceStat.isFile() || sourceStat.nlink > 1) throw new Error("Refusing non-regular or hard-linked backup source");
  const name = backupName(destName || path.basename(srcPath));
  validateBackupDir(destDir);
  const dest = path.join(destDir, name);
  const source = fs.openSync(srcPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  let created;
  try {
    const stat = fs.fstatSync(source);
    if (!stat.isFile() || stat.nlink > 1 || stat.ino !== sourceStat.ino || stat.dev !== sourceStat.dev) {
      throw new Error("Backup source changed or is not a regular file");
    }
    created = createPrivateBackup(dest);
    // copyFile may restore the source mode. Copy via descriptors instead, using
    // bounded memory and the already-private destination, without reopening it.
    const buffer = Buffer.alloc(64 * 1024);
    let count;
    while ((count = fs.readSync(source, buffer, 0, buffer.length, null)) > 0) {
      let offset = 0;
      while (offset < count) {
        const written = fs.writeSync(created.fd, buffer, offset, count - offset, null);
        if (written <= 0) throw new Error("Backup write made no progress");
        offset += written;
      }
    }
    fs.fsyncSync(created.fd);
    return dest;
  } catch (error) {
    if (created) {
      fs.closeSync(created.fd);
      removeCreatedBackup(dest, created.stat);
      created = null;
    }
    throw error;
  } finally {
    if (created) fs.closeSync(created.fd);
    fs.closeSync(source);
  }
}

// Lightweight DB backup via ATTACH: create an empty sqlite file, copy every
// table EXCEPT the excluded ones into it. Avoids duplicating the huge
// observability log, so the backup stays small regardless of DB size.
export function backupDbLite(adapter, destDir, destName = "data.sqlite") {
  const dest = path.join(destDir, backupName(destName));
  validateBackupDir(destDir);
  const created = createPrivateBackup(dest);
  fs.closeSync(created.fd);
  const escaped = dest.replace(/'/g, "''");

  try {
    adapter.exec(`ATTACH DATABASE '${escaped}' AS bak`);
    try {
      const excluded = new Set(BACKUP_EXCLUDE_TABLES);
      const tables = adapter
        .all(`SELECT name, sql FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
        .filter((t) => !excluded.has(t.name));

      adapter.transaction(() => {
        for (const t of tables) {
          // Recreate table structure in backup DB, then copy rows.
          const createSql = t.sql.replace(/CREATE TABLE\s+/i, "CREATE TABLE bak.");
          adapter.exec(createSql);
          adapter.exec(`INSERT INTO bak.${t.name} SELECT * FROM main.${t.name}`);
        }
      });
    } finally {
      adapter.exec("DETACH DATABASE bak");
    }
  } catch (error) {
    removeCreatedBackup(dest, created.stat);
    throw error;
  }
  return dest;
}

export function pruneOldBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) return;
  const entries = fs.readdirSync(BACKUPS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, full: path.join(BACKUPS_DIR, e.name), mtime: fs.statSync(path.join(BACKUPS_DIR, e.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const old of entries.slice(KEEP_BACKUPS)) {
    try { fs.rmSync(old.full, { recursive: true, force: true }); } catch {}
  }
}
