import { describe, expect, it } from "vitest";
import { createQuotaSnapshotCache } from "@/sse/services/quotaAwareSelection.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("quota snapshot generation hook", () => {
  it("expires a warmed exhausted snapshot immediately when the generation changes", async () => {
    let generation = 1;
    const cache = createQuotaSnapshotCache({ getGeneration: () => generation });
    await cache.getOrFetch("same-id", async () => ({ blockingExhausted: true }));

    generation++;

    expect(cache.get("same-id")).toBeNull();
    expect(await cache.getOrFetch("same-id", async () => ({ blockingExhausted: false }))).toMatchObject({ blockingExhausted: false });
  });

  it("discards a delayed snapshot even before another cache reader notices the import", async () => {
    let generation = 1;
    const cache = createQuotaSnapshotCache({ getGeneration: () => generation });
    const old = deferred();
    const oldRead = cache.getOrFetch("same-id", () => old.promise);

    generation++;
    old.resolve({ blockingExhausted: true });

    expect(await oldRead).toBeNull();
    expect(cache.get("same-id")).toBeNull();
  });

  it("does not remove a new singleflight when an obsolete fetch completes", async () => {
    let generation = 1;
    const cache = createQuotaSnapshotCache({ getGeneration: () => generation });
    const old = deferred();
    const current = deferred();
    const oldRead = cache.getOrFetch("same-id", () => old.promise);

    generation++;
    const currentRead = cache.getOrFetch("same-id", () => current.promise);
    old.resolve({ blockingExhausted: true });
    expect(await oldRead).toBeNull();
    const concurrentRead = cache.getOrFetch("same-id", async () => ({ wrongSingleflight: true }));
    current.resolve({ blockingExhausted: false });

    const snapshot = await currentRead;
    expect(snapshot).toMatchObject({ blockingExhausted: false });
    expect(await concurrentRead).toBe(snapshot);
    expect(cache.get("same-id")).toBe(snapshot);
  });

  it("does not fall back to a pre-import exhausted snapshot when its refresh fails", async () => {
    let generation = 1;
    let now = 1000;
    const cache = createQuotaSnapshotCache({ ttlMs: 1, now: () => now, getGeneration: () => generation });
    await cache.getOrFetch("same-id", async () => ({ blockingExhausted: true }));
    now++;
    const old = deferred();
    const oldRead = cache.getOrFetch("same-id", () => old.promise);

    generation++;
    old.reject(new Error("old credential rejected"));

    expect(await oldRead).toBeNull();
    expect(cache.get("same-id")).toBeNull();
  });
});
