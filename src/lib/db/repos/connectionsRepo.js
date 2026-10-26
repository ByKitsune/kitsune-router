import { v4 as uuidv4 } from "uuid";
import { getAdapter, getAdapterSync } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { getScopedCache, readScopeRevision } from "../helpers/scopedCache.js";
import { bumpScopeRevisions, connectionScopes } from "../helpers/cacheRevisions.js";

const RUNTIME_FIELDS = new Set(["lastUsedAt", "consecutiveUseCount"]);

const OPTIONAL_FIELDS = [
  "displayName", "email", "globalPriority", "defaultModel",
  "accessToken", "refreshToken", "expiresAt", "tokenType",
  "scope", "projectId", "apiKey", "testStatus",
  "lastTested", "lastError", "lastErrorAt", "rateLimitedUntil", "expiresIn", "errorCode",
  "consecutiveUseCount", "idToken", "lastRefreshAt",
];

const MODEL_LOCK_PREFIX = "modelLock_";

// Exported for unit tests (pure function, no DB access).
export function resetHealthStateOnActivation(existing, patch) {
  if (patch?.testStatus !== "active") return patch;

  const normalized = {
    ...patch,
    testStatus: "active",
    lastError: Object.hasOwn(patch, "lastError") ? patch.lastError : null,
    lastErrorAt: Object.hasOwn(patch, "lastErrorAt") ? patch.lastErrorAt : null,
    errorCode: null,
    rateLimitedUntil: null,
    backoffLevel: 0,
  };

  // Preserve manually-injected far-future locks (operator kill-switches for
  // dead models, e.g. year 2099). Runtime cooldowns never exceed hours, so a
  // lock expiring more than a day out is certainly manual, not a stale
  // cooldown (9router #4250).
  const MANUAL_LOCK_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const key of Object.keys(existing || {})) {
    if (!key.startsWith(MODEL_LOCK_PREFIX)) continue;
    const until = new Date(existing[key]).getTime();
    if (Number.isFinite(until) && until - now > MANUAL_LOCK_MS) {
      normalized[key] = existing[key];
    } else {
      normalized[key] = null;
    }
  }

  return normalized;
}

