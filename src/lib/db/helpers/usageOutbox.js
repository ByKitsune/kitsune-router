import { randomUUID } from "node:crypto";

const states = globalThis[Symbol.for("zenrouter.db.usageOutbox")] ||= new WeakMap();
const MAX_EVENTS = 100_000;
const MAX_BYTES = 128 * 1024 * 1024;
const BATCH_SIZE = 20;
const BATCH_BYTES = 256 * 1024;
const LEASE_MS = 30_000;

export function initializeOutbox(db, project, onProjected = () => {}) {
  if (states.has(db)) return states.get(db);
  const state = {
    owner: randomUUID(), timer: null, stopped: false, project, onProjected,
    accepted: 0, projected: 0, duplicates: 0, retries: 0, rejected: 0, errors: 0,
    accepting: new Set(), admissions: new Map(), identities: new WeakMap(), snapshots: new WeakMap(), closed: false,
  };
  states.set(db, state);
  const close = db.close.bind(db);
  db.close = () => {
    state.stopped = true;
    state.closed = true;
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
    return close();
  };
  scheduleOutbox(db, 0);
  return state;
}

export function outboxState(db) {
  const state = states.get(db);
  if (!state) throw new Error("Usage persistence is not initialized");
  return state;
}

export function scheduleOutbox(db, delayMs = 25) {
  const state = outboxState(db);
  if (state.timer || state.stopped) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    try { projectOutboxBatch(db); }
    catch { state.errors++; }
    if (!state.stopped) scheduleOutbox(db, 1000);
  }, delayMs);
  state.timer.unref?.();
}

export function acceptOutbox(db, payload) {
  const state = outboxState(db);
  if (state.closed) throw Object.assign(new Error("Usage database is closed"), { code: "USAGE_DB_CLOSED" });
  if (typeof payload?.eventId !== "string" || !payload.eventId || payload.eventId.length > 200) throw new TypeError("Invalid usage eventId");
  const serialized = JSON.stringify(payload);
  const bytes = Buffer.byteLength(serialized);
  if (bytes > 256 * 1024) {
    state.rejected++;
    throw Object.assign(new Error("Usage event exceeds durable record limit"), { code: "USAGE_EVENT_TOO_LARGE" });
  }
  let duplicate = false;
  db.transaction(() => {
    if (db.get("SELECT id FROM usageHistory WHERE eventId = ?", [payload.eventId])
      || db.get("SELECT eventId FROM usageOutbox WHERE eventId = ?", [payload.eventId])) { duplicate = true; return; }
    const count = Number(db.get("SELECT value FROM _meta WHERE key = 'usageOutboxDepth'")?.value || 0);
    const storedBytes = Number(db.get("SELECT value FROM _meta WHERE key = 'usageOutboxBytes'")?.value || 0);
    if (count >= MAX_EVENTS || storedBytes + bytes > MAX_BYTES) {
      state.rejected++;
      throw Object.assign(new Error("Durable usage outbox is full; retry acceptance"), { code: "USAGE_OUTBOX_FULL" });
    }
    db.run("INSERT INTO usageOutbox(eventId, payload, bytes, acceptedAt) VALUES(?, ?, ?, ?)",
      [payload.eventId, serialized, bytes, Date.now()]);
  });
  db.flushDurable?.();
  state[duplicate ? "duplicates" : "accepted"]++;
  scheduleOutbox(db);
  return { eventId: payload.eventId, accepted: true, duplicate };
}

export function projectOutboxBatch(db, { eventId = null, force = false } = {}) {
  const state = outboxState(db);
  const now = Date.now();
  const ready = db.get(`SELECT eventId FROM usageOutbox WHERE leaseUntil <= ? AND ${force ? "1 = 1" : "nextAttemptAt <= ?"}${eventId ? " AND eventId = ?" : ""} LIMIT 1`,
    [now, ...(force ? [] : [now]), ...(eventId ? [eventId] : [])]);
  if (!ready) return 0;
  let rows;
  db.transaction(() => {
    rows = db.all(`SELECT * FROM usageOutbox WHERE leaseUntil <= ? AND ${force ? "1 = 1" : "nextAttemptAt <= ?"}${eventId ? " AND eventId = ?" : ""} ORDER BY acceptedAt LIMIT ?`,
      [now, ...(force ? [] : [now]), ...(eventId ? [eventId] : []), BATCH_SIZE]);
    let bytes = 0;
    rows = rows.filter((row, index) => { bytes += row.bytes; return index === 0 || bytes <= BATCH_BYTES; });
    for (const row of rows) db.run("UPDATE usageOutbox SET leaseOwner = ?, leaseUntil = ? WHERE eventId = ?", [state.owner, now + LEASE_MS, row.eventId]);
  });
  const started = Date.now();
  let processed = 0;
  let projectionError;
  for (const row of rows) {
    if (processed > 0 && Date.now() - started >= 8) break;
    try {
      let result;
      db.transaction(() => {
        const lease = db.get("SELECT leaseOwner FROM usageOutbox WHERE eventId = ?", [row.eventId]);
        if (lease?.leaseOwner !== state.owner) return;
        result = state.project(db, JSON.parse(row.payload));
        db.run("DELETE FROM usageOutbox WHERE eventId = ? AND leaseOwner = ?", [row.eventId, state.owner]);
      });
      db.flushDurable?.();
      if (result) { state.projected++; state.onProjected(result); }
      processed++;
    } catch (error) {
      state.retries++;
      const attempts = row.attempts + 1;
      db.run("UPDATE usageOutbox SET attempts = ?, nextAttemptAt = ?, leaseOwner = NULL, leaseUntil = 0, lastError = ? WHERE eventId = ? AND leaseOwner = ?",
        [attempts, Date.now() + Math.min(60_000, 250 * 2 ** Math.min(attempts, 8)), String(error.code || error.name || "Error").slice(0, 80), row.eventId, state.owner]);
      db.flushDurable?.();
      if (eventId) { projectionError = error; break; }
    }
  }
  if (rows.length) db.run("UPDATE usageOutbox SET leaseOwner = NULL, leaseUntil = 0 WHERE leaseOwner = ?", [state.owner]);
  if (projectionError) throw projectionError;
  if (rows.length) scheduleOutbox(db, 25);
  return processed;
}

export function usageOutboxMetrics(db) {
  const state = outboxState(db);
  const queue = db.get("SELECT COUNT(*) AS depth, COALESCE(SUM(bytes), 0) AS bytes, MIN(acceptedAt) AS oldest, SUM(CASE WHEN attempts > 0 THEN 1 ELSE 0 END) AS failedEvents FROM usageOutbox");
  return {
    accepted: state.accepted, projected: state.projected, duplicates: state.duplicates, retries: state.retries,
    errors: state.errors, rejected: state.rejected, accepting: state.accepting.size,
    depth: queue.depth, bytes: queue.bytes, failedEvents: queue.failedEvents || 0,
    oldestAgeMs: queue.oldest == null ? 0 : Math.max(0, Date.now() - queue.oldest),
  };
}
