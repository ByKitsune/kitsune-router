import path from "node:path";
import fs from "node:fs";
import { DATA_DIR } from "../dataDir.js";

const CONFIGURED_DATA_DIR = process.env.DATA_DIR;

export const DB_DIR = path.join(DATA_DIR, "db");
export const DATA_FILE = path.join(DB_DIR, "data.sqlite");
export const BACKUPS_DIR = path.join(DB_DIR, "backups");
export const LEGACY_FILES = {
  main: path.join(DATA_DIR, "db.json"),
  usage: path.join(DATA_DIR, "usage.json"),
  disabled: path.join(DATA_DIR, "disabledModels.json"),
  details: path.join(DATA_DIR, "request-details.json"),
};

function ensurePrivateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(dir).isDirectory()) {
    throw new Error(`[DB] Refusing non-directory or symbolic link: ${dir}`);
  }
  // Windows requires an owner-only ACL on DATA_DIR; POSIX mode bits are not ACLs.
  if (process.platform !== "win32") {
    fs.chmodSync(dir, 0o700);
    if ((fs.statSync(dir).mode & 0o777) !== 0o700) {
      throw new Error(`[DB] Cannot secure directory permissions: ${dir}`);
    }
  }
}

function ensurePrivateDbFile() {
  // Do not truncate existing state, follow a symlink, or replace a damaged DB.
  try {
    if (!fs.lstatSync(DATA_FILE).isFile()) {
      throw new Error(`[DB] Refusing non-regular database file: ${DATA_FILE}`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const fd = fs.openSync(DATA_FILE, fs.constants.O_CREAT | fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW || 0), 0o600);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink > 1) {
      throw new Error(`[DB] Refusing non-regular or hard-linked database file: ${DATA_FILE}`);
    }
    if (process.platform !== "win32") {
      fs.fchmodSync(fd, 0o600);
      if ((fs.fstatSync(fd).mode & 0o777) !== 0o600) {
        throw new Error(`[DB] Cannot secure database file permissions: ${DATA_FILE}`);
      }
    }
  } finally {
    fs.closeSync(fd);
  }
}

export function ensureDirs() {
  // dataDir's legacy permission fallback must not silently start a different DB.
  const ignoredUnixPathOnWindows = process.platform === "win32" && /^\//.test(CONFIGURED_DATA_DIR || "");
  if (CONFIGURED_DATA_DIR && !ignoredUnixPathOnWindows && path.resolve(CONFIGURED_DATA_DIR) !== path.resolve(DATA_DIR)) {
    throw new Error(`[DB] Configured DATA_DIR is unavailable; refusing fallback database: ${CONFIGURED_DATA_DIR}`);
  }
  for (const dir of [DATA_DIR, DB_DIR, BACKUPS_DIR]) {
    ensurePrivateDir(dir);
  }
  // Native SQLite derives WAL/SHM modes from the main DB. The private directory
  // also protects sql.js replacement images and schema/legacy backup files.
  ensurePrivateDbFile();
}
