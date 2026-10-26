// Shared by the launcher, Next.js server and MITM child. No application imports:
// migration must finish before any database, runtime secret or certificate opens.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const nodeModule = require("node:module");
const { execFileSync } = require("node:child_process");

const APP_DIRECTORY = "kitsune-router";
const LEGACY_DIRECTORIES = ["zenrouter", "9router"];
const STATE_FILES = ["db", "db.json", "usage.json", "disabledModels.json", "request-details.json", "secrets.json", "machine-id", "auth", "mitm", "tunnel", "tailscale", "headroom", ".env", "settings.json", "config.json"];
const TRANSIENT_DIRECTORIES = new Set(["runtime", "node", "app", "node_modules", "update"]);
const SOURCE_LOCK = ".kitsune-router-migration.lock";
const INCOMPLETE = ".kitsune-router-migration-incomplete";
// These are live process proofs/ownership markers, never configuration. In
// particular only custom-server.js may mint the peer token used by its verifier.
const PROCESS_ONLY_ENV = new Set(["PEER_TOKEN", "MANAGED_SHUTDOWN", "PROXY_MANAGED"]);
const INTERNAL_ENV = /^(?:KITSUNE_ROUTER_|ZENROUTER_|NINEROUTER_|NINE_ROUTER_)(.+)$/;
const LOCATION_ENV = new Set(["DATA_DIR", "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA"]);

// Compatibility is confined to startup migration, not individual consumers.
// An explicitly supplied new name (even an empty value) always wins. Never
// rewrite persisted ciphertext, authentication salts, or operator env files.
function migrateLegacyEnvironment(env = process.env) {
  for (const prefix of ["ZENROUTER_", "NINEROUTER_", "NINE_ROUTER_"]) {
    for (const key of Object.keys(env)) {
      if (!key.startsWith(prefix)) continue;
      const suffix = key.slice(prefix.length);
      if (!/^[A-Z0-9_]+$/.test(suffix) || ["MIGRATE_FROM", "MIGRATION"].includes(suffix) || PROCESS_ONLY_ENV.has(suffix)) continue;
      const canonical = `KITSUNE_ROUTER_${suffix}`;
      if (!(canonical in env)) env[canonical] = env[key];
    }
  }
  return env;
}

function loadDirectoryEnvironment(directory, env) {
  const file = path.join(directory, ".env");
  if (!exists(file)) return;
  assertRegularFile(file);
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    const suffix = key.match(INTERNAL_ENV)?.[1];
    if (key === "NEXT_MANUAL_SIG_HANDLE" || PROCESS_ONLY_ENV.has(suffix) || ["MIGRATE_FROM", "MIGRATION"].includes(suffix)) continue;
    // The already resolved directory must not change under subsequent imports.
    if (LOCATION_ENV.has(key) || key in env) continue;
    let value = raw.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "").trimEnd();
    env[key] = value;
  }
  migrateLegacyEnvironment(env);
}

function exists(file) {
  try { fs.lstatSync(file); return true; } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function assertDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Refusing symbolic-link or non-directory application state");
  }
}

function assertRegularFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) {
    throw new Error("Refusing symbolic-link, hard-linked or non-regular application state");
  }
  return stat;
}

function assertReady(directory) {
  if (exists(`${directory}.migration.lock`) || exists(path.join(directory, INCOMPLETE)) || exists(path.join(directory, SOURCE_LOCK))) {
    throw new Error("Application state migration is in progress or incomplete; original state is retained, review the migration before starting");
  }
}

function hasState(directory) {
  if (!exists(directory)) return false;
  assertDirectory(directory);
  return STATE_FILES.some((file) => exists(path.join(directory, file)));
}

function canonicalPath(file) {
  if (exists(file)) return fs.realpathSync(file);
  return path.join(canonicalPath(path.dirname(file)), path.basename(file));
}

