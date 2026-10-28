import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

let emitter;
let getUsageStats;
let getActiveRequests;

beforeEach(() => {
  vi.resetModules();
  emitter = new EventEmitter();
  getUsageStats = vi.fn().mockResolvedValue({ totalRequests: 4, pending: {}, recentRequests: [] });
  getActiveRequests = vi.fn().mockResolvedValue({ activeRequests: [], recentRequests: [], errorProvider: "" });
  vi.doMock("@/lib/usageDb", () => ({ statsEmitter: emitter, getUsageStats, getActiveRequests }));
});

afterEach(() => {
  vi.doUnmock("@/lib/usageDb");
  vi.restoreAllMocks();
});

async function openStream() {
  const { GET } = await import("@/app/api/usage/stream/route.js");
  const abort = new AbortController();
  const response = await GET({ signal: abort.signal });
  const reader = response.body.getReader();
  const read = async () => {
    const result = await reader.read();
    return result.done ? null : new TextDecoder().decode(result.value);
  };
  return { abort, reader, read };
}

describe("usage dashboard stream", () => {
  it("distinguishes committed updates from pending messages and preserves legacy snapshots", async () => {
    const stream = await openStream();
    expect(await stream.read()).toContain('"totalRequests":4');
    emitter.emit("pending");
    const pending = await stream.read();
    expect(pending).toContain("data: ");
    expect(pending).not.toContain("usage-updated");

    emitter.emit("update");
    expect(await stream.read()).toBe("event: usage-updated\ndata: {}\n\n");
    expect(await stream.read()).toContain('"totalRequests":4');
    expect(await stream.read()).toContain('"totalRequests":4');
    expect(getUsageStats).toHaveBeenCalledTimes(2);

    stream.abort.abort();
    expect(await stream.read()).toBeNull();
    expect(emitter.listenerCount("update")).toBe(0);
    expect(emitter.listenerCount("pending")).toBe(0);
  });

  it("does not miss an update while the initial snapshot is still loading", async () => {
    let finish;
    getUsageStats.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const stream = await openStream();
    expect(emitter.listenerCount("update")).toBe(1);
    emitter.emit("update");
    finish({ totalRequests: 3, pending: {}, recentRequests: [] });

    expect(await stream.read()).toBe("event: usage-updated\ndata: {}\n\n");
    expect(await stream.read()).toContain('"totalRequests":3');
    expect(await stream.read()).toContain('"totalRequests":3');
    expect(await stream.read()).toContain('"totalRequests":4');
    expect(getUsageStats).toHaveBeenCalledTimes(2);
    stream.abort.abort();
  });

  it("closes a failed stream so EventSource can reconnect, without leaking listeners", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getUsageStats.mockRejectedValueOnce(new Error("synthetic failure"));
    const stream = await openStream();
    expect(await stream.read()).toBeNull();
    expect(emitter.listenerCount("update")).toBe(0);
    expect(emitter.listenerCount("pending")).toBe(0);
  });

  it("coalesces snapshot recalculations during an update burst and cleans up on cancel", async () => {
    let finish;
    getUsageStats.mockResolvedValueOnce({ totalRequests: 1, pending: {}, recentRequests: [] });
    getUsageStats.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const stream = await openStream();
    await stream.read();
    emitter.emit("update");
    await vi.waitFor(() => expect(getUsageStats).toHaveBeenCalledTimes(2));
    emitter.emit("update");
    emitter.emit("update");
    expect(getUsageStats).toHaveBeenCalledTimes(2);
    finish({ totalRequests: 2, pending: {}, recentRequests: [] });
    await vi.waitFor(() => expect(getUsageStats).toHaveBeenCalledTimes(3));
    await stream.reader.cancel();
    expect(emitter.listenerCount("update")).toBe(0);
    expect(emitter.listenerCount("pending")).toBe(0);
  });
});
