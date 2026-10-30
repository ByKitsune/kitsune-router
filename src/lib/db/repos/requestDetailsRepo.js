import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { readScopeRevision } from "../helpers/scopedCache.js";

const DEFAULT_MAX_RECORDS = 200;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_JSON_SIZE = 5 * 1024;
const CONFIG_CACHE_TTL_MS = 5000;

let cachedConfig = null;
let cachedConfigTs = 0;
let configGeneration = 0;

export function invalidateObservabilityConfigCache() {
  cachedConfig = null;
  cachedConfigTs = 0;
  configGeneration++;
}

function explicitEnvFlag(env, name) {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return null;
  return raw.trim().toLowerCase() === "true";
}

export function resolveObservabilityState(settings, env = process.env) {
  const featureFlag = explicitEnvFlag(env, "OBSERVABILITY_ENABLED");
  if (featureFlag !== null) return { enabled: featureFlag, source: "OBSERVABILITY_ENABLED" };

  const requestLogsFlag = explicitEnvFlag(env, "ENABLE_REQUEST_LOGS");
  if (requestLogsFlag !== null) return { enabled: requestLogsFlag, source: "ENABLE_REQUEST_LOGS" };

  return { enabled: settings?.enableObservability === true, source: "settings" };
}

export function resolveObservabilityEnabled(settings, env = process.env) {
  return resolveObservabilityState(settings, env).enabled;
}

async function getObservabilityConfig() {
  const db = await getAdapter();
  const revision = readScopeRevision(db, ["settings"]);
  const envKey = JSON.stringify([process.env.OBSERVABILITY_ENABLED, process.env.ENABLE_REQUEST_LOGS]);
  if (cachedConfig?.revision === revision && cachedConfig.envKey === envKey && (Date.now() - cachedConfigTs) < CONFIG_CACHE_TTL_MS) return cachedConfig;
  const generation = configGeneration;
  let config;
  try {
    const { getSettings } = await import("./settingsRepo.js");
    const settings = await getSettings();
    config = {
      enabled: resolveObservabilityEnabled(settings),
      maxRecords: settings.observabilityMaxRecords || parseInt(process.env.OBSERVABILITY_MAX_RECORDS || String(DEFAULT_MAX_RECORDS), 10),
      batchSize: settings.observabilityBatchSize || parseInt(process.env.OBSERVABILITY_BATCH_SIZE || String(DEFAULT_BATCH_SIZE), 10),
      flushIntervalMs: settings.observabilityFlushIntervalMs || parseInt(process.env.OBSERVABILITY_FLUSH_INTERVAL_MS || String(DEFAULT_FLUSH_INTERVAL_MS), 10),
      maxJsonSize: (settings.observabilityMaxJsonSize || parseInt(process.env.OBSERVABILITY_MAX_JSON_SIZE || "5", 10)) * 1024,
    };
  } catch {
    config = {
      enabled: false,
      maxRecords: DEFAULT_MAX_RECORDS,
      batchSize: DEFAULT_BATCH_SIZE,
      flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
      maxJsonSize: DEFAULT_MAX_JSON_SIZE,
    };
  }
  // Do not publish settings read before a committed import.
  if (generation !== configGeneration || readScopeRevision(db, ["settings"]) !== revision) return getObservabilityConfig();
  const bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.floor(Number(value)))) : fallback;
  config.maxRecords = bounded(config.maxRecords, DEFAULT_MAX_RECORDS, 1, 100_000);
  config.batchSize = bounded(config.batchSize, DEFAULT_BATCH_SIZE, 1, 50);
  config.flushIntervalMs = bounded(config.flushIntervalMs, DEFAULT_FLUSH_INTERVAL_MS, 1, 60_000);
  config.maxJsonSize = bounded(config.maxJsonSize, DEFAULT_MAX_JSON_SIZE, 1024, 64 * 1024);
  cachedConfig = { ...config, revision, envKey };
  cachedConfigTs = Date.now();
  return cachedConfig;
}

