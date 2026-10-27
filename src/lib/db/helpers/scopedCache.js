import { createHash } from "node:crypto";

const registry = globalThis[Symbol.for("kitsunerouter.db.scopedCaches")] ||= { adapters: new WeakMap(), counters: {} };

export function readScopeRevision(db, scopes) {
  const keys = [...new Set(scopes)].sort().map(scope => `cacheRevision:${scope}`);
  if (!keys.length) return "";
  const rows = db.all(`SELECT key, value FROM _meta WHERE key IN (${keys.map(() => "?").join(",")})`, keys);
  const values = new Map(rows.map(row => [row.key, row.value]));
  return keys.map(key => values.get(key) || "0").join(":");
}

export function ownedSnapshot(value) {
  const copy = structuredClone(value);
  const freeze = (item) => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return item;
    for (const child of Object.values(item)) freeze(child);
    return Object.freeze(item);
  };
  return freeze(copy);
}

export function getScopedCache(db, name, { maxEntries = 256, maxBytes = 8 * 1024 * 1024, ttlMs = 30_000 } = {}) {
  let caches = registry.adapters.get(db);
  if (!caches) registry.adapters.set(db, caches = new Map());
  if (caches.has(name)) return caches.get(name);
  const entries = new Map();
  const pending = new Map();
  const counters = registry.counters[name] ||= { hits: 0, misses: 0, evictions: 0, invalidations: 0, loads: 0, loadErrors: 0, coalesced: 0, rejected: 0 };
  let bytes = 0;
  let inFlight = 0;
  let generation = 0;
  const keyFor = descriptor => createHash("sha256").update(JSON.stringify(descriptor)).digest("hex");
  const remove = (key, reason) => {
    const entry = entries.get(key);
    if (!entry) return;
    bytes -= entry.bytes;
    entries.delete(key);
    counters[reason]++;
  };
  const put = (key, descriptor, scopes, revision, value) => {
    const snapshot = ownedSnapshot(value);
    const size = Buffer.byteLength(JSON.stringify(snapshot) ?? "null") + Buffer.byteLength(JSON.stringify(descriptor));
    if (entries.has(key)) { bytes -= entries.get(key).bytes; entries.delete(key); }
    if (size > maxBytes) { counters.rejected++; return snapshot; }
    while (entries.size >= maxEntries || bytes + size > maxBytes) remove(entries.keys().next().value, "evictions");
    entries.set(key, { scopes, revision, value: snapshot, bytes: size, expiresAt: Date.now() + ttlMs });
    bytes += size;
    return snapshot;
  };
  const cache = {
    async get(descriptor, scopes, load, { retain = () => true } = {}) {
      const key = keyFor(descriptor);
      for (;;) {
        const revision = readScopeRevision(db, scopes);
        const entry = entries.get(key);
        if (entry && entry.revision === revision && entry.expiresAt > Date.now()) {
          counters.hits++;
          entries.delete(key); entries.set(key, entry);
          return entry.value;
        }
        if (entry) remove(key, "invalidations");
        const active = pending.get(key);
        if (active?.revision === revision && active.generation === generation) {
          counters.coalesced++;
          try {
            const value = await active.promise;
            if (generation === active.generation && readScopeRevision(db, scopes) === revision) return entries.get(key)?.value ?? ownedSnapshot(value);
          } catch (error) {
            if (generation === active.generation && readScopeRevision(db, scopes) === revision) throw error;
          }
          continue;
        }
        counters.misses++;
        if (inFlight >= maxEntries) {
          counters.rejected++;
          throw Object.assign(new Error("Configuration cache loader capacity exceeded"), { code: "DB_CACHE_BUSY" });
        }
        const operation = { revision, generation, promise: null };
        inFlight++;
        operation.promise = Promise.resolve().then(load);
        pending.set(key, operation);
        let value;
        try { value = await operation.promise; counters.loads++; }
        catch (error) {
          counters.loadErrors++;
          if (generation !== operation.generation || readScopeRevision(db, scopes) !== revision) continue;
          throw error;
        }
        finally { inFlight--; if (pending.get(key) === operation) pending.delete(key); }
        if (generation !== operation.generation || readScopeRevision(db, scopes) !== revision) continue;
        return retain(value) ? put(key, descriptor, scopes, revision, value) : value;
      }
    },
    invalidate(scopes = null) {
      if (!scopes) generation++;
      for (const [key, entry] of entries) {
        if (!scopes || entry.scopes.some(scope => scopes.includes(scope))) remove(key, "invalidations");
      }
    },
    replace(descriptor, scopes, value) {
      return put(keyFor(descriptor), descriptor, scopes, readScopeRevision(db, scopes), value);
    },
    stats() { return { ...counters, entries: entries.size, bytes, pending: inFlight }; },
  };
  const metric = () => cache.stats();
  registry.metrics ||= new Map();
  let metrics = registry.metrics.get(name);
  if (!metrics) registry.metrics.set(name, metrics = new Set());
  metrics.add(metric);
  const close = db.close.bind(db);
  db.close = () => { metrics.delete(metric); cache.invalidate(); return close(); };
  caches.set(name, cache);
  return cache;
}

export function invalidateScopedCaches(db, scopes) {
  for (const cache of registry.adapters.get(db)?.values() || []) cache.invalidate(scopes);
}

export function getDbCacheMetrics() {
  return Object.fromEntries(Object.entries(registry.counters).map(([name, counters]) => {
    const gauges = { entries: 0, bytes: 0, pending: 0 };
    for (const metric of registry.metrics?.get(name) || []) {
      const current = metric();
      for (const field of Object.keys(gauges)) gauges[field] += current[field];
    }
    return [name, { ...counters, ...gauges }];
  }));
}
