import { afterEach, describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: (...args) => transport.fetch(...args) }));
import { BaseExecutor } from "../../open-sse/executors/base.js";

afterEach(() => { vi.restoreAllMocks(); transport.fetch.mockReset(); });

function execute(signal) {
  const executor = new BaseExecutor("cancellation-fixture", {
    baseUrls: ["https://fixture.invalid/primary", "https://fixture.invalid/fallback"],
    retry: { 502: { attempts: 2, delayMs: 3000 }, 503: { attempts: 2, delayMs: 3000 } },
  });
  return executor.execute({ model: "fixture", body: { messages: [] }, stream: false, credentials: {}, signal });
}

async function within(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve("still waiting"), 150); })]);
  } finally { clearTimeout(timer); }
}

describe("executor cancellation is terminal across network retries", () => {
  it("does not dial when the client was already aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("client_aborted");
    controller.abort(reason);
    let attempts = 0;
    transport.fetch.mockImplementation(async () => { attempts++; throw reason; });
    const outcome = execute(controller.signal).catch(error => error);
    expect(await within(outcome)).toBe(reason);
    expect(attempts).toBe(0);
  });

  it("propagates a caller's Error abort reason without retrying it as a 502", async () => {
    const controller = new AbortController();
    const reason = new Error("client_aborted");
    let attempts = 0;
    transport.fetch.mockImplementation(async () => {
      attempts++;
      controller.abort(reason);
      throw reason;
    });
    expect(await within(execute(controller.signal).catch(error => error))).toBe(reason);
    expect(attempts).toBe(1);
  });

  it("interrupts retry backoff instead of waiting before the next attempt", async () => {
    const controller = new AbortController();
    const reason = new Error("client_aborted_during_backoff");
    let attempts = 0;
    let retrying;
    const scheduled = new Promise(resolve => { retrying = resolve; });
    const executor = new BaseExecutor("cancellation-fixture", {
      baseUrl: "https://fixture.invalid/primary", retry: { 503: { attempts: 2, delayMs: 3000 } },
    });
    transport.fetch.mockImplementation(async () => { attempts++; return Response.json({ error: "temporarily unavailable" }, { status: 503 }); });
    const outcome = executor.execute({ model: "fixture", body: {}, credentials: {}, signal: controller.signal,
      log: { debug: (...args) => { if (args[0] === "RETRY") retrying(); } },
    }).catch(error => error);
    await scheduled;
    controller.abort(reason);
    expect(await within(outcome)).toBe(reason);
    expect(attempts).toBe(1);
  });
});
