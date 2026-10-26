import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { getScopedCache } from "../helpers/scopedCache.js";
import { bumpScopeRevisions, invalidateCommittedScopes } from "../helpers/cacheRevisions.js";

export function invalidateComboCache(db) {
  if (db) invalidateCommittedScopes(db, ["combos"]);
}

function rowToCombo(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    models: parseJson(row.models, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getCombos() {
  const db = await getAdapter();
  return getScopedCache(db, "combos").get(["combos", "internal", "list"], ["combos"], () =>
    db.all(`SELECT * FROM combos ORDER BY createdAt ASC`).map(rowToCombo));
}

export async function getComboById(id) {
  const db = await getAdapter();
  return getScopedCache(db, "combos").get(["combos", "internal", "id", id], ["combos"], () =>
    rowToCombo(db.get(`SELECT * FROM combos WHERE id = ?`, [id])));
}

export async function getComboByName(name) {
  const db = await getAdapter();
  return getScopedCache(db, "combos").get(["combos", "internal", "name", name], ["combos"], () =>
    rowToCombo(db.get(`SELECT * FROM combos WHERE name = ?`, [name])));
}

export async function createCombo(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const combo = {
    id: uuidv4(), name: data.name, kind: data.kind || null,
    models: data.models || [], createdAt: now, updatedAt: now,
  };
  db.transaction(() => {
    db.run(`INSERT INTO combos(id, name, kind, models, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
      [combo.id, combo.name, combo.kind, stringifyJson(combo.models), combo.createdAt, combo.updatedAt]);
    bumpScopeRevisions(db, ["combos"]);
  });
  invalidateComboCache(db);
  return combo;
}

export async function updateCombo(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM combos WHERE id = ?`, [id]);
    if (!row) return;
    result = { ...rowToCombo(row), ...data, id, updatedAt: new Date().toISOString() };
    db.run(`UPDATE combos SET name = ?, kind = ?, models = ?, updatedAt = ? WHERE id = ?`,
      [result.name, result.kind, stringifyJson(result.models || []), result.updatedAt, id]);
    bumpScopeRevisions(db, ["combos"]);
  });
  if (result) invalidateComboCache(db);
  return result;
}

export async function deleteCombo(id) {
  const db = await getAdapter();
  let removed = false;
  db.transaction(() => {
    removed = (db.run(`DELETE FROM combos WHERE id = ?`, [id])?.changes ?? 0) > 0;
    if (removed) bumpScopeRevisions(db, ["combos"]);
  });
  if (removed) invalidateComboCache(db);
  return removed;
}
