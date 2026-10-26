import { performance } from "node:perf_hooks";

const key = Symbol.for("zenrouter.request.timings");
const samples = globalThis[key] ??= new Map();
const MAX_SAMPLES = 256;

export function recordRequestPhase(phase, milliseconds) {
  if (process.env.ZENROUTER_REQUEST_TIMING !== "1" || !Number.isFinite(milliseconds) || milliseconds < 0) return;
  let entry = samples.get(phase);
  if (!entry) {
    if (samples.size >= 32) return;
    entry = { count: 0, totalMs: 0, maximumMs: 0, values: [], next: 0 };
    samples.set(phase, entry);
  }
  entry.count++;
  entry.totalMs += milliseconds;
  entry.maximumMs = Math.max(entry.maximumMs, milliseconds);
  entry.values[entry.next] = milliseconds;
  entry.next = (entry.next + 1) % MAX_SAMPLES;
}

export function startRequestPhase(phase) {
  if (process.env.ZENROUTER_REQUEST_TIMING !== "1") return () => {};
  const started = performance.now();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    recordRequestPhase(phase, performance.now() - started);
  };
}

export function getRequestPhaseMetrics() {
  return [...samples].map(([phase, entry]) => {
    const sorted = [...entry.values].sort((a, b) => a - b);
    const percentile = value => sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)] ?? 0;
    return { phase, count: entry.count, totalMs: entry.totalMs, maximumMs: entry.maximumMs, windowSamples: sorted.length, p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) };
  });
}
