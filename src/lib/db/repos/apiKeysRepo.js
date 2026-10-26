import { v4 as uuidv4 } from "uuid";
import { getAdapter, getAdapterSync } from "../driver.js";
import { getScopedCache } from "../helpers/scopedCache.js";
import { bumpScopeRevisions } from "../helpers/cacheRevisions.js";

function rowToKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    machineId: row.machineId,
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt,
  };
}

function keyCache(db) {
  return getScopedCache(db, "apiKeys", { maxEntries: 512, maxBytes: 256 * 1024, ttlMs: 30_000 });
}

export function invalidateApiKeyCache() {
  try { keyCache(getAdapterSync()).invalidate(); } catch {}
}

export async function getApiKeys() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM apiKeys ORDER BY createdAt ASC`);
  return rows.map(rowToKey);
}

export async function getApiKeyById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  return rowToKey(row);
}

export async function createApiKey(name, machineId) {
  if (!machineId) throw new Error("machineId is required");
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);
  const apiKey = {
    id: uuidv4(),
    name,
    key: result.key,
    machineId,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  db.transaction(() => {
    db.run(`INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES(?, ?, ?, ?, ?, ?)`,
      [apiKey.id, apiKey.key, apiKey.name, apiKey.machineId, 1, apiKey.createdAt]);
    bumpScopeRevisions(db, ["apiKeys"]);
  });
  invalidateApiKeyCache();
  return apiKey;
}

export async function updateApiKey(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToKey(row), ...data, id };
    db.run(`UPDATE apiKeys SET key = ?, name = ?, machineId = ?, isActive = ? WHERE id = ?`,
      [merged.key, merged.name, merged.machineId, merged.isActive ? 1 : 0, id]);
    bumpScopeRevisions(db, ["apiKeys"]);
    result = merged;
  });
  if (result) invalidateApiKeyCache();
  return result;
}

export async function deleteApiKey(id) {
  const db = await getAdapter();
  let removed = false;
  db.transaction(() => {
    removed = (db.run(`DELETE FROM apiKeys WHERE id = ?`, [id])?.changes ?? 0) > 0;
    if (removed) bumpScopeRevisions(db, ["apiKeys"]);
  });
  if (removed) invalidateApiKeyCache();
  return removed;
}

export async function validateApiKey(key) {
  if (typeof key !== "string" || !key || key.length > 4096) return false;
  const db = await getAdapter();
  return keyCache(db).get(["apiKeys", "validate-active", key], ["apiKeys"], () => {
    const row = db.get(`SELECT isActive FROM apiKeys WHERE key = ?`, [key]);
    return !!(row && (row.isActive === 1 || row.isActive === true));
  }, { retain: value => value === true });
}
