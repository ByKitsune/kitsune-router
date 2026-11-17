import { EventEmitter } from "events";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config.js";
import { hardenEmitter } from "@/lib/schedulerLifecycle.mjs";
import { CONSOLE_CAPTURE_LIMITS } from "open-sse/config/logging.js";
import { formatLogArguments } from "open-sse/utils/logSanitizer.js";

const consoleLevels = ["log", "info", "warn", "error", "debug"];

if (!global._consoleLogBufferState) {
  global._consoleLogBufferState = {
    logs: [],
    patched: false,
    originals: {},
    emitter: new EventEmitter(),
  };
}

const state = global._consoleLogBufferState;

// Ensure emitter exists (handles hot reload with stale global)
if (!state.emitter) {
  state.emitter = new EventEmitter();
}

// One disconnected subscriber must not interrupt a request or other clients.
if (!state.emitter._safeConsoleDispatch) {
  state.emitter.emit = function emitSafely(event, ...args) {
    const listeners = this.rawListeners(event);
    for (const listener of listeners) {
      try { listener.apply(this, args); } catch { /* Best-effort diagnostics. */ }
    }
    return listeners.length > 0;
  };
  state.emitter._safeConsoleDispatch = true;
  hardenEmitter(state.emitter, {
    name: "consoleLogEmitter", cap: CONSOLE_CAPTURE_LIMITS.listenerCap, warnAt: CONSOLE_CAPTURE_LIMITS.listenerWarnAt,
  });
}

if (!state.pendingLines) state.pendingLines = [];
if (!state.flushTimer) state.flushTimer = null;
if (!Number.isFinite(state.bytes)) state.bytes = state.logs.reduce((sum, line) => sum + Buffer.byteLength(line), 0);

function flushPendingLines() {
  state.flushTimer = null;
  if (!state.pendingLines.length) return;

  const lines = state.pendingLines.splice(0, state.pendingLines.length);
  state.emitter.emit("lines", lines);
}

function scheduleFlush() {
  if (state.flushTimer) return;
  state.flushTimer = setTimeout(flushPendingLines, CONSOLE_CAPTURE_LIMITS.flushIntervalMs);
  state.flushTimer?.unref?.();
}

function appendLine(line) {
  state.logs.push(line);
  state.bytes += Buffer.byteLength(line);
  const maxLines = CONSOLE_LOG_CONFIG.maxLines;
  while (state.logs.length > maxLines || state.bytes > CONSOLE_CAPTURE_LIMITS.maxBytes) {
    state.bytes -= Buffer.byteLength(state.logs.shift());
  }
  state.pendingLines.push(line);
  if (state.pendingLines.length >= CONSOLE_CAPTURE_LIMITS.batchLines) {
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
    }
    flushPendingLines();
  } else {
    scheduleFlush();
  }
}

export function initConsoleLogCapture() {
  if (state.patched && state.captureVersion === 1) return;

  for (const level of consoleLevels) {
    state.originals[level] ||= console[level];
    console[level] = (...args) => {
      try { appendLine(formatLogArguments(args)); } catch { /* Capture cannot break the caller. */ }
      state.originals[level](...args);
    };
  }

  state.patched = true;
  state.captureVersion = 1;
}

export function getConsoleLogs() {
  return [...state.logs];
}

export function clearConsoleLogs() {
  state.logs = [];
  state.bytes = 0;
  state.pendingLines = [];
  if (state.flushTimer) clearTimeout(state.flushTimer);
  state.flushTimer = null;
  state.emitter.emit("clear");
}

export function getConsoleEmitter() {
  return state.emitter;
}