const queues = globalThis[Symbol.for("kitsunerouter.db.detailQueues")] ||= new WeakMap();
const MAX_BUFFER_RECORDS = 1000;
const MAX_BUFFER_BYTES = 2 * 1024 * 1024;

function queueFor(db) {
  if (queues.has(db)) return queues.get(db);
  const queue = { items: [], bytes: 0, timer: null, pending: null, accepted: 0, written: 0, dropped: 0, retries: 0, closed: false };
  queues.set(db, queue);
  const close = db.close.bind(db);
  db.close = () => {
    queue.closed = true;
    if (queue.timer) clearTimeout(queue.timer);
    queue.timer = null;
    return close();
  };
  return queue;
}

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== "object") return {};
  const sensitive = /authorization|api.?key|cookie|token|credential|secret|password|passwd/i;
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !sensitive.test(key)));
}

function metadataMap(value) {
  const out = {};
  for (const [key, item] of Object.entries(value || {}).slice(0, 80)) {
    if (key.length <= 80 && /token|estimated|invalid|tier|ttft|total|duration|ms|enabled|saved|ratio/i.test(key)
      && (typeof item === "boolean" || Number.isFinite(item) || item === null || (typeof item === "string" && item.length <= 80 && /tier/i.test(key)))) {
      out[key] = item;
    }
  }
  return out;
}

function projectDetail(detail) {
  const text = value => typeof value === "string" ? value.slice(0, 200) : null;
  const timestamp = text(detail.timestamp) || new Date().toISOString();
  const redact = value => value == null ? {} : { redacted: true };
  return {
    id: text(detail.id) || `${timestamp}-${Math.random().toString(36).slice(2, 10)}`,
    timestamp, provider: text(detail.provider), model: text(detail.model), connectionId: text(detail.connectionId), status: text(detail.status),
    latency: metadataMap(detail.latency), tokens: metadataMap(detail.tokens),
    request: redact(detail.request), providerRequest: redact(detail.providerRequest), providerResponse: redact(detail.providerResponse), response: redact(detail.response),
    ...(detail.pxpipe ? { pxpipe: {
      ...metadataMap(detail.pxpipe),
      ...(typeof detail.pxpipe.applied === "boolean" ? { applied: detail.pxpipe.applied } : {}),
      ...(Number.isFinite(detail.pxpipe.imageCount) ? { imageCount: detail.pxpipe.imageCount } : {}),
      ...(typeof detail.pxpipe.reason === "string" && /^[a-z_]{1,60}$/.test(detail.pxpipe.reason) ? { reason: detail.pxpipe.reason } : {}),
    } } : {}),
  };
}

export const __test__ = { sanitizeHeaders, projectDetail };

function scheduleDetailFlush(db, queue, delayMs) {
  if (queue.timer || queue.closed) return;
  queue.timer = setTimeout(() => {
    queue.timer = null;
    flushDetailBatch(db).catch(() => {});
  }, delayMs);
  queue.timer.unref?.();
}

async function flushDetailBatch(db) {
  const queue = queueFor(db);
  if (queue.pending) return queue.pending;
  if (!queue.items.length || queue.closed) return;
  queue.pending = (async () => {
    const config = await getObservabilityConfig();
    const items = [];
    let batchBytes = 0;
    for (const item of queue.items) {
      if (items.length >= 50 || (items.length && batchBytes + item.bytes > 256 * 1024)) break;
      items.push(item);
      batchBytes += item.bytes;
    }
    try {
      db.transaction(() => {
        for (const item of items) {
          const record = item.record;
          db.run(`INSERT INTO requestDetails(id, timestamp, provider, model, connectionId, status, data) VALUES(?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET timestamp = excluded.timestamp, provider = excluded.provider, model = excluded.model, connectionId = excluded.connectionId, status = excluded.status, data = excluded.data`,
            [record.id, record.timestamp, record.provider, record.model, record.connectionId, record.status, item.json]);
        }
        const count = db.get(`SELECT COUNT(*) AS c FROM requestDetails`)?.c || 0;
        if (count > config.maxRecords) db.run(`DELETE FROM requestDetails WHERE id IN (SELECT id FROM requestDetails ORDER BY timestamp ASC LIMIT ?)`, [count - config.maxRecords]);
      });
      db.flushDurable?.();
      queue.items.splice(0, items.length);
      queue.bytes -= items.reduce((sum, item) => sum + item.bytes, 0);
      queue.written += items.length;
    } catch (error) {
      queue.retries++;
      throw error;
    }
  })();
  try { return await queue.pending; }
  finally {
    queue.pending = null;
    if (queue.items.length) scheduleDetailFlush(db, queue, queue.retries ? 1000 : 10);
  }
}

