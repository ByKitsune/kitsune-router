import { createHash } from "node:crypto";
import { UPSTREAM_TRANSPORT_CONFIG } from "../config/runtimeConfig.js";

const STATE_KEY = Symbol.for("kitsunerouter.upstream-transport.v1");

function transportError(message, code) {
  return Object.assign(new Error(message), { code });
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`Invalid upstream transport setting: ${name}`);
  return value;
}

function routeKey(kind, url = "") {
  return createHash("sha256").update(JSON.stringify([kind, url, "http1", "verified-tls"])).digest("hex");
}

export function createUpstreamTransportPool(config = {}) {
  const settings = { ...UPSTREAM_TRANSPORT_CONFIG, ...config };
  for (const [name, value] of Object.entries(settings)) positiveInteger(value, name);
  const routes = new Map();
  const entries = new Set();
  const excluded = new Set();
  const counters = {
    initializations: 0, created: 0, poolHits: 0, requests: 0, completed: 0,
    failed: 0, cancelled: 0, rejected: 0, queuedPeak: 0, queueWaitMs: 0,
    retired: 0, closed: 0, forced: 0, disposalErrors: 0, connectionsCreated: 0,
    bypassRequests: 0,
  };
  let queued = 0;
  let sequence = 0;
  let undiciPromise;
  let undici;
  let defaultDispatcher;
  let closing = false;
  let closePromise;
  let idleTimer;

  function loadUndici() {
    if (!undiciPromise) {
      counters.initializations++;
      undiciPromise = import("undici").then(
        module => (undici = module),
        error => { undiciPromise = null; throw error; },
      );
    }
    return undiciPromise;
  }

  function scheduleIdleSweep() {
    clearTimeout(idleTimer);
    if (closing) return;
    let next = Infinity;
    for (const entry of entries) {
      if (!entry.retired && entry.active === 0 && entry.queue.length === 0) {
        next = Math.min(next, entry.lastUsed + settings.poolIdleTimeoutMs);
      }
    }
    if (next !== Infinity) {
      idleTimer = setTimeout(() => {
        sweepIdle();
        scheduleIdleSweep();
      }, Math.max(1, next - Date.now()));
      idleTimer.unref?.();
    }
  }

  function finishDisposal(entry) {
    if (!entries.delete(entry)) return;
    counters.closed++;
    entry.resolveClosed();
    scheduleIdleSweep();
  }

  function destroyEntry(entry, error) {
    if (entry.destroying) return;
    entry.destroying = true;
    Promise.resolve().then(() => entry.raw.destroy(error)).then(
      () => finishDisposal(entry),
      () => { counters.disposalErrors++; entry.destroying = false; },
    );
  }

  function disposeIfDrained(entry) {
    if (!entry.retired || entry.active || entry.queue.length || entry.disposing || entry.destroying) return;
    entry.disposing = true;
    Promise.resolve().then(() => entry.raw.close()).then(
      () => { if (!entry.destroying) finishDisposal(entry); },
      () => {
        counters.disposalErrors++;
        destroyEntry(entry, transportError("Upstream pool close failed", "UPSTREAM_CLOSE_FAILED"));
      },
    );
  }

  function retire(entry) {
    if (entry.retired) return;
    entry.retired = true;
    entry.route.origins.delete(entry.key);
    counters.retired++;
    disposeIfDrained(entry);
  }

  function sweepIdle() {
    const now = Date.now();
    for (const entry of entries) {
      if (!entry.retired && entry.active === 0 && entry.queue.length === 0 && now - entry.lastUsed >= settings.poolIdleTimeoutMs) retire(entry);
    }
  }

  function admitRoute(spec) {
    if (closing) throw transportError("Upstream pools are closed", "UPSTREAM_POOL_CLOSED");
    let route = routes.get(spec.key);
    if (route) {
      routes.delete(spec.key);
      routes.set(spec.key, route);
      return route;
    }
    if (spec.kind !== "direct") {
      const scoped = [...routes.values()].filter(item => item.kind !== "direct");
      if (scoped.length >= settings.maxProxyRoutes) {
        const oldest = scoped[0];
        routes.delete(oldest.key);
        for (const entry of oldest.origins.values()) retire(entry);
      }
    }
    route = { ...spec, origins: new Map() };
    routes.set(spec.key, route);
    return route;
  }

  function createEntry(route, key) {
    if (route.origins.size >= settings.maxOriginsPerRoute) retire(route.origins.values().next().value);
    if (entries.size >= settings.maxLivePools) {
      const idle = [...entries].filter(entry => !entry.retired && entry.active === 0 && entry.queue.length === 0)
        .sort((left, right) => left.lastUsed - right.lastUsed)[0];
      if (idle) retire(idle);
      throw transportError("Upstream live pool limit reached", "UPSTREAM_POOL_LIMIT");
    }
    const entry = {
      id: ++sequence, key, route, active: 0, queue: [], tasks: new Set(),
      lastUsed: Date.now(), retired: false, disposing: false, destroying: false,
      connections: settings.connectionsPerOrigin,
    };
    entry.closed = new Promise(resolve => { entry.resolveClosed = resolve; });
    const options = {
      connections: entry.connections,
      maxOrigins: 1,
      pipelining: 1,
      allowH2: false,
      connectTimeout: settings.connectTimeoutMs,
      headersTimeout: settings.headersTimeoutMs,
      // Streaming deadlines belong to the caller; keep-alive applies only to idle sockets.
      bodyTimeout: 0,
      keepAliveTimeout: Math.min(settings.keepAliveTimeoutMs, settings.keepAliveMaxTimeoutMs),
      keepAliveMaxTimeout: settings.keepAliveMaxTimeoutMs,
      factory(poolOrigin, poolOptions) {
        const pool = new undici.Pool(poolOrigin, poolOptions);
        entry.pool = pool;
        pool.on("connect", () => { counters.connectionsCreated++; });
        return pool;
      },
    };
    entry.raw = route.kind === "proxy"
      ? new undici.ProxyAgent({
        ...options, uri: route.url, proxyTunnel: true,
        clientFactory(proxyOrigin, proxyOptions) {
          return new undici.Pool(proxyOrigin, { ...options, ...proxyOptions, factory: undefined });
        },
      })
      : new undici.Agent(options);
    entries.add(entry);
    route.origins.set(key, entry);
    counters.created++;
    return entry;
  }

  function finishTask(entry, task, error) {
    if (task.done) return false;
    task.done = true;
    clearTimeout(task.headersTimer);
    if (task.started) entry.active--;
    else {
      const index = entry.queue.indexOf(task);
      if (index !== -1) { entry.queue.splice(index, 1); queued--; }
    }
    entry.tasks.delete(task);
    entry.lastUsed = Date.now();
    if (error) counters.failed++;
    else counters.completed++;
    queueMicrotask(() => {
      while (entry.active < entry.connections && entry.queue.length) startTask(entry, entry.queue.shift());
      disposeIfDrained(entry);
      scheduleIdleSweep();
    });
    return true;
  }

  function startTask(entry, task) {
    if (task.done) return;
    if (task.queuedAt != null) {
      queued--;
      counters.queueWaitMs += Date.now() - task.queuedAt;
    }
    task.started = true;
    entry.active++;
    task.headersTimer = setTimeout(() => {
      if (task.done || task.reason) return;
      const error = transportError("Upstream response headers timed out", "UND_ERR_HEADERS_TIMEOUT");
      task.reason = error;
      if (task.controller) task.controller.abort(error);
      else task.notifyError(null, error);
    }, task.options.headersTimeout);
    task.headersTimer.unref?.();
    try {
      entry.raw.dispatch(task.options, {
        onRequestStart(controller) {
          task.controller = controller;
          if (task.reason) controller.abort(task.reason);
        },
        onResponseStart(controller, status, ...args) {
          if (status >= 200) clearTimeout(task.headersTimer);
          return task.handler.onResponseStart?.(controller, status, ...args);
        },
        onResponseData: (...args) => task.handler.onResponseData?.(...args),
        onResponseStarted: (...args) => task.handler.onResponseStarted?.(...args),
        onBodySent: (...args) => task.handler.onBodySent?.(...args),
        onRequestSent: (...args) => task.handler.onRequestSent?.(...args),
        onRequestUpgrade(...args) {
          try { task.handler.onRequestUpgrade?.(...args); }
          finally { finishTask(entry, task); }
        },
        onResponseEnd(...args) {
          try { task.handler.onResponseEnd?.(...args); }
          finally { finishTask(entry, task); }
        },
        onResponseError(controller, error) {
          if (finishTask(entry, task, error)) task.notifyError(controller, error);
        },
      });
    } catch (error) {
      if (finishTask(entry, task, error)) task.notifyError(task.controller, error);
    }
  }

  function dispatch(spec, options, handler) {
    let entry;
    try {
      sweepIdle();
      const route = admitRoute(spec);
      const origin = new URL(String(options.origin)).origin;
      const key = JSON.stringify([origin, options.servername || ""]);
      entry = route.origins.get(key);
      if (entry) {
        counters.poolHits++;
        route.origins.delete(key);
        route.origins.set(key, entry);
      } else entry = createEntry(route, key);
      if (entry.active >= entry.connections && (entry.queue.length >= settings.maxQueuedPerOrigin || queued >= settings.maxQueuedTotal)) {
        throw transportError("Upstream request queue limit reached", "UPSTREAM_QUEUE_LIMIT");
      }
    } catch (error) {
      counters.rejected++;
      handler.onResponseError?.(null, error);
      return false;
    }
    counters.requests++;
    const task = { options, handler, started: false, done: false, controller: null, notified: false };
    task.notifyError = (controller, error) => {
      if (task.notified) return;
      task.notified = true;
      handler.onResponseError?.(controller, error);
    };
    const controller = {
      get aborted() { return !!task.reason; },
      get paused() { return task.controller?.paused || false; },
      get reason() { return task.reason || null; },
      pause() { task.controller?.pause(); },
      resume() { task.controller?.resume(); },
      abort(reason) {
        if (task.done || task.reason) return;
        task.reason = reason || new DOMException("Aborted", "AbortError");
        counters.cancelled++;
        if (task.controller) task.controller.abort(task.reason);
        else {
          // A connecting Client has no request controller yet. Keep its lease
          // until onRequestStart/error so cancelled dials cannot grow its queue.
          if (!task.started) finishTask(entry, task, task.reason);
          task.notifyError(controller, task.reason);
        }
      },
    };
    task.abort = controller.abort;
    entry.tasks.add(task);
    try { handler.onRequestStart?.(controller, null); }
    catch (error) { controller.abort(error); }
    if (task.done) return false;
    if (entry.active < entry.connections) startTask(entry, task);
    else {
      task.queuedAt = Date.now();
      entry.queue.push(task);
      queued++;
      counters.queuedPeak = Math.max(counters.queuedPeak, queued);
    }
    return true;
  }

  async function getDispatcher({ proxyUrl = null, relayUrl = null, headersTimeoutMs = null } = {}) {
    if (closing) throw transportError("Upstream pools are closed", "UPSTREAM_POOL_CLOSED");
    if (headersTimeoutMs != null) positiveInteger(headersTimeoutMs, "headersTimeoutMs");
    await loadUndici();
    if (closing) throw transportError("Upstream pools are closed", "UPSTREAM_POOL_CLOSED");
    const kind = proxyUrl ? "proxy" : relayUrl ? "relay" : "direct";
    const url = proxyUrl || relayUrl || "";
    const key = routeKey(kind, url);
    if (kind === "direct" && defaultDispatcher && headersTimeoutMs == null) return defaultDispatcher;
    const route = admitRoute({ kind, url, key });
    const wrap = timeout => new undici.Dispatcher1Wrapper({
      dispatch: (options, handler) => dispatch({ kind, url, key }, {
        ...options, headersTimeout: timeout ?? settings.headersTimeoutMs, bodyTimeout: 0,
      }, handler),
      close: () => close(),
      destroy: () => close({ timeoutMs: 0 }),
    });
    if (!route.dispatcher) route.dispatcher = wrap(null);
    if (kind === "direct") defaultDispatcher = route.dispatcher;
    return headersTimeoutMs == null ? route.dispatcher : wrap(headersTimeoutMs);
  }

  function configure(patch) {
    if (closing) throw transportError("Upstream pools are closed", "UPSTREAM_POOL_CLOSED");
    for (const [name, value] of Object.entries(patch)) {
      if (!Object.hasOwn(settings, name)) throw new TypeError(`Unknown upstream transport setting: ${name}`);
      positiveInteger(value, name);
    }
    Object.assign(settings, patch);
    for (const entry of entries) retire(entry);
    const scoped = [...routes.values()].filter(route => route.kind !== "direct");
    while (scoped.length > settings.maxProxyRoutes) routes.delete(scoped.shift().key);
    scheduleIdleSweep();
    return { ...settings };
  }

  function trackBypass(abort) {
    if (closing) throw transportError("Upstream pools are closed", "UPSTREAM_POOL_CLOSED");
    counters.bypassRequests++;
    let release;
    const request = { abort, done: new Promise(resolve => { release = resolve; }) };
    excluded.add(request);
    return () => { excluded.delete(request); release(); };
  }

  function stats() {
    const live = [...entries];
    return {
      ...counters, closing, active: live.reduce((sum, entry) => sum + entry.active, 0), queued,
      livePools: live.length,
      readyPools: live.filter(entry => !entry.retired).length,
      drainingPools: live.filter(entry => entry.retired).length,
      proxyRoutes: [...routes.values()].filter(route => route.kind !== "direct").length,
      settings: { ...settings },
      excluded: { mitmBypass: { pooled: false, reason: "single-use pinned DNS and hostname-verified TLS", active: excluded.size, requests: counters.bypassRequests } },
      pools: live.map(entry => ({
        id: entry.id, kind: entry.route.kind, retired: entry.retired, active: entry.active,
        queued: entry.queue.length, connected: entry.pool?.stats?.connected || 0,
      })),
    };
  }

  async function waitUntil(promise, deadline) {
    let timer;
    const complete = await Promise.race([
      promise.then(() => true),
      new Promise(resolve => { timer = setTimeout(() => resolve(false), Math.max(0, deadline - Date.now())); }),
    ]);
    clearTimeout(timer);
    return complete;
  }

  function close({ timeoutMs = settings.closeTimeoutMs } = {}) {
    if (closePromise) return closePromise;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new TypeError("Invalid upstream close timeout");
    closing = true;
    clearTimeout(idleTimer);
    closePromise = (async () => {
      const deadline = Date.now() + timeoutMs;
      const error = transportError("Upstream pools are closing", "UPSTREAM_POOL_CLOSED");
      for (const entry of entries) {
        for (const task of [...entry.queue]) task.abort(error);
        retire(entry);
      }
      routes.clear();
      const drained = Promise.all([...entries].map(entry => entry.closed).concat([...excluded].map(request => request.done)));
      // Reserve the final tenth of the caller's budget for forced socket cleanup.
      const timedOut = !await waitUntil(drained, deadline - Math.ceil(timeoutMs / 10));
      if (timedOut) {
        for (const entry of entries) {
          counters.forced++;
          for (const task of [...entry.tasks]) task.abort(error);
          destroyEntry(entry, error);
        }
        for (const request of excluded) request.abort(error);
        await waitUntil(drained, deadline);
      }
      return { timedOut, ...stats() };
    })();
    return closePromise;
  }

  return { getDispatcher, configure, stats, close, trackBypass };
}

const pool = (globalThis[STATE_KEY] ??= createUpstreamTransportPool());

export const getUpstreamDispatcher = options => pool.getDispatcher(options);
export const configureUpstreamPools = settings => pool.configure(settings);
export const getUpstreamPoolStats = () => pool.stats();
export const closeUpstreamPools = options => pool.close(options);
export const trackBypassRequest = abort => pool.trackBypass(abort);