function syncFile(file) {
  // FlushFileBuffers on Windows requires a writable file handle; POSIX
  // directory fsync uses a read-only directory descriptor.
  const flags = fs.lstatSync(file).isDirectory() ? fs.constants.O_RDONLY : fs.constants.O_RDWR;
  const fd = fs.openSync(file, flags | (fs.constants.O_NOFOLLOW || 0));
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function syncDirectories(directory, { skipInstallerArtifacts = false } = {}) {
  if (process.platform === "win32") return;
  for (const name of fs.readdirSync(directory)) {
    if (skipInstallerArtifacts && TRANSIENT_DIRECTORIES.has(name)) continue;
    const child = path.join(directory, name);
    if (fs.lstatSync(child).isDirectory()) syncDirectories(child);
  }
  syncFile(directory);
}

function hasDatabase(directory) {
  return [path.join("db", "data.sqlite"), "db.json"].some(file => exists(path.join(directory, file)));
}

function readCompletedMigration(directory) {
  const manifest = path.join(directory, ".migration.json");
  if (!exists(manifest)) return null;
  assertRegularFile(manifest);
  const metadata = JSON.parse(fs.readFileSync(manifest, "utf8"));
  return metadata.version === 1 && metadata.product === "Kitsune Router" && metadata.originalRetained === true ? metadata : null;
}

function transientTargetIdentity(directory) {
  if (!exists(directory)) return null;
  assertDirectory(directory);
  const names = fs.readdirSync(directory).sort();
  // Official installers download the managed runtime/source before launching
  // this hook. Those exact directories are regenerable, not an installation's
  // persistent state. An arbitrary empty directory is NOT this exception.
  if (!names.length || names.some(name => !TRANSIENT_DIRECTORIES.has(name))) return null;
  const root = fs.lstatSync(directory);
  const entries = names.map(name => {
    const file = path.join(directory, name);
    assertDirectory(file);
    const stat = fs.lstatSync(file);
    return { name, dev: stat.dev, ino: stat.ino };
  });
  return { dev: root.dev, ino: root.ino, entries };
}

function defaultPath(name, { env, home, platform }) {
  const paths = platform === "win32" ? path.win32 : path.posix;
  return platform === "win32"
    ? paths.join(env.APPDATA || paths.join(home, "AppData", "Roaming"), name)
    : paths.join(home, `.${name}`);
}

function retained(relative) {
  const parts = relative.split(path.sep);
  const database = path.join("db", "data.sqlite");
  return !TRANSIENT_DIRECTORIES.has(parts[0])
    && !parts.some((part) => part.endsWith(".sqljs-owner") || part === SOURCE_LOCK || part === INCOMPLETE)
    && !/(?:\.pid|\.sock|\.tmp)$/.test(relative)
    && ![`${database}-wal`, `${database}-shm`, `${database}-journal`].includes(relative)
    && relative !== path.join("mitm", ".mitm.lock");
}

function digestFile(file, destination) {
  const initial = assertRegularFile(file);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  let out;
  try {
    const opened = fs.fstatSync(fd);
    if (opened.dev !== initial.dev || opened.ino !== initial.ino || !opened.isFile() || opened.nlink > 1) throw new Error("Legacy state changed while opening; stop the application and retry");
    if (destination) {
      out = fs.openSync(destination, "wx", 0o600);
      // Retain executable helpers (bin/cloudflared, bin/tailscale) without
      // copying their old group/world permissions into the new installation.
      if (process.platform !== "win32") fs.fchmodSync(out, initial.mode & 0o111 ? 0o700 : 0o600);
    }
    const hash = crypto.createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let size = 0;
    let bytes;
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytes));
      if (out !== undefined) {
        let offset = 0;
        while (offset < bytes) offset += fs.writeSync(out, buffer, offset, bytes - offset);
      }
      size += bytes;
    }
    const final = fs.fstatSync(fd);
    if (size !== initial.size || final.size !== initial.size || final.mtimeMs !== initial.mtimeMs || final.ctimeMs !== initial.ctimeMs) throw new Error("Legacy state changed while reading; stop the application and retry");
    if (out !== undefined) fs.fsyncSync(out);
    return { size, hash: hash.digest("hex") };
  } finally {
    if (out !== undefined) fs.closeSync(out);
    fs.closeSync(fd);
  }
}

