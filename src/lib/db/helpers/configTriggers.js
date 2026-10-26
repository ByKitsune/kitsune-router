export function installConfigRevisionTriggers(db) {
  const definitions = {
    providerNodes: "nodes", combos: "combos", apiKeys: "apiKeys", proxyPools: "proxyPools",
  };
  for (const [table, scope] of Object.entries(definitions)) {
    for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
      db.exec(`CREATE TRIGGER IF NOT EXISTS cache_revision_${table}_${operation} AFTER ${operation} ON ${table} BEGIN
        INSERT INTO _meta(key, value) VALUES('cacheRevision:${scope}', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
      END`);
    }
  }
  for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
    const rows = operation === "UPDATE" ? ["OLD", "NEW"] : [operation === "DELETE" ? "OLD" : "NEW"];
    const revisions = rows.map(row => `INSERT INTO _meta(key, value) VALUES('cacheRevision:connections', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
      INSERT INTO _meta(key, value) VALUES('cacheRevision:connections:' || ${row}.provider, '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;`).join("\n");
    db.exec(`CREATE TRIGGER IF NOT EXISTS cache_revision_connections_${operation} AFTER ${operation} ON providerConnections BEGIN ${revisions} END`);
    const row = operation === "DELETE" ? "OLD" : "NEW";
    db.exec(`CREATE TRIGGER IF NOT EXISTS cache_revision_kv_${operation} AFTER ${operation} ON kv BEGIN
      INSERT INTO _meta(key, value) VALUES('cacheRevision:' || ${row}.scope, '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    END`);
  }
}
