import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const levels = ["log", "info", "warn", "error", "debug"];
let oldState;
let responses;

beforeEach(() => {
  oldState = Object.getOwnPropertyDescriptor(globalThis, "_consoleLogBufferState");
  delete globalThis._consoleLogBufferState;
  responses = [];
  vi.resetModules();
  vi.useFakeTimers();
  for (const level of levels) vi.spyOn(console, level).mockImplementation(() => {});
});

afterEach(async () => {
  for (const response of responses) await response.body?.cancel().catch(() => {});
  const state = globalThis._consoleLogBufferState;
  if (state?.flushTimer) clearTimeout(state.flushTimer);
  if (oldState) Object.defineProperty(globalThis, "_consoleLogBufferState", oldState);
  else delete globalThis._consoleLogBufferState;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function capture() {
  const captureModule = await import("@/lib/consoleLogBuffer.js");
  captureModule.initConsoleLogCapture();
  return captureModule;
}

describe("console diagnostics cannot break request processing", () => {
  it.each([undefined, Symbol("diagnostic"), () => {}, 123n])("accepts ordinary console values: %s", async value => {
    const log = await capture();
    expect(() => console.log(value)).not.toThrow();
    expect(log.getConsoleLogs()).toHaveLength(1);
    expect(typeof log.getConsoleLogs()[0]).toBe("string");
  });

  it("does not invoke application getters or toJSON while capturing a diagnostic", async () => {
    const log = await capture();
    const getter = vi.fn(() => { throw new Error("application getter must remain untouched"); });
    const toJSON = vi.fn(() => { throw new Error("application serializer must remain untouched"); });
    const value = { safe: "visible diagnostic", toJSON };
    Object.defineProperty(value, "dangerous", { enumerable: true, get: getter });
    expect(() => console.log(value)).not.toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
    expect(log.getConsoleLogs()[0]).toContain("visible diagnostic");
  });

  it("bounds Unicode lines and the entire retained buffer by bytes", async () => {
    const log = await capture();
    for (let index = 0; index < 200; index++) console.log(`${index}:` + "界".repeat(50_000));
    const lines = log.getConsoleLogs();
    expect(lines.length).toBeLessThanOrEqual(200);
    expect(lines.length).toBeGreaterThan(0);
    expect(Math.max(...lines.map(line => Buffer.byteLength(line)))).toBeLessThanOrEqual(8192);
    expect(lines.reduce((sum, line) => sum + Buffer.byteLength(line), 0)).toBeLessThanOrEqual(512 * 1024);
    expect(lines.some(line => line.includes("[truncated]"))).toBe(true);
  });

  it("does not replay pre-clear pending lines to SSE subscribers", async () => {
    const log = await capture();
    const batches = [];
    log.getConsoleEmitter().on("lines", lines => batches.push(lines));
    console.log("before clear");
    log.clearConsoleLogs();
    await vi.advanceTimersByTimeAsync(150);
    expect(log.getConsoleLogs()).toEqual([]);
    expect(batches.flat()).not.toContain("before clear");
  });

  it("isolates subscriber failures from console methods and subsequent subscribers", async () => {
    const log = await capture();
    const healthy = vi.fn();
    log.getConsoleEmitter().on("lines", () => { throw new Error("disconnected subscriber"); });
    log.getConsoleEmitter().on("lines", healthy);
    expect(() => { for (let i = 0; i < 50; i++) console.log(`line ${i}`); }).not.toThrow();
    expect(healthy).toHaveBeenCalledOnce();
    expect(healthy.mock.calls[0][0]).toHaveLength(50);
  });

  it("returns snapshots that cannot mutate retained history", async () => {
    const log = await capture();
    console.log("retained diagnostic");
    const snapshot = log.getConsoleLogs();
    snapshot.length = 0;
    snapshot.push("forged diagnostic");
    expect(log.getConsoleLogs()).toEqual(["retained diagnostic"]);
  });
});

describe("console SSE lifecycle and slow consumers", () => {
  it("does not register listeners for an already-aborted request", async () => {
    const log = await capture();
    const route = await import("@/app/api/translator/console-logs/stream/route.js");
    const controller = new AbortController();
    controller.abort(new Error("caller already left"));
    const response = await route.GET(new Request("http://localhost/api/translator/console-logs/stream", { signal: controller.signal }));
    responses.push(response);
    expect(log.getConsoleEmitter().listenerCount("lines")).toBe(0);
    const reader = response.body.getReader();
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    reader.releaseLock();
  });

  it("removes its abort handler on ordinary stream cancellation", async () => {
    const log = await capture();
    const route = await import("@/app/api/translator/console-logs/stream/route.js");
    const controller = new AbortController();
    const request = new Request("http://localhost/api/translator/console-logs/stream", { signal: controller.signal });
    const remove = vi.spyOn(request.signal, "removeEventListener");
    const response = await route.GET(request);
    await response.body.cancel();
    expect(log.getConsoleEmitter().listenerCount("lines")).toBe(0);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("closes a slow subscriber rather than accumulating an unbounded live queue", async () => {
    const log = await capture();
    console.log("initial history");
    await vi.advanceTimersByTimeAsync(150);
    const route = await import("@/app/api/translator/console-logs/stream/route.js");
    const response = await route.GET(new Request("http://localhost/api/translator/console-logs/stream"));
    responses.push(response);
    for (let i = 0; i < 100; i++) console.log(`live diagnostic ${i}`);
    expect(log.getConsoleEmitter().listenerCount("lines")).toBe(0);
    const reader = response.body.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("initial history");
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    reader.releaseLock();
  });
});