function inventory(directory, { includeWal = false } = {}) {
  const entries = [];
  function walk(relative) {
    const absolute = path.join(directory, relative);
    const stat = fs.lstatSync(absolute);
    // Check the link itself before filtering: never follow a link to secrets
    // outside the installation, even if it appears to be a database directory.
    if (stat.isSymbolicLink()) throw new Error("Legacy application state contains a symbolic link; review it before migration");
    if (!stat.isDirectory() && !stat.isFile()) throw new Error("Legacy application state contains a special file; stop the old application first");
    if (relative && !retained(relative) && !(includeWal && /\.sqlite-(?:wal|journal)$/.test(relative))) return;
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) walk(path.join(relative, name));
    } else {
      entries.push({ file: relative, ...digestFile(absolute) });
    }
  }
  walk("");
  return entries;
}

function assertStopped(source) {
  if (exists(path.join(source, ".runtime-secrets.lock"))) throw new Error("Legacy runtime secrets setup is locked; stop the other startup before migrating");
  for (const relative of [".pid", "server.pid", "zenrouter.pid", "9router.pid", "kitsune-router.pid", "mitm/.mitm.pid", "tunnel/cloudflared.pid", "tunnel/tailscale.pid", "tailscale/tailscaled.pid", "headroom/proxy.pid"]) {
    const file = path.join(source, relative);
    if (!exists(file)) continue;
    assertRegularFile(file);
    const pid = Number(fs.readFileSync(file, "utf8").trim());
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Unrecognized legacy process marker; review it before migration");
    try { process.kill(pid, 0); } catch (error) {
      if (error.code === "ESRCH") continue;
      throw new Error("Cannot establish whether the legacy application has stopped");
    }
    throw new Error("Stop ZenRouter and its background helpers before migrating to Kitsune Router");
  }
  if (exists(path.join(source, "db", ".sqljs-owner")) || exists(path.join(source, "db", "data.sqlite.sqljs-owner"))) {
    throw new Error("Legacy sql.js ownership marker needs operator review before migration");
  }
  const database = path.join(source, "db", "data.sqlite");
  const files = [database, `${database}-wal`, `${database}-shm`, `${database}-journal`].filter(exists);
  for (const file of files) assertRegularFile(file);
  if (exists(`${database}-journal`) && fs.statSync(`${database}-journal`).size > 0) {
    throw new Error("Legacy database has a rollback journal; recover and stop the old application before migrating");
  }
  if (!files.length) return;
  // Linux can identify an open SQLite inode, including alternate/hard-link paths.
  if (process.platform === "linux") {
    const identities = files.map((file) => fs.statSync(file));
    for (const pid of fs.readdirSync("/proc").filter((entry) => /^\d+$/.test(entry))) {
      let descriptors;
      try { descriptors = fs.readdirSync(`/proc/${pid}/fd`); } catch (error) {
        if (["ENOENT", "ESRCH"].includes(error.code)) continue;
        if (error.code === "EACCES" || error.code === "EPERM") {
          // Other users' processes cannot normally open this user's private
          // state. Same-user descriptors must remain inspectable.
          try { if (fs.statSync(`/proc/${pid}`).uid !== process.getuid()) continue; } catch { continue; }
        }
        throw new Error("Cannot inspect legacy database ownership; stop the old application and retry");
      }
      for (const descriptor of descriptors) {
        let stat;
        try { stat = fs.statSync(`/proc/${pid}/fd/${descriptor}`); } catch (error) {
          if (["ENOENT", "ESRCH"].includes(error.code)) continue;
          if (["EACCES", "EPERM"].includes(error.code)) {
            try { if (fs.statSync(`/proc/${pid}`).uid !== process.getuid()) continue; } catch { continue; }
          }
          throw new Error("Cannot inspect legacy database ownership; stop the old application and retry");
        }
        if (identities.some((file) => file.ino === stat.ino && file.dev === stat.dev)) {
          throw new Error("Legacy database is open in another process; stop it before migration");
        }
      }
    }
  } else if (process.platform === "darwin") {
    try {
      const output = execFileSync("/usr/sbin/lsof", ["-nP", "-t", "--", ...files], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] });
      if (output.trim()) throw new Error("Legacy database is open in another process; stop it before migration");
    } catch (error) {
      if (error.status !== 1 || String(error.stderr || "").trim() || String(error.stdout || "").trim()) throw new Error("Cannot establish exclusive legacy database ownership; stop the old application and retry");
    }
  } else if (process.platform === "win32") {
    // Without a portable handle inventory we cannot safely distinguish an idle
    // WAL writer from crash recovery. Ask the operator to close it cleanly.
    if (exists(`${database}-wal`)) throw new Error("Legacy WAL state needs a clean shutdown of the old application before Windows migration");
    const literals = files.map((file) => `'${file.replaceAll("'", "''")}'`).join(",");
    const script = `$ErrorActionPreference='Stop'; foreach ($p in @(${literals})) { $f=[System.IO.File]::Open($p,'Open','Read','None'); $f.Dispose() }`;
    try {
      execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, timeout: 5000, stdio: "ignore" });
    } catch { throw new Error("Cannot establish exclusive legacy database ownership; stop the old application and retry"); }
  } else {
    throw new Error("Automatic migration cannot establish legacy database ownership on this platform");
  }
}