export async function saveRequestDetail(detail) {
  const record = projectDetail(detail);
  const config = await getObservabilityConfig();
  if (!config.enabled) return { accepted: false, disabled: true };
  const db = await getAdapter();
  const queue = queueFor(db);
  const json = stringifyJson(record);
  const bytes = Buffer.byteLength(json);
  if (queue.closed || bytes > config.maxJsonSize || queue.items.length >= MAX_BUFFER_RECORDS || queue.bytes + bytes > MAX_BUFFER_BYTES) {
    queue.dropped++;
    return { accepted: false, dropped: true };
  }
  queue.items.push({ record, json, bytes });
  queue.bytes += bytes;
  queue.accepted++;
  if (queue.items.length >= config.batchSize) {
    if (queue.timer) clearTimeout(queue.timer);
    queue.timer = null;
    scheduleDetailFlush(db, queue, 0);
  } else scheduleDetailFlush(db, queue, config.flushIntervalMs);
  return { accepted: true };
}

export async function getRequestDetailQueueMetrics() {
  const queue = queueFor(await getAdapter());
  return { depth: queue.items.length, bytes: queue.bytes, accepted: queue.accepted, written: queue.written, dropped: queue.dropped, retries: queue.retries };
}

export async function flushRequestDetails({ deadline = Date.now() + 5000 } = {}) {
  const db = await getAdapter();
  const queue = queueFor(db);
  if (queue.timer) { clearTimeout(queue.timer); queue.timer = null; }
  while (queue.items.length && Date.now() < deadline) {
    await flushDetailBatch(db);
    if (queue.items.length) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { ...(await getRequestDetailQueueMetrics()), drained: queue.items.length === 0 };
}

export async function getRequestDetails(filter = {}) {
  const db = await getAdapter();
  const conds = [];
  const params = [];

  if (filter.provider) { conds.push("provider = ?"); params.push(filter.provider); }
  if (filter.model) { conds.push("model = ?"); params.push(filter.model); }
  if (filter.connectionId) { conds.push("connectionId = ?"); params.push(filter.connectionId); }
  if (filter.status) { conds.push("status = ?"); params.push(filter.status); }
  if (filter.startDate) { conds.push("timestamp >= ?"); params.push(new Date(filter.startDate).toISOString()); }
  if (filter.endDate) { conds.push("timestamp <= ?"); params.push(new Date(filter.endDate).toISOString()); }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const cntRow = db.get(`SELECT COUNT(*) as c FROM requestDetails ${where}`, params);
  const totalItems = cntRow ? cntRow.c : 0;

  const page = filter.page || 1;
  const pageSize = filter.pageSize || 50;
  const totalPages = Math.ceil(totalItems / pageSize);
  const offset = (page - 1) * pageSize;

  const rows = db.all(
    `SELECT data FROM requestDetails ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const details = rows.map((r) => parseJson(r.data, {}));

  return {
    details,
    pagination: { page, pageSize, totalItems, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
}

export async function getDistinctProviders() {
  const db = await getAdapter();
  const rows = db.all(`SELECT DISTINCT provider FROM requestDetails WHERE provider IS NOT NULL ORDER BY provider ASC`);
  return rows.map((r) => r.provider);
}

export async function getRequestDetailById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT data FROM requestDetails WHERE id = ?`, [id]);
  return row ? parseJson(row.data, null) : null;
}
