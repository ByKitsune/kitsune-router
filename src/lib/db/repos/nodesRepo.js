import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { getScopedCache } from "../helpers/scopedCache.js";
import { bumpScopeRevisions, connectionScopes, invalidateCommittedScopes } from "../helpers/cacheRevisions.js";
import { nodeModelOwners } from "../helpers/nodeOwnership.js";

export function invalidateNodeCache(db) {
  if (db) invalidateCommittedScopes(db, ["nodes"]);
}

function rowToNode(row) {
  if (!row) return null;
  const extra = parseJson(row.data, {});
  return {
    ...extra,
    id: row.id,
    type: row.type,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function nodeToRow(n) {
  const { id, type, name, createdAt, updatedAt, ...rest } = n;
  return {
    id,
    type: type ?? null,
    name: name ?? null,
    data: stringifyJson(rest),
    createdAt,
    updatedAt,
  };
}

function upsert(db, n) {
  const r = nodeToRow(n);
  db.run(
    `INSERT INTO providerNodes(id, type, name, data, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       type=excluded.type, name=excluded.name, data=excluded.data, updatedAt=excluded.updatedAt`,
    [r.id, r.type, r.name, r.data, r.createdAt, r.updatedAt]
  );
}

export async function getProviderNodes(filter = {}) {
  const db = await getAdapter();
  const type = filter.type || null;
  return getScopedCache(db, "nodes").get(["providerNodes", "internal", "list", type], ["nodes"], () =>
    db.all(`SELECT * FROM providerNodes${type ? " WHERE type = ?" : ""}`, type ? [type] : []).map(rowToNode));
}

export async function getProviderNodeById(id) {
  const db = await getAdapter();
  return getScopedCache(db, "nodes").get(["providerNodes", "internal", "id", id], ["nodes"], () =>
    rowToNode(db.get(`SELECT * FROM providerNodes WHERE id = ?`, [id])));
}

export async function createProviderNode(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const node = {
    id: data.id || uuidv4(), type: data.type, name: data.name, prefix: data.prefix,
    apiType: data.apiType, baseUrl: data.baseUrl, createdAt: now, updatedAt: now,
  };
  db.transaction(() => { upsert(db, node); bumpScopeRevisions(db, ["nodes"]); });
  invalidateNodeCache(db);
  return node;
}

export async function updateProviderNode(id, data) {
  const db = await getAdapter();
  let result = null;
  let scopes;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM providerNodes WHERE id = ?`, [id]);
    if (!row) return;
    result = { ...rowToNode(row), ...data, id, updatedAt: new Date().toISOString() };
    upsert(db, result);
    scopes = ["nodes"];
    if (["name", "prefix", "apiType", "baseUrl", "type"].some(key => Object.hasOwn(data || {}, key))) {
      for (const account of db.all(`SELECT id, data FROM providerConnections WHERE provider = ?`, [id])) {
        const extra = parseJson(account.data, {});
        const providerSpecificData = { ...extra.providerSpecificData };
        for (const [source, target] of [["name", "nodeName"], ["prefix", "prefix"], ["baseUrl", "baseUrl"]]) {
          if (result[source] !== undefined) providerSpecificData[target] = result[source];
        }
        if (result.type === "openai-compatible") {
          if (result.apiType !== undefined) providerSpecificData.apiType = result.apiType;
        } else delete providerSpecificData.apiType;
        // Read and merge each current row inside the same transaction. Preserve
        // rotated tokens, per-account proxy/model policy and runtime overlays.
        db.run(`UPDATE providerConnections SET data = ?, updatedAt = ? WHERE id = ?`,
          [stringifyJson({ ...extra, providerSpecificData }), result.updatedAt, account.id]);
      }
      scopes.push(...connectionScopes([id]));
    }
    bumpScopeRevisions(db, scopes);
  });
  if (result) invalidateCommittedScopes(db, scopes);
  return result;
}

export async function deleteProviderNode(id) {
  const db = await getAdapter();
  let removed = null;
  let scopes;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM providerNodes WHERE id = ?`, [id]);
    if (!row) return;
    removed = rowToNode(row);
    const otherNodes = db.all(`SELECT * FROM providerNodes WHERE id <> ?`, [id]).map(rowToNode);
    const owners = nodeModelOwners(removed, otherNodes);
    // Keep account, runtime and declaration deletion in the node's transaction.
    // A failed final DELETE must not leave a retained node without its keys.
    db.run(`DELETE FROM providerConnections WHERE provider = ?`, [id]);
    db.run(`DELETE FROM connectionRuntime WHERE provider = ?`, [id]);
    for (const model of db.all(`SELECT key, value FROM kv WHERE scope = 'customModels'`)) {
      if (owners.has(parseJson(model.value)?.providerAlias)) {
        db.run(`DELETE FROM kv WHERE scope = 'customModels' AND key = ?`, [model.key]);
      }
    }
    db.run(`DELETE FROM providerNodes WHERE id = ?`, [id]);
    scopes = ["nodes", "customModels", ...connectionScopes([id]), ...connectionScopes([id], true)];
    bumpScopeRevisions(db, scopes);
  });
  if (removed) invalidateCommittedScopes(db, scopes);
  return removed;
}

// PR 3623: custom-compatible providers expose only configured models.
// The allowlist enforcement lives in src/app/api/v1/models/route.js where
// rawModelIds is initialized as [] for compatible providers and only
// customModels / modelAliases are merged. This helper identifies such nodes.
export function isCustomCompatibleNode(node) {
  return node?.type === "openai-compatible" || node?.type === "anthropic-compatible";
}
