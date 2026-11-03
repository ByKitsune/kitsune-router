// Long-uptime scheduler lifecycle hardening.
//
// Both `setInterval` and `EventEmitter` keep Node.js event-loop references alive by
// default. That is fine for a CLI tool, but on a gateway meant to run for days the
// side-effects add up: a flaky interval will keep the process from exiting gracefully
// during shutdown, and a recurring "MaxListenersExceededWarning" is the only signal
// that the dashboard SSE route is leaking listeners.
//
// We use this helper to (1) remember every interval/timeout we start so a clean
// stop() can release all of them, and (2) clamp the listeners warning threshold so
// the leak detector actually fires before it causes problems.
//
// Failures here should never affect request handling — the gateway must keep
// serving even if cleanup misbehaves.

const schedulers = new Set();

export function createManagedInterval(name, fn, ms) {
  const handle = setInterval(() => {
    try {
      fn();
    } catch (err) {
      console.warn(`[scheduler:${name}] tick error:`, err?.message || err);
    }
  }, ms);
  if (handle.unref) handle.unref();
  schedulers.add({ name, handle, type: "interval" });
  return handle;
}

export function createManagedTimeout(name, fn, ms) {
  const handle = setTimeout(() => {
    schedulers.delete(entry);
    try {
      fn();
    } catch (err) {
      console.warn(`[scheduler:${name}] task error:`, err?.message || err);
    }
  }, ms);
  if (handle.unref) handle.unref();
  const entry = { name, handle, type: "timeout" };
  schedulers.add(entry);
  return handle;
}

export function clearManaged(handle) {
  if (!handle) return;
  for (const entry of schedulers) {
    if (entry.handle === handle) {
      if (entry.type === "interval") clearInterval(handle);
      else clearTimeout(handle);
      schedulers.delete(entry);
      return;
    }
  }
  // Fallback: handle wasn't registered (likely from outside this helper).
  clearInterval(handle);
  clearTimeout(handle);
}

export function shutdownAllManaged() {
  for (const entry of Array.from(schedulers)) {
    try {
      if (entry.type === "interval") clearInterval(entry.handle);
      else clearTimeout(entry.handle);
    } catch {
      /* best effort */
    }
    schedulers.delete(entry);
  }
}

export function listManagedSchedulers() {
  return Array.from(schedulers).map((entry) => ({
    name: entry.name,
    type: entry.type,
  }));
}

const LISTENER_DEFAULT_CAP = 50;
const LISTENER_WARN_THRESHOLD = 40;

/**
 * Install a safe listener cap on a process-wide emitter. The cap is the absolute
 * ceiling; the warn threshold surfaces a warning before the warning would otherwise
 * flood logs.
 */
export function hardenEmitter(emitter, { name = "emitter", cap = LISTENER_DEFAULT_CAP, warnAt = LISTENER_WARN_THRESHOLD } = {}) {
  if (!emitter || typeof emitter.setMaxListeners !== "function") return;
  emitter.setMaxListeners(cap);

  const original = emitter.emit.bind(emitter);
  const warnedAtByEvent = new Map();
  emitter.emit = function patchedEmit(event, ...args) {
    const count = emitter.listenerCount(event);
    const highWater = warnedAtByEvent.get(event) || 0;
    if (count >= warnAt && count > highWater) {
      warnedAtByEvent.set(event, count);
      console.warn(
        `[${name}] listener count for "${event}" reached ${count} (cap ${cap}); ` +
          "check SSE handler cleanup on client disconnect"
      );
    }
    return original(event, ...args);
  };

  return () => {
    emitter.emit = original;
  };
}
