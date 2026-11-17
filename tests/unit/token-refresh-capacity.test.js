import { beforeEach, describe, expect, it, vi } from "vitest";

function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}

describe("OAuth refresh capacity preserves rotating-token single-flight", () => {
  beforeEach(() => vi.resetModules());

  it("rejects new work at capacity without forgetting or duplicating any active grant", async () => {
    const { dedupRefresh, getAcquiredRefreshResult } = await import("../../open-sse/services/tokenRefresh/dedup.js");
    const gate = deferred();
    const grant = vi.fn(() => gate.promise);
    const calls = Array.from({ length: 500 }, (_, index) => dedupRefresh("fixture", `token-${index}`, grant));
    let overflow;
    let overflowPending;
    let joined;
    try {
      overflowPending = dedupRefresh("fixture", "overflow", grant).catch(error => error);
      joined = dedupRefresh("fixture", "token-0", grant);
      await Promise.resolve();
    } finally {
      gate.resolve({ accessToken: "acquired", refreshToken: "rotated" });
      await Promise.all([...calls, joined]);
      overflow = await overflowPending;
    }
    expect(overflow).toMatchObject({ code: "TOKEN_REFRESH_CAPACITY_EXCEEDED" });
    expect(grant).toHaveBeenCalledTimes(500);
    expect(await getAcquiredRefreshResult("fixture", "token-0")).toEqual({ accessToken: "acquired", refreshToken: "rotated" });
    expect(await dedupRefresh("fixture", "overflow", async () => ({ accessToken: "later" }))).toEqual({ accessToken: "later" });
  });

  it("evicts a completed result instead of the older in-flight token", async () => {
    const { dedupRefresh } = await import("../../open-sse/services/tokenRefresh/dedup.js");
    const gate = deferred();
    const grant = vi.fn(() => gate.promise);
    const active = dedupRefresh("fixture", "active", grant);
    for (let index = 0; index < 499; index++) {
      await dedupRefresh("fixture", `completed-${index}`, async () => ({ accessToken: "completed" }));
    }
    await dedupRefresh("fixture", "new-grant", async () => ({ accessToken: "new" }));
    const joined = dedupRefresh("fixture", "active", grant);
    gate.resolve({ accessToken: "acquired", refreshToken: "rotated" });
    expect(await Promise.all([active, joined])).toEqual([
      { accessToken: "acquired", refreshToken: "rotated" },
      { accessToken: "acquired", refreshToken: "rotated" },
    ]);
    expect(grant).toHaveBeenCalledTimes(1);
  });
});
