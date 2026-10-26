const key = Symbol.for("zenrouter.shutdown.lifecycle");
const state = globalThis[key] ??= {
  hooks: new Map(),
  draining: false,
  pending: null,
};

function registerShutdownHook(name, phase, callback) {
  if (typeof name !== "string" || !Number.isFinite(phase) || typeof callback !== "function") {
    throw new TypeError("Invalid shutdown hook");
  }
  const hook = { name, phase, callback };
  state.hooks.set(name, hook);
  return () => {
    if (state.hooks.get(name) === hook) state.hooks.delete(name);
  };
}

function isShuttingDown() {
  return state.draining;
}

function runShutdownHooks({ deadlineMs = 15000 } = {}) {
  if (state.pending) return state.pending;
  if (!Number.isFinite(deadlineMs) || deadlineMs < 1) return Promise.reject(new TypeError("Invalid shutdown deadline"));
  state.draining = true;
  const deadline = Date.now() + deadlineMs;
  state.pending = (async () => {
    const phases = [...new Set([...state.hooks.values()].map(hook => hook.phase))].sort((a, b) => a - b);
    for (const phase of phases) {
      const hooks = [...state.hooks.values()].filter(hook => hook.phase === phase);
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("SHUTDOWN_DEADLINE_EXCEEDED");
      let timer;
      try {
        const completed = Promise.allSettled(hooks.map(hook => Promise.resolve().then(() => hook.callback({ deadline, remainingMs: remaining }))));
        const results = await Promise.race([
          completed,
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("SHUTDOWN_DEADLINE_EXCEEDED")), remaining); }),
        ]);
        const failures = results.filter(result => result.status === "rejected");
        if (failures.length) throw new AggregateError(failures.map(result => result.reason), "SHUTDOWN_PHASE_FAILED");
      } finally { clearTimeout(timer); }
    }
  })();
  return state.pending;
}

module.exports = { registerShutdownHook, isShuttingDown, runShutdownHooks };