function snapshotDatabase(source, destination) {
  let openDatabase;
  try {
    // Keep Node's built-in literal/external for tracing. Only Bun needs a
    // runtime loader: Node-targeted bundlers cannot resolve bun:sqlite, and a
    // dynamic require(expression) creates an unsafe webpack context module.
    const sqlite = process.versions.bun
      ? nodeModule.createRequire(process.execPath)("bun:sqlite")
      : require("node:sqlite");
    openDatabase = process.versions.bun
      ? (file) => new sqlite.Database(file, { readonly: true, create: false })
      : (file) => new sqlite.DatabaseSync(file, { readOnly: true });
  } catch {
    throw new Error("Automatic SQLite migration needs Node.js with node:sqlite enabled or Bun; no state was replaced");
  }
  const header = Buffer.alloc(16);
  const fd = fs.openSync(source, "r");
  try { fs.readSync(fd, header, 0, header.length, 0); } finally { fs.closeSync(fd); }
  if (header.toString("binary") !== "SQLite format 3\0") throw new Error("Legacy database is empty or has an invalid SQLite header; refusing a new empty replacement");
  const original = openDatabase(source);
  try {
    const check = original.prepare("PRAGMA quick_check").all();
    if (check.length !== 1 || Object.values(check[0])[0] !== "ok") throw new Error("Legacy database integrity check failed");
    // VACUUM INTO is a SQLite-consistent snapshot, including committed WAL
    // pages. Copying only data.sqlite would silently lose those transactions.
    original.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`);
  } finally { original.close(); }
  const copied = openDatabase(destination);
  try {
    const check = copied.prepare("PRAGMA quick_check").all();
    if (check.length !== 1 || Object.values(check[0])[0] !== "ok") throw new Error("Migrated database integrity check failed");
  } finally { copied.close(); }
  fs.chmodSync(destination, 0o600);
}

function acquireLock(file) {
  let fd;
  try { fd = fs.openSync(file, "wx", 0o600); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("A migration lock already exists; stop other migrations and review the retained original before retrying");
    throw error;
  }
  const identity = fs.fstatSync(fd);
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }) + "\n");
    fs.fsyncSync(fd);
  } catch (error) { fs.closeSync(fd); fs.unlinkSync(file); throw error; }
  return () => {
    fs.closeSync(fd);
    // A replaced lock is never ours to remove.
    if (exists(file)) {
      const current = fs.lstatSync(file);
      if (current.dev === identity.dev && current.ino === identity.ino) fs.unlinkSync(file);
    }
  };
}

function migrateDirectory(source, target, { preserveInstallerArtifacts = false } = {}) {
  source = path.resolve(source);
  target = path.resolve(target);
  assertDirectory(source);
  const realSource = fs.realpathSync(source);
  const relative = path.relative(realSource, canonicalPath(target));
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) throw new Error("Migration target must not be inside the legacy source");
  const installerTarget = preserveInstallerArtifacts ? transientTargetIdentity(target) : null;
  if (exists(target) && !installerTarget) throw new Error("Migration target already exists; refusing to merge or overwrite state");
  assertStopped(source);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const releaseTarget = acquireLock(`${target}.migration.lock`);
  let releaseSource;
  const stage = `${target}.migration-${crypto.randomUUID()}`;
  const scratch = `${stage}.snapshot`;
  let staged = false;
  let scratched = false;
  let committed = false;
  try {
    if (installerTarget
      ? JSON.stringify(transientTargetIdentity(target)) !== JSON.stringify(installerTarget)
      : exists(target)) throw new Error("Migration target appeared or changed concurrently; refusing replacement");
    releaseSource = acquireLock(path.join(source, SOURCE_LOCK));
    assertStopped(source);
    const before = inventory(source, { includeWal: true });
    const databaseName = path.join("db", "data.sqlite");
    if (exists(path.join(source, "db")) && !exists(path.join(source, databaseName)) && !exists(path.join(source, "db.json"))) {
      throw new Error("Legacy database directory has no database; recover the original state instead of starting empty");
    }
    if (!exists(path.join(source, databaseName)) && exists(path.join(source, "db", ".migrated-from-json"))) {
      throw new Error("Legacy SQLite database is missing after JSON import; recover the original rather than importing stale JSON or starting empty");
    }
    // The application's historical JSON reader treats parse errors as absence.
    // Refuse those here rather than publishing an apparently fresh install.
    for (const file of ["db.json", "usage.json", "disabledModels.json", "request-details.json", "secrets.json"]) {
      if (!exists(path.join(source, file))) continue;
      let parsed;
      try { parsed = JSON.parse(fs.readFileSync(path.join(source, file), "utf8")); }
      catch { throw new Error(`Legacy ${file} is unreadable or invalid; original state retained for recovery`); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`Legacy ${file} has an invalid state format; refusing an empty replacement`);
    }
    fs.mkdirSync(stage, { mode: 0o700 });
    staged = true;
    fs.mkdirSync(scratch, { mode: 0o700 });
    scratched = true;
    for (const entry of before) {
      const isDatabase = entry.file === databaseName || entry.file === `${databaseName}-wal`;
      if (!isDatabase && !retained(entry.file)) continue;
      const destination = path.join(isDatabase ? scratch : stage, entry.file);
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      if (digestFile(path.join(source, entry.file), destination).hash !== entry.hash) throw new Error("Legacy state changed while copying; retry after stopping the application");
    }
    const database = path.join(source, "db", "data.sqlite");
    if (exists(database)) {
      fs.mkdirSync(path.join(stage, "db"), { recursive: true, mode: 0o700 });
      // SQLite only opens the private scratch copy: even read-only SQLite may
      // create/rebuild SHM files beside a WAL database. Never touch the original.
      snapshotDatabase(path.join(scratch, databaseName), path.join(stage, databaseName));
    } else if (exists(`${database}-wal`)) {
      throw new Error("Legacy WAL exists without its database; refusing an empty replacement");
    }
    if (JSON.stringify(before) !== JSON.stringify(inventory(source, { includeWal: true }))) {
      throw new Error("Legacy state changed during migration; original state remains untouched");
    }
    assertStopped(source);
    fs.writeFileSync(path.join(stage, ".migration.json"), JSON.stringify({
      version: 1, product: "Kitsune Router", source: realSource, migratedAt: new Date().toISOString(),
      originalRetained: true, files: inventory(stage),
    }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    // Directory rename can overwrite an EMPTY target on POSIX. Reserve ours
    // with mkdir (atomic no-replace), then publish under the destination lock.
    // The marker survives a crash/failed copy so nobody opens partial state.
    if (installerTarget) {
      if (JSON.stringify(transientTargetIdentity(target)) !== JSON.stringify(installerTarget)) throw new Error("Installer-only target changed during migration; refusing to merge persistent state");
    } else fs.mkdirSync(target, { mode: 0o700 });
    if (process.platform !== "win32") fs.chmodSync(target, 0o700);
    fs.writeFileSync(path.join(target, INCOMPLETE), "Original state retained; migration publication incomplete.\n", { flag: "wx", mode: 0o600 });
    syncFile(path.join(target, INCOMPLETE));
    if (process.platform !== "win32") {
      syncFile(target);
      syncFile(path.dirname(target));
    }
    for (const entry of inventory(stage)) {
      const destination = path.join(target, entry.file);
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      fs.copyFileSync(path.join(stage, entry.file), destination, fs.constants.COPYFILE_EXCL);
      if (process.platform !== "win32") fs.chmodSync(destination, fs.statSync(path.join(stage, entry.file)).mode & 0o111 ? 0o700 : 0o600);
      if (digestFile(destination).hash !== entry.hash) throw new Error("Migration publication verification failed; original state is retained");
      syncFile(destination);
    }
    if (JSON.stringify(before) !== JSON.stringify(inventory(source, { includeWal: true }))) throw new Error("Legacy state changed during publication; original state and incomplete target retained for review");
    assertStopped(source);
    syncDirectories(target, { skipInstallerArtifacts: true });
    fs.unlinkSync(path.join(target, INCOMPLETE));
    if (process.platform !== "win32") syncFile(target);
    committed = true;
  } finally {
    // Only remove the private, randomly named directories created by this call.
    // An incomplete destination is deliberately retained for operator review.
    try {
      if (scratched) fs.rmSync(scratch, { recursive: true, force: true });
      if (staged) fs.rmSync(stage, { recursive: true, force: true });
    } finally {
      try { releaseSource?.(); } finally { releaseTarget(); }
    }
  }
  if (!committed) throw new Error("Migration did not complete; original state is retained");
  return target;
}

function resolveDataDirectory({ env = process.env, home = os.homedir(), platform = process.platform } = {}) {
  migrateLegacyEnvironment(env);
  const paths = platform === "win32" ? path.win32 : path.posix;
  const ready = (directory) => {
    assertReady(directory);
    if (exists(directory)) assertDirectory(directory);
    loadDirectoryEnvironment(directory, env);
    return directory;
  };
  if (env.DATA_DIR) return ready(paths.resolve(env.DATA_DIR));
  const options = { env, home, platform };
  const target = defaultPath(APP_DIRECTORY, options);
  const selectedSource = env.KITSUNE_ROUTER_MIGRATE_FROM ? paths.resolve(env.KITSUNE_ROUTER_MIGRATE_FROM) : null;
  const migrate = (preserveInstallerArtifacts = false) => {
    const candidates = selectedSource
      ? [selectedSource]
      : LEGACY_DIRECTORIES.map((name) => defaultPath(name, options)).filter(hasState);
    if (candidates.length > 1) throw new Error("Multiple legacy installations found; select one with KITSUNE_ROUTER_MIGRATE_FROM");
    if (!candidates.length) return ready(target);
    if (!hasState(candidates[0])) throw new Error("Selected legacy installation has no recognized application state");
    return ready(migrateDirectory(candidates[0], target, { preserveInstallerArtifacts }));
  };
  assertReady(target);
  if (exists(target)) {
    assertDirectory(target);
    const migration = readCompletedMigration(target);
    const migrated = Boolean(migration);
    if (env.KITSUNE_ROUTER_MIGRATION !== "skip" && transientTargetIdentity(target)) return migrate(true);
    if (env.KITSUNE_ROUTER_MIGRATION !== "skip" && selectedSource) {
      // An explicit source must not silently select unrelated target state,
      // even if postinstall already created secrets or a database there. A
      // matching completed migration may reopen without copying old state over
      // newer activity; its source may since have been moved or removed.
      const sameSource = migrated && typeof migration.source === "string" && paths.isAbsolute(migration.source)
        && paths.relative(migration.source, canonicalPath(selectedSource)) === "";
      if (!sameSource) throw new Error("Selected legacy installation conflicts with the existing target; refusing to ignore KITSUNE_ROUTER_MIGRATE_FROM or merge or overwrite state");
    }
    if (!hasDatabase(target) && !migrated && env.KITSUNE_ROUTER_MIGRATION !== "skip" && LEGACY_DIRECTORIES.some((name) => hasState(defaultPath(name, options)))) {
      throw new Error("An existing target without a database is beside legacy state; refusing an empty replacement or overwrite");
    }
    if (hasState(target) || migrated || env.KITSUNE_ROUTER_MIGRATION === "skip") return ready(target);
    if (env.KITSUNE_ROUTER_MIGRATE_FROM || LEGACY_DIRECTORIES.some((name) => hasState(defaultPath(name, options)))) throw new Error("An empty or unrecognized target already exists beside legacy state; refusing an empty replacement or overwrite");
    return ready(target);
  }
  if (env.KITSUNE_ROUTER_MIGRATION === "skip") return ready(target);
  return migrate();
}

// Loading this hook has no filesystem side effects; custom launchers can apply
// aliases before any module captures a performance/security override.
migrateLegacyEnvironment();

module.exports = { resolveDataDirectory, migrateDirectory, migrateLegacyEnvironment, APP_DIRECTORY };
