import fs from "node:fs";
import path from "node:path";
import { LEGACY_FILES, DB_DIR, DATA_FILE } from "./paths.js";
import { TABLES, buildCreateTableSql, SCHEMA_VERSION } from "./schema.js";
import { MIGRATIONS, latestVersion } from "./migrations/index.js";
import { getMetaSync, setMetaSync } from "./helpers/metaStore.js";
import { makeBackupDir, backupFile, backupDbLite, pruneOldBackups } from "./backup.js";
import { getAppVersion } from "./version.js";
import { stringifyJson } from "./helpers/jsonCol.js";
import { assertDatabaseIntegrity } from "./integrity.js";
import durableUsageMigration from "./migrations/002-durable-usage.js";
import { preserveLegacyBrandSettings } from "./helpers/brandSettings.js";
import { canonicalUsageTimestamp } from "./helpers/usageTimestamp.js";

// Marker file: prevents re-importing legacy JSON when user wipes data.sqlite.
const MIGRATED_MARKER = path.join(DB_DIR, ".migrated-from-json");

// Track per-adapter so reusing same adapter skips re-run, but new adapter (after reset) re-runs.
const _migratedAdapters = new WeakSet();

function secureBackupPermissions(file, directory = false) {
  if (!file || process.platform === "win32") return;
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(fd);
    if (directory ? !stat.isDirectory() : (!stat.isFile() || stat.nlink > 1)) {
      throw new Error("Refusing non-regular or hard-linked backup");
    }
    const mode = directory ? 0o700 : 0o600;
    fs.fchmodSync(fd, mode);
    if ((fs.fstatSync(fd).mode & 0o777) !== mode) throw new Error("Backup permissions are not owner-only");
  } catch (cause) {
    const error = new Error("[DB] Cannot secure backup permissions", { cause });
    error.code = "DB_BACKUP_PERMISSIONS";
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function assertNewBackup(file) {
  try {
    fs.lstatSync(file);
    throw new Error("Backup already exists; refusing overwrite");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

// Thrown when row-count assertion fails. Outer transaction rolls back,
// legacy db.json kept intact, marker not written → next boot retries.
export class MigrationAborted extends Error {
  constructor(message, droppedRows) {
    super(message);
    this.name = "MigrationAborted";
    this.droppedRows = droppedRows;
  }
}

// Insert rows one-by-one, collect failures, then assert COUNT(*) matches input length.
function importWithAssertion(adapter, tableName, rows, insertFn, rowMeta) {
  const dropped = [];
  for (const row of rows) {
    try { insertFn(row); }
    catch (err) { dropped.push({ ...rowMeta(row), reason: err.message }); }
  }
  const inserted = adapter.get(`SELECT COUNT(*) as c FROM ${tableName}`)?.c ?? 0;
  if (inserted !== rows.length) {
    console.warn(`[DB][migrate] ${tableName} row-count mismatch: expected ${rows.length}, got ${inserted}. Dropped:`, dropped);
    throw new MigrationAborted(`${tableName} row-count mismatch: expected ${rows.length}, got ${inserted}`, dropped);
  }
}

function readLegacyJson(file) {
  let source;
  try { source = fs.lstatSync(file); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (!source.isFile() || source.nlink > 1) throw new Error("Refusing non-regular or hard-linked backup source");
  const bytes = fs.readFileSync(file, "utf-8");
  try {
    const data = JSON.parse(bytes);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new TypeError();
    return data;
  } catch {
    // JSON.parse diagnostics can quote credential-bearing input. Keep the
    // original file and refuse all schema/import stamps with a fixed message.
    throw Object.assign(new Error(`[DB] Invalid legacy JSON object: ${file}. Preserve and repair this file before retrying migration.`), { code: "DB_LEGACY_INVALID_JSON" });
  }
}

function isFreshDb(adapter) {
  // Table _meta may not exist yet on truly fresh DB
  try {
    const row = adapter.get(`SELECT COUNT(*) as c FROM _meta`);
    return !row || row.c === 0;
  } catch {
    return true;
  }
}

// ─── Versioned migrations runner (skip-version safe) ─────────────────────
function runVersionedMigrations(adapter) {
  // Bootstrap _meta first so we can read schemaVersion
  adapter.exec(buildCreateTableSql("_meta", TABLES._meta));

  const current = parseInt(getMetaSync(adapter, "schemaVersion", "0"), 10) || 0;
  const target = latestVersion();
  if (current >= target) return { applied: 0, from: current, to: current };

  const pending = MIGRATIONS.filter((m) => m.version > current);
  let lastApplied = current;
  for (const m of pending) {
    adapter.transaction(() => {
      m.up(adapter);
      setMetaSync(adapter, "schemaVersion", m.version);
    });
    lastApplied = m.version;
    console.log(`[DB][migrate] applied #${m.version} ${m.name}`);
  }
  return { applied: pending.length, from: current, to: lastApplied };
}

// ─── Auto-sync (additive only): add missing tables/columns/indexes ───────
function syncSchemaFromTables(adapter) {
  for (const [tableName, def] of Object.entries(TABLES)) {
    // Create table if absent
    adapter.exec(buildCreateTableSql(tableName, def));

    // Diff columns
    const existing = adapter.all(`PRAGMA table_info(${tableName})`);
    const existingNames = new Set(existing.map((r) => r.name));
    for (const [colName, colDef] of Object.entries(def.columns)) {
      if (!existingNames.has(colName)) {
        // SQLite ADD COLUMN restrictions: no PRIMARY KEY / UNIQUE w/o NULL ok.
        // We strip PRIMARY KEY / UNIQUE since those are only valid at create time.
        const safeDef = colDef
          .replace(/PRIMARY KEY( AUTOINCREMENT)?/i, "")
          .replace(/UNIQUE/i, "")
          .trim();
        try {
          adapter.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${safeDef}`);
          console.log(`[DB][sync] +column ${tableName}.${colName}`);
        } catch (e) {
          console.warn(`[DB][sync] add column ${tableName}.${colName} failed: ${e.message}`);
        }
      }
    }

    // Indexes (idempotent)
    for (const idx of def.indexes || []) {
      try { adapter.exec(idx); } catch {}
    }
  }
}

// ─── Legacy JSON import (one-time) ───────────────────────────────────────
function importLegacyMain(adapter, data) {
  if (!data || typeof data !== "object") return;

  if (data.settings) {
    adapter.run(`INSERT INTO settings(id, data) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`, [stringifyJson(data.settings)]);
  }

  importWithAssertion(adapter, "providerConnections", data.providerConnections || [], (c) => {
    const { id, provider, authType, name, email, priority, isActive, createdAt, updatedAt, ...rest } = c;
    adapter.run(
      `INSERT OR REPLACE INTO providerConnections(id, provider, authType, name, email, priority, isActive, data, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, provider, authType || "oauth", name || null, email || null, priority || null, isActive === false ? 0 : 1, stringifyJson(rest), createdAt || new Date().toISOString(), updatedAt || new Date().toISOString()]
    );
  }, (c) => ({ id: c.id ?? null, provider: c.provider ?? null, name: c.name ?? null }));

  importWithAssertion(adapter, "providerNodes", data.providerNodes || [], (n) => {
    const { id, type, name, createdAt, updatedAt, ...rest } = n;
    adapter.run(
      `INSERT OR REPLACE INTO providerNodes(id, type, name, data, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
      [id, type || null, name || null, stringifyJson(rest), createdAt || new Date().toISOString(), updatedAt || new Date().toISOString()]
    );
  }, (n) => ({ id: n.id ?? null, type: n.type ?? null, name: n.name ?? null }));

  importWithAssertion(adapter, "proxyPools", data.proxyPools || [], (p) => {
    const { id, isActive, testStatus, createdAt, updatedAt, ...rest } = p;
    adapter.run(
      `INSERT OR REPLACE INTO proxyPools(id, isActive, testStatus, data, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
      [id, isActive === false ? 0 : 1, testStatus || "unknown", stringifyJson(rest), createdAt || new Date().toISOString(), updatedAt || new Date().toISOString()]
    );
  }, (p) => ({ id: p.id ?? null }));

  importWithAssertion(adapter, "apiKeys", data.apiKeys || [], (k) => {
    adapter.run(
      `INSERT OR REPLACE INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES(?, ?, ?, ?, ?, ?)`,
      [k.id, k.key, k.name || null, k.machineId || null, k.isActive === false ? 0 : 1, k.createdAt || new Date().toISOString()]
    );
  }, (k) => ({ id: k.id ?? null, name: k.name ?? null }));

  importWithAssertion(adapter, "combos", data.combos || [], (c) => {
    adapter.run(
      `INSERT OR REPLACE INTO combos(id, name, kind, models, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
      [c.id, c.name, c.kind || null, stringifyJson(c.models || []), c.createdAt || new Date().toISOString(), c.updatedAt || new Date().toISOString()]
    );
  }, (c) => ({ id: c.id ?? null, name: c.name ?? null }));

  for (const [alias, model] of Object.entries(data.modelAliases || {})) {
    adapter.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES('modelAliases', ?, ?)`, [alias, stringifyJson(model)]);
  }
  for (const m of data.customModels || []) {
    const k = `${m.providerAlias}|${m.id}|${m.type || "llm"}`;
    adapter.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES('customModels', ?, ?)`, [k, stringifyJson(m)]);
  }
  for (const [tool, mappings] of Object.entries(data.mitmAlias || {})) {
    adapter.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES('mitmAlias', ?, ?)`, [tool, stringifyJson(mappings || {})]);
  }
  for (const [provider, models] of Object.entries(data.pricing || {})) {
    adapter.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES('pricing', ?, ?)`, [provider, stringifyJson(models || {})]);
  }
}

function importLegacyUsage(adapter, data) {
  if (!data || typeof data !== "object") return;
  for (const e of data.history || []) {
    const t = e.tokens || {};
    const originalTimestamp = e.timestamp ?? "";
    const canonical = canonicalUsageTimestamp(originalTimestamp);
    const meta = e.meta && typeof e.meta === "object" && !Array.isArray(e.meta) ? { ...e.meta } : {};
    for (const key of ["inputCost", "cachedCost", "outputCost"]) if (Object.hasOwn(e, key)) meta[key] = e[key];
    if (Object.hasOwn(e, "quote") && !Object.hasOwn(meta, "quote")) meta.quote = e.quote;
    adapter.run(
      `INSERT INTO usageHistory(timestamp, sourceTimestamp, provider, model, connectionId, apiKey, endpoint, promptTokens, completionTokens, cost, status, tokens, meta) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        canonical ?? originalTimestamp,
        canonical !== null && canonical !== originalTimestamp ? originalTimestamp : null,
        e.provider || null, e.model || null, e.connectionId || null, e.apiKey || null, e.endpoint || null,
        t.prompt_tokens || t.input_tokens || 0,
        t.completion_tokens || t.output_tokens || 0,
        e.cost ?? null,
        e.status || "ok",
        stringifyJson(t),
        stringifyJson(meta),
      ]
    );
  }
  for (const [dateKey, day] of Object.entries(data.dailySummary || {})) {
    adapter.run(`INSERT OR REPLACE INTO usageDaily(dateKey, data) VALUES(?, ?)`, [dateKey, stringifyJson(day)]);
  }
  if (typeof data.totalRequestsLifetime === "number") {
    setMetaSync(adapter, "totalRequestsLifetime", data.totalRequestsLifetime);
  }
}

function importLegacyDisabled(adapter, data) {
  if (!data || typeof data.disabled !== "object") return;
  for (const [provider, ids] of Object.entries(data.disabled)) {
    adapter.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES('disabledModels', ?, ?)`, [provider, stringifyJson(ids || [])]);
  }
}

function importLegacyDetails(adapter, data) {
  if (!data || !Array.isArray(data.records)) return;
  for (const r of data.records) {
    adapter.run(
      `INSERT OR REPLACE INTO requestDetails(id, timestamp, provider, model, connectionId, status, data) VALUES(?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.timestamp || new Date().toISOString(), r.provider || null, r.model || null, r.connectionId || null, r.status || null, stringifyJson(r)]
    );
  }
}

// ─── Main entry ──────────────────────────────────────────────────────────
export async function runMigrationOnce(adapter) {
  if (_migratedAdapters.has(adapter)) return;

  // Fail closed before any schema mutation or backup pruning. Recovery is
  // deliberately manual so startup never replaces newer data with a backup.
  assertDatabaseIntegrity(adapter, DATA_FILE);

  // Capture freshness BEFORE migrations stamp _meta (otherwise we'd misclassify
  // a brand-new DB as non-fresh once schemaVersion is written).
  const fresh = isFreshDb(adapter);
  const previousAppVersion = fresh ? null : getMetaSync(adapter, "appVersion", null);

  const alreadyImported = fs.existsSync(MIGRATED_MARKER);
  // Retained JSON is no longer authoritative after SQLite initialization. Do
  // not read obsolete files on every restart, but validate the complete source
  // set before a fresh import so a broken main file cannot be skipped while a
  // valid secondary file publishes the one-time migration marker.
  const inspectLegacy = fresh && !alreadyImported;
  const legacyMain = inspectLegacy ? readLegacyJson(LEGACY_FILES.main) : null;
  const legacyUsage = inspectLegacy ? readLegacyJson(LEGACY_FILES.usage) : null;
  const legacyDisabled = inspectLegacy ? readLegacyJson(LEGACY_FILES.disabled) : null;
  const legacyDetails = inspectLegacy ? readLegacyJson(LEGACY_FILES.details) : null;
  const hasLegacy = !!(legacyMain || legacyUsage || legacyDisabled || legacyDetails);
  const importLegacy = fresh && hasLegacy && !alreadyImported;
  let backupDir;
  const t0 = Date.now();

  if (importLegacy) {
    // Mandatory backup refusal must leave an unstamped DB that can retry after
    // repair. Validate the complete source set before copying any of it, so a
    // later symlink/hardlink cannot strand a partial same-timestamp backup.
    const sources = Object.values(LEGACY_FILES).filter(file => {
      let stat;
      try { stat = fs.lstatSync(file); } catch (error) { if (error.code === "ENOENT") return false; throw error; }
      if (!stat.isFile() || stat.nlink > 1) throw new Error("Refusing non-regular or hard-linked backup source");
      return true;
    });
    backupDir = makeBackupDir("migrate-from-json");
    secureBackupPermissions(backupDir, true);
    for (const file of sources) {
      assertNewBackup(path.join(backupDir, path.basename(file)));
      secureBackupPermissions(backupFile(file, backupDir));
    }
  }

  // Prune stale backups every boot so old oversized backups shrink to KEEP.
  pruneOldBackups();

  // Detect a pending schema change via the central SCHEMA_VERSION const.
  // A lightweight backup is taken BEFORE any schema mutation below.
  const storedSchemaVer = fresh ? 0 : (parseInt(getMetaSync(adapter, "backupSchemaVersion", "0"), 10) || 0);
  const schemaChanging = !fresh && storedSchemaVer < SCHEMA_VERSION;
  if (schemaChanging) {
    try {
      const backupDir = makeBackupDir(`schema-${storedSchemaVer}-to-${SCHEMA_VERSION}`);
      secureBackupPermissions(backupDir, true);
      assertNewBackup(path.join(backupDir, "data.sqlite"));
      // Backup creation stays inside the private DB/backups ancestry. Harden
      // the completed file before pruning or proceeding with schema changes.
      secureBackupPermissions(backupDbLite(adapter, backupDir));
      pruneOldBackups();
      console.log(`[DB][migrate] pre-schema backup ${storedSchemaVer} → ${SCHEMA_VERSION}: ${backupDir}`);
    } catch (e) {
      if (e.code === "DB_BACKUP_PERMISSIONS") throw e;
      console.warn(`[DB][migrate] pre-schema backup failed (continuing): ${e.message}`);
    }
  }

  const initialize = () => {
    runVersionedMigrations(adapter);
    syncSchemaFromTables(adapter);
    adapter.transaction(() => durableUsageMigration.up(adapter));
    setMetaSync(adapter, "backupSchemaVersion", SCHEMA_VERSION);
    if (importLegacy) {
      importLegacyMain(adapter, legacyMain);
      importLegacyUsage(adapter, legacyUsage);
      importLegacyDisabled(adapter, legacyDisabled);
      importLegacyDetails(adapter, legacyDetails);
      setMetaSync(adapter, "appVersion", getAppVersion());
      setMetaSync(adapter, "backupSchemaVersion", SCHEMA_VERSION);
      setMetaSync(adapter, "migratedAt", new Date().toISOString());
    }
    preserveLegacyBrandSettings(adapter, {
      legacyInstallation: importLegacy || (typeof previousAppVersion === "string" && /^0\./.test(previousAppVersion)),
    });
  };
  // Fresh schema stamps and imported rows commit together. Any SQL/import
  // failure rolls back the stamps as well; failed adapters are never memoized.
  try {
    if (fresh) adapter.transaction(initialize);
    else initialize();
  } catch (error) {
    if (error instanceof MigrationAborted) console.error(`[DB][migrate] aborted: ${error.message} | legacy JSON kept | backup: ${backupDir}`);
    throw error;
  }

  if (importLegacy) {
    try { fs.writeFileSync(MIGRATED_MARKER, new Date().toISOString()); } catch {}
    pruneOldBackups();
    console.log(`[DB][migrate] JSON → SQLite in ${Date.now() - t0}ms | legacy JSON kept at DATA_DIR | backup: ${backupDir}`);
    _migratedAdapters.add(adapter);
    return;
  }

  // Track app version for informational purposes only. App version bumps no
  // longer trigger a DB backup — only real schema changes (SCHEMA_VERSION) do.
  const newVer = getAppVersion();
  const oldVer = getMetaSync(adapter, "appVersion", null);
  if (oldVer !== newVer) setMetaSync(adapter, "appVersion", newVer);
  _migratedAdapters.add(adapter);
}
