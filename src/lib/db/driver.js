import { ensureDirs, DATA_FILE } from "./paths.js";
import { asDatabaseCorruptionError } from "./integrity.js";

// Use global to survive Next.js dev hot-reload (module state resets on reload)
if (!global._dbAdapter) global._dbAdapter = { instance: null, initPromise: null, logged: false };
const state = global._dbAdapter;

function stopOnCorruption(error) {
  const corruption = asDatabaseCorruptionError(error, DATA_FILE);
  if (corruption) throw corruption;
}

async function tryBunSqlite() {
  // Bun runtime only — built-in, no install needed
  if (!process.versions.bun) return null;
  try {
    const { createBunSqliteAdapter } = await import("./adapters/bunSqliteAdapter.js");
    return await createBunSqliteAdapter(DATA_FILE);
  } catch (e) {
    stopOnCorruption(e);
    console.warn(`[DB] bun:sqlite unavailable: ${e.message}`);
    return null;
  }
}

async function tryBetterSqlite() {
  // Skip on Bun — better-sqlite3 native bindings unsupported
  if (process.versions.bun) return null;
  try {
    const { createBetterSqliteAdapter } = await import("./adapters/betterSqliteAdapter.js");
    return createBetterSqliteAdapter(DATA_FILE);
  } catch (e) {
    stopOnCorruption(e);
    console.warn(`[DB] better-sqlite3 unavailable: ${e.message}`);
    return null;
  }
}

async function tryNodeSqlite() {
  // Built-in since Node 22.5.0 — no install needed. Skip under Bun (no node:sqlite).
  if (process.versions.bun) return null;
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 22 || (maj === 22 && min < 5)) return null;
  try {
    const { createNodeSqliteAdapter } = await import("./adapters/nodeSqliteAdapter.js");
    return await createNodeSqliteAdapter(DATA_FILE);
  } catch (e) {
    stopOnCorruption(e);
    console.warn(`[DB] node:sqlite unavailable: ${e.message}`);
    return null;
  }
}

async function trySqlJs() {
  try {
    if (process.env.ZENROUTER_SQLJS_SINGLE_PROCESS !== "true") {
      throw Object.assign(new Error("sql.js requires ZENROUTER_SQLJS_SINGLE_PROCESS=true and exclusive single-process DATA_DIR ownership; use a native SQLite driver for workers"), { code: "SQLJS_SINGLE_PROCESS_REQUIRED" });
    }
    const { createSqlJsAdapter } = await import("./adapters/sqljsAdapter.js");
    return await createSqlJsAdapter(DATA_FILE);
  } catch (e) {
    if (e.code === "SQLJS_SINGLE_PROCESS_REQUIRED" || e.code === "SQLJS_EXCLUSIVE_OWNER") throw e;
    stopOnCorruption(e);
    console.warn(`[DB] sql.js unavailable: ${e.message}`);
    return null;
  }
}

async function initAdapter() {
  ensureDirs();
  const { existsSync } = await import("node:fs");
  if (existsSync(`${DATA_FILE}.sqljs-owner`)) {
    throw Object.assign(new Error("[DB] sql.js exclusive owner exists; refuse native/sql.js mixed writers"), { code: "SQLJS_EXCLUSIVE_OWNER" });
  }
  // Order per runtime:
  //   Bun:  bun:sqlite → sql.js
  //   Node: better-sqlite3 → node:sqlite (≥22.5) → sql.js
  let adapter = await tryBunSqlite();
  if (!adapter) adapter = await tryBetterSqlite();
  if (!adapter) adapter = await tryNodeSqlite();
  if (!adapter) adapter = await trySqlJs();
  if (!adapter) throw new Error("[DB] No SQLite driver available (bun/better/node/sql.js all failed)");

  if (!state.logged) {
    console.log(`[DB] Driver: ${adapter.driver} | file: ${DATA_FILE}`);
    state.logged = true;
  }

  const { runMigrationOnce } = await import("./migrate.js");
  try {
    await runMigrationOnce(adapter);
    const { initializeUsagePersistence } = await import("./repos/usageRepo.js");
    initializeUsagePersistence(adapter);
    return adapter;
  } catch (error) {
    adapter.close();
    throw error;
  }
}

export async function getAdapter() {
  if (state.instance) return state.instance;
  if (!state.initPromise) state.initPromise = initAdapter().then((a) => { state.instance = a; return a; });
  return state.initPromise;
}

export { configureDbLifecycle } from "./helpers/adapterLifecycle.js";

export async function closeDb() {
  const adapter = state.instance || (state.initPromise ? await state.initPromise : null);
  if (!adapter) return;
  adapter.checkpoint?.();
  adapter.flushDurable?.();
  await adapter.close();
  state.instance = null;
  state.initPromise = null;
}

export function getAdapterSync() {
  if (!state.instance) throw new Error("[DB] adapter not initialized — await getAdapter() first");
  return state.instance;
}
