import { describe, expect, it } from "vitest";
import { dedupRefresh } from "../../open-sse/services/tokenRefresh/dedup.js";

let identity = 0;
function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}
function promptly(promise) {
  return Promise.race([promise, new Promise(resolve => setTimeout(() => resolve("still waiting"), 100))]);
}

describe("shared refresh caller cancellation", () => {
  it("does not start a refresh for an already-cancelled caller", async () => {
    const caller = new AbortController();
    const reason = new Error("cancel before refresh");
    caller.abort(reason);
    let calls = 0;
    const outcome = await dedupRefresh("fixture", `preabort-${++identity}`, async () => {
      calls++;
      return { accessToken: "unexpected" };
    }, null, null, caller.signal).then(value => value, error => error);
    expect(outcome).toBe(reason);
    expect(calls).toBe(0);
  });

  it.each([0, 1])("isolates cancellation of waiter %s while the other waiter receives the rotated result", async cancelled => {
    const callers = [new AbortController(), new AbortController()];
    const release = deferred();
    let sharedSignal;
    let calls = 0;
    const refresh = async signal => {
      sharedSignal = signal;
      calls++;
      return release.promise;
    };
    const token = `independent-${++identity}`;
    const pending = callers.map(caller => dedupRefresh("fixture", token, refresh, null, null, caller.signal)
      .then(value => value, error => error));
    const reason = new Error("one caller left");
    callers[cancelled].abort(reason);
    const cancelledResult = await promptly(pending[cancelled]);
    const sharedAborted = sharedSignal?.aborted;
    release.resolve({ accessToken: "fresh", refreshToken: "rotated" });
    const results = await Promise.all(pending);
    expect(cancelledResult).toBe(reason);
    expect(sharedAborted).toBe(false);
    expect(results[1 - cancelled]).toEqual({ accessToken: "fresh", refreshToken: "rotated" });
    expect(calls).toBe(1);
    expect(await dedupRefresh("fixture", token, refresh)).toEqual({ accessToken: "fresh", refreshToken: "rotated" });
    expect(calls).toBe(1);
  });

  it("aborts abandoned work and does not cache its cancellation as a failed refresh", async () => {
    const caller = new AbortController();
    const entered = deferred();
    const release = deferred();
    let sharedSignal;
    const token = `abandoned-${++identity}`;
    const pending = dedupRefresh("fixture", token, async signal => {
      sharedSignal = signal;
      entered.resolve();
      await release.promise;
      return null;
    }, null, null, caller.signal).then(value => value, error => error);
    await entered.promise;
    const reason = new Error("last caller left");
    caller.abort(reason);
    const outcome = await promptly(pending);
    const didAbort = sharedSignal?.aborted;
    release.resolve();
    await pending;
    const recovered = await dedupRefresh("fixture", token, async () => ({ accessToken: "retry" }));
    expect(outcome).toBe(reason);
    expect(didAbort).toBe(true);
    expect(recovered).toEqual({ accessToken: "retry" });
  });

  it("never starts deferred network work if every waiter cancels in the same turn", async () => {
    const caller = new AbortController();
    let calls = 0;
    const pending = dedupRefresh("fixture", `same-turn-${++identity}`, async () => {
      calls++;
      return { accessToken: "unexpected" };
    }, null, null, caller.signal).then(value => value, error => error);
    const reason = new Error("cancel immediately");
    caller.abort(reason);
    expect(await pending).toBe(reason);
    expect(calls).toBe(0);
  });

  it("retains an already-acquired rotating result for the next caller instead of retrying its consumed old token", async () => {
    const caller = new AbortController();
    const entered = deferred();
    const acquired = deferred();
    const token = `acquired-${++identity}`;
    const first = dedupRefresh("fixture", token, async () => {
      entered.resolve();
      return acquired.promise;
    }, null, null, caller.signal).catch(error => error);
    await entered.promise;
    const reason = new Error("left while acquired result settled");
    caller.abort(reason);
    acquired.resolve({ accessToken: "known-access", refreshToken: "known-rotation" });
    expect(await first).toBe(reason);
    await new Promise(resolve => setImmediate(resolve));
    let retried = false;
    const next = await dedupRefresh("fixture", token, async () => {
      retried = true;
      return { error: "invalid_grant" };
    });
    expect(retried).toBe(false);
    expect(next).toEqual({ accessToken: "known-access", refreshToken: "known-rotation" });
  });
});
