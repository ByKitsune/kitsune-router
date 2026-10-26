import { invalidateScopedCaches } from "./scopedCache.js";

export const CONFIG_SCOPES = ["connections", "nodes", "combos", "apiKeys", "settings", "pricing", "modelAliases", "customModels", "mitmAlias", "disabledModels", "proxyPools"];

export function bumpScopeRevisions(db, scopes) {
  for (const scope of new Set(scopes)) {
    db.run(`INSERT INTO _meta(key, value) VALUES(?, '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1`, [`cacheRevision:${scope}`]);
  }
}

export function connectionScopes(providers, runtime = false) {
  const prefix = runtime ? "connectionRuntime" : "connections";
  return [prefix, ...[...new Set(providers.filter(Boolean))].map(provider => `${prefix}:${provider}`)];
}

export function invalidateCommittedScopes(db, scopes) {
  invalidateScopedCaches(db, scopes);
}