function rowToConn(row) {
  if (!row) return null;
  const extra = parseJson(row.data, {});
  return {
    ...extra,
    id: row.id,
    provider: row.provider,
    authType: row.authType,
    name: row.name,
    email: row.email,
    priority: row.priority,
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function connToRow(c) {
  const { id, provider, authType, name, email, priority, isActive, createdAt, updatedAt, ...rest } = c;
  return {
    id,
    provider,
    authType,
    name: name ?? null,
    email: email ?? null,
    priority: priority ?? null,
    isActive: isActive === false ? 0 : 1,
    data: stringifyJson(rest),
    createdAt,
    updatedAt,
  };
}

function upsert(db, c) {
  const r = connToRow(c);
  db.run(
    `INSERT INTO providerConnections(id, provider, authType, name, email, priority, isActive, data, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       provider=excluded.provider, authType=excluded.authType, name=excluded.name,
       email=excluded.email, priority=excluded.priority, isActive=excluded.isActive,
       data=excluded.data, updatedAt=excluded.updatedAt`,
    [r.id, r.provider, r.authType, r.name, r.email, r.priority, r.isActive, r.data, r.createdAt, r.updatedAt]
  );
  db.run(`DELETE FROM connectionRuntime WHERE connectionId = ?`, [c.id]);
  bumpScopeRevisions(db, connectionScopes([c.provider]));
}

function deriveConnectionName(data, fallbackName) {
  if (data.provider === "github") {
    return data.providerSpecificData?.githubLogin
      || data.providerSpecificData?.githubEmail
      || data.email
      || data.providerSpecificData?.githubName
      || fallbackName;
  }
  return fallbackName;
}

export function invalidateConnectionCache() {
  try {
    const db = getAdapterSync();
    getScopedCache(db, "connections").invalidate();
    getScopedCache(db, "connectionViews").invalidate();
  } catch {}
}

function invalidateProviders(db, providers, runtime = false) {
  const scopes = connectionScopes(providers, runtime);
  if (!runtime) getScopedCache(db, "connections").invalidate(scopes);
  getScopedCache(db, "connectionViews").invalidate(scopes);
}

export async function getProviderConnections(filter = {}) {
  const db = await getAdapter();
  const provider = filter.provider || null;
  const active = filter.isActive === undefined ? null : Boolean(filter.isActive);
  const descriptor = ["providerConnections", "internal", "list", provider, active];
  const scopes = provider ? ["connectionImport", `connections:${provider}`] : ["connectionImport", "connections"];
  const runtimeScopes = provider ? [`connectionRuntime:${provider}`] : ["connectionRuntime"];
  return getScopedCache(db, "connectionViews").get(descriptor, [...scopes, ...runtimeScopes], async () => {
    const base = await getScopedCache(db, "connections").get(descriptor, scopes, () => {
      const where = [];
      const params = [];
      if (provider) { where.push("provider = ?"); params.push(provider); }
      if (active !== null) { where.push("isActive = ?"); params.push(active ? 1 : 0); }
      const rows = db.all(`SELECT * FROM providerConnections${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`, params);
      const list = rows.map(rowToConn);
      list.sort((a, b) => (a.priority || 999) - (b.priority || 999));
      return list;
    });
    const runtime = db.all(`SELECT connectionId, data, updatedAt FROM connectionRuntime${provider ? " WHERE provider = ?" : ""}`, provider ? [provider] : []);
    const byId = new Map(runtime.map(row => [row.connectionId, row]));
    return base.map(connection => {
      const row = byId.get(connection.id);
      return row ? { ...connection, ...parseJson(row.data, {}), updatedAt: row.updatedAt } : connection;
    });
  });
}

function readConnection(db, id) {
  const connection = rowToConn(db.get(`SELECT * FROM providerConnections WHERE id = ?`, [id]));
  if (!connection) return null;
  const runtime = db.get(`SELECT data, updatedAt FROM connectionRuntime WHERE connectionId = ?`, [id]);
  return runtime ? { ...connection, ...parseJson(runtime.data, {}), updatedAt: runtime.updatedAt } : connection;
}

export async function getProviderConnectionById(id) {
  const db = await getAdapter();
  for (;;) {
    const revision = readScopeRevision(db, ["connectionImport"]);
    const connection = readConnection(db, id);
    if (readScopeRevision(db, ["connectionImport"]) !== revision) continue;
    if (connection) Object.defineProperty(connection, "_writeFence", { value: { importRevision: revision, connection: structuredClone(connection) } });
    return connection;
  }
}

// Internal sync reorder — must be called INSIDE a transaction.
//
// Normalizes priorities to a contiguous 1..N after a DELETE or an explicit
// reorder, so gaps don't accumulate over time.
//
// Deliberately NOT called on insert: a new connection already gets
// MAX(priority)+1, which sorts after every existing row, so the order is
// identical with or without the rewrite. Skipping it there is what makes
// import O(1) per key instead of O(pool) — see createProviderConnection.
function reorderInTx(db, providerId) {
  const list = db.all(`SELECT * FROM providerConnections WHERE provider = ?`, [providerId]).map(rowToConn);
  list.sort((a, b) => {
    const pDiff = (a.priority || 0) - (b.priority || 0);
    if (pDiff !== 0) return pDiff;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
  list.forEach((c, i) => {
    const want = i + 1;
    if ((c.priority || 0) !== want) {
      db.run(`UPDATE providerConnections SET priority = ? WHERE id = ?`, [want, c.id]);
    }
  });
}

export async function createProviderConnection(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  let result;

  db.transaction(() => {
    // apikey connections are deduped by name and need only the current max
    // priority, so query for those directly instead of loading the whole pool
    // (O(pool) per key — the other half of the import cost in #4311). The oauth
    // branch below still scans, because its identity rules compare fields
    // inside providerSpecificData and have no single-column equivalent.
    const isApikey = data.authType === "apikey" && !!data.name;
    const all = isApikey
      ? db.all(
          `SELECT * FROM providerConnections WHERE provider = ? AND authType = ? AND name = ?`,
          [data.provider, "apikey", data.name]
        ).map(rowToConn)
      : db.all(`SELECT * FROM providerConnections WHERE provider = ?`, [data.provider]).map(rowToConn);
    const poolSize = isApikey
      ? db.get(`SELECT COUNT(*) AS n FROM providerConnections WHERE provider = ?`, [data.provider])?.n ?? all.length
      : all.length;

    let existing = null;
    if (data.authType === "oauth" && data.email) {
      const incomingUsername = data.providerSpecificData?.username;
      const incomingWs = data.providerSpecificData?.chatgptAccountId;
      existing = all.find(c => {
        if (c.authType !== "oauth" || c.email !== data.email) return false;

        // Codex/OpenAI can issue multiple OAuth grants for the same email.
        // Refresh tokens are rotated single-use; collapsing a new login onto an
        // existing bare-email row overwrites the first account's token pair and
        // makes it look "invalid" after adding a second account. Only update an
        // existing Codex row when both rows expose the same ChatGPT account ID.
        if (data.provider === "codex") {
          const existingWs = c.providerSpecificData?.chatgptAccountId;
          return !!incomingWs && !!existingWs && incomingWs === existingWs;
        }

        // Workspace providers use workspace ID when both sides have it
        const existingWs = c.providerSpecificData?.chatgptAccountId;
        if (incomingWs && existingWs) return incomingWs === existingWs;
        if (incomingWs && !existingWs) return false;
        if (!incomingWs && existingWs) return false;
        // Non-workspace providers: match on (email + username) so cross-IdP
        // accounts don't overwrite each other. Require username on both sides
        // — if only one side has it, treat as a distinct identity rather than
        // collapsing onto the bare-email fallback (which would re-introduce
        // the cross-IdP overwrite).
        const existingUsername = c.providerSpecificData?.username;
        if (incomingUsername && existingUsername) {
          return incomingUsername === existingUsername;
        }
        if (incomingUsername || existingUsername) return false;
        return true;
      });
    } else if (data.authType === "apikey" && data.name) {
      existing = all.find(c => c.authType === "apikey" && c.name === data.name);
    }
    // access_token: never dedup — user manages duplicates manually

    if (existing) {
      // Name collision on an apikey connection used to silently replace the
      // stored apiKey, so a script that reused names ("Key 1", "Key 2", …)
      // destroyed existing pool entries with no 409 and no warning. Callers that
      // genuinely mean "update this one" pass allowOverwrite; everyone else gets
      // a typed error naming the row that would have been replaced. #4311
      if (data.allowOverwrite === false) {
        const err = new Error(
          `A connection named "${existing.name}" already exists for provider "${data.provider}". ` +
          `Pass allowOverwrite: true to replace it.`
        );
        err.code = "PROVIDER_NAME_CONFLICT";
        err.existingId = existing.id;
        err.existingName = existing.name;
        throw err;
      }
      const normalized = resetHealthStateOnActivation(existing, data);
      const merged = { ...readConnection(db, existing.id), ...normalized, updatedAt: now };
      upsert(db, merged);
      result = merged;
      return;
    }

    let connectionName = data.name || null;
    if (!connectionName && (data.authType === "oauth" || data.authType === "access_token")) {
      connectionName = deriveConnectionName(data, data.email || `Account ${poolSize + 1}`);
    }
    let connectionPriority = data.priority;
    if (!connectionPriority) {
      // MAX(priority)+1 in SQL rather than a reduce over the loaded pool: the
      // apikey path no longer has the whole pool in memory, and the aggregate
      // is served by the index instead of a row scan. #4311
      const maxRow = db.get(`SELECT MAX(priority) AS m FROM providerConnections WHERE provider = ?`, [data.provider]);
      connectionPriority = (maxRow?.m || 0) + 1;
    }

    const conn = {
      id: uuidv4(),
      provider: data.provider,
      authType: data.authType || "oauth",
      name: connectionName,
      priority: connectionPriority,
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: now,
      updatedAt: now,
    };
    for (const f of OPTIONAL_FIELDS) {
      if (data[f] !== undefined && data[f] !== null) conn[f] = data[f];
    }
    if (data.providerSpecificData && Object.keys(data.providerSpecificData).length > 0) {
      conn.providerSpecificData = data.providerSpecificData;
    }
    if (data.email !== undefined) conn.email = data.email;

    upsert(db, conn);
    // No reorderInTx here. `conn.priority` is already MAX(priority)+1, so the
    // row sorts last and the resulting order is what reorderInTx would have
    // produced anyway. The rewrite cost ~2N statements per insert — O(pool) —
    // which made a 5k-key import O(n*m): ~25M statements at a 5k pool, and it
    // serialized every parallel writer on the same transaction. #4311
    result = conn;
  });

  invalidateProviders(db, [result.provider]);
  return result;
}

export async function updateProviderConnection(id, data, { expected } = {}) {
  const db = await getAdapter();
  const runtimeOnly = Object.keys(data).length > 0 && Object.keys(data).every(key => RUNTIME_FIELDS.has(key));
  let result = null;
  let providers = [];
  db.transaction(() => {
    const existing = readConnection(db, id);
    if (!existing) return;
    if (expected) {
      const fields = ["provider", "authType", "isActive", "apiKey", "accessToken", "refreshToken", "idToken", "expiresAt", "lastRefreshAt", "projectId", "providerSpecificData"];
      if (expected.importRevision !== readScopeRevision(db, ["connectionImport"])
        || fields.some(field => JSON.stringify(expected.connection?.[field]) !== JSON.stringify(existing[field]))) {
        const error = new Error("Provider credentials changed while refresh was in flight");
        error.code = "STALE_CONNECTION_WRITE";
        throw error;
      }
    }
    const normalized = resetHealthStateOnActivation(existing, data);
    const merged = { ...existing, ...normalized, id, updatedAt: new Date().toISOString() };
    providers = [existing.provider, merged.provider];
    if (runtimeOnly) {
      const runtime = Object.fromEntries([...RUNTIME_FIELDS].filter(field => merged[field] !== undefined).map(field => [field, merged[field]]));
      db.run(`INSERT INTO connectionRuntime(connectionId, provider, data, updatedAt) VALUES(?, ?, ?, ?) ON CONFLICT(connectionId) DO UPDATE SET provider = excluded.provider, data = excluded.data, updatedAt = excluded.updatedAt`,
        [id, merged.provider, stringifyJson(runtime), merged.updatedAt]);
      bumpScopeRevisions(db, connectionScopes(providers, true));
    } else {
      upsert(db, merged);
      if (data.priority !== undefined) reorderInTx(db, existing.provider);
      if (merged.provider !== existing.provider) bumpScopeRevisions(db, connectionScopes([existing.provider]));
    }
    result = merged;
  });
  if (result) invalidateProviders(db, providers, runtimeOnly);
  return result;
}

export async function deleteProviderConnection(id) {
  const db = await getAdapter();
  let provider = null;
  db.transaction(() => {
    const row = db.get(`SELECT provider FROM providerConnections WHERE id = ?`, [id]);
    if (!row) return;
    provider = row.provider;
    db.run(`DELETE FROM providerConnections WHERE id = ?`, [id]);
    db.run(`DELETE FROM connectionRuntime WHERE connectionId = ?`, [id]);
    reorderInTx(db, provider);
    bumpScopeRevisions(db, connectionScopes([provider]));
  });
  if (provider) invalidateProviders(db, [provider]);
  return provider !== null;
}

export async function deleteProviderConnectionsByProvider(providerId) {
  const db = await getAdapter();
  let count = 0;
  db.transaction(() => {
    count = db.get(`SELECT COUNT(*) AS n FROM providerConnections WHERE provider = ?`, [providerId])?.n || 0;
    db.run(`DELETE FROM providerConnections WHERE provider = ?`, [providerId]);
    db.run(`DELETE FROM connectionRuntime WHERE provider = ?`, [providerId]);
    bumpScopeRevisions(db, connectionScopes([providerId]));
  });
  invalidateProviders(db, [providerId]);
  return count;
}

export async function reorderProviderConnections(providerId) {
  const db = await getAdapter();
  db.transaction(() => { reorderInTx(db, providerId); bumpScopeRevisions(db, connectionScopes([providerId])); });
  invalidateProviders(db, [providerId]);
}

export async function cleanupProviderConnections() {
  const db = await getAdapter();
  const fieldsToCheck = [
    "displayName", "email", "globalPriority", "defaultModel",
    "accessToken", "refreshToken", "expiresAt", "tokenType",
    "scope", "projectId", "apiKey", "testStatus",
    "lastTested", "lastError", "lastErrorAt", "rateLimitedUntil", "expiresIn",
    "consecutiveUseCount",
  ];
  let cleaned = 0;
  db.transaction(() => {
    const rows = db.all(`SELECT * FROM providerConnections`);
    for (const row of rows) {
      const conn = readConnection(db, row.id);
      let dirty = false;
      for (const f of fieldsToCheck) {
        if (conn[f] === null || conn[f] === undefined) {
          if (f in conn) { delete conn[f]; cleaned++; dirty = true; }
        }
      }
      if (conn.providerSpecificData && Object.keys(conn.providerSpecificData).length === 0) {
        delete conn.providerSpecificData;
        cleaned++;
        dirty = true;
      }
      if (dirty) upsert(db, conn);
    }
  });
  if (cleaned > 0) invalidateConnectionCache();
  return cleaned;
}
