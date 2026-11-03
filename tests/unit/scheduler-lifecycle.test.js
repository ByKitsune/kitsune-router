import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  clearManaged,
  createManagedInterval,
  createManagedTimeout,
  hardenEmitter,
  listManagedSchedulers,
  shutdownAllManaged,
} from "@/lib/schedulerLifecycle.mjs";

afterEach(() => {
  shutdownAllManaged();
  vi.useRealTimers();
});

describe("managed scheduler lifecycle", () => {
  it("registers and clears intervals", () => {
    const fn = vi.fn();
    const handle = createManagedInterval("test-interval", fn, 60_000);
    const list = listManagedSchedulers();
    expect(list).toContainEqual({ name: "test-interval", type: "interval" });
    clearManaged(handle);
    expect(listManagedSchedulers()).toHaveLength(0);
  });

  it("registers and clears timeouts that auto-remove themselves on fire", async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    createManagedTimeout("test-timeout", fn, 1000);
    expect(listManagedSchedulers()).toHaveLength(1);
    vi.advanceTimersByTime(1500);
    expect(fn).toHaveBeenCalledOnce();
    expect(listManagedSchedulers()).toHaveLength(0);
  });

  it("wraps tick exceptions so the interval survives", () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createManagedInterval("boom-interval", () => { throw new Error("kaboom"); }, 1000);
    vi.advanceTimersByTime(3500);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("shutdownAllManaged clears every tracked timer", () => {
    createManagedInterval("a", () => {}, 60_000);
    createManagedInterval("b", () => {}, 60_000);
    expect(listManagedSchedulers()).toHaveLength(2);
    shutdownAllManaged();
    expect(listManagedSchedulers()).toHaveLength(0);
  });
});

describe("hardenEmitter", () => {
  it("warns once when listener count crosses threshold", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const emitter = new EventEmitter();
    hardenEmitter(emitter, { name: "test", cap: 10, warnAt: 5 });

    for (let i = 0; i < 6; i++) emitter.on("x", () => {});
    // 5 listeners didn't fire warning yet, only 6 crosses the warnAt threshold.
    expect(warn).not.toHaveBeenCalled();
    emitter.emit("x");
    expect(warn).toHaveBeenCalledOnce();

    warn.mockRestore();
  });

  it("preserves the underlying emit behaviour", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const emitter = new EventEmitter();
    const fn = vi.fn();
    emitter.on("hello", fn);
    hardenEmitter(emitter, { name: "test", cap: 10, warnAt: 5 });
    emitter.emit("hello", 1, 2, 3);
    expect(fn).toHaveBeenCalledWith(1, 2, 3);
    warn.mockRestore();
  });
});
