import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEventListeners } from "node:events";
import { createServer } from "node:http2";
import { CursorExecutor } from "../../open-sse/executors/cursor.js";
const imageFixture = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/translator/concerns/image.js", async (original) => ({
  ...await original(), fetchImageAsBase64: (...args) => imageFixture.fetch(...args),
}));

const MODEL = "claude-sonnet-4.6";
const credentials = { accessToken: "offline-cursor-cancellation-fixture", providerSpecificData: { machineId: "a".repeat(64) } };
// Connect EndStreamResponse: the successful terminal frame is JSON {}, not protobuf.
const END_SUCCESS = Buffer.from("02000000027b7d", "hex");

beforeEach(() => {
  for (const key of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"]) vi.stubEnv(key, "");
});
afterEach(() => vi.unstubAllEnvs());

async function observeSettlement(promise) {
  let timer;
  try {
    return await Promise.race([
      promise.then((value) => ({ state: "fulfilled", value }), (reason) => ({ state: "rejected", reason })),
      new Promise((resolve) => { timer = setTimeout(() => resolve({ state: "pending" }), 1000); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function openLoopback(onRun) {
  const server = createServer();
  const sessions = new Set();
  const runs = [];
  let receivedRun;
  let closedSession;
  const firstRun = new Promise((resolve) => { receivedRun = resolve; });
  const sessionClosed = new Promise((resolve) => { closedSession = resolve; });
  server.on("session", (session) => {
    sessions.add(session);
    session.on("error", () => {});
    session.once("close", () => {
      sessions.delete(session);
      closedSession();
    });
  });
  server.on("stream", (stream) => {
    let pending = Buffer.alloc(0);
    stream.on("error", () => {});
    stream.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 5 && pending.length >= 5 + pending.readUInt32BE(1)) {
        const size = 5 + pending.readUInt32BE(1);
        const frame = pending.subarray(0, size);
        pending = pending.subarray(size);
        if (frame[0] === 0 && frame[5] === 0x0a) {
          runs.push(frame);
          receivedRun();
          onRun(stream);
        }
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const executor = new CursorExecutor();
  executor.buildUrl = () => `http://127.0.0.1:${server.address().port}/agent.v1.AgentService/Run`;
  return {
    executor, runs, firstRun, sessionClosed,
    async close() {
      for (const session of sessions) session.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function execute(executor, signal, stream) {
  return executor.execute({ model: MODEL, body: { messages: [{ role: "user", content: "hi" }] }, credentials, signal, stream });
}

describe("Cursor native HTTP/2 cancellation", () => {
  it("preserves cancellation during image preparation without sending inference", async () => {
    const fixture = await openLoopback(() => {});
    const controller = new AbortController();
    let started;
    const fetching = new Promise(resolve => { started = resolve; });
    imageFixture.fetch.mockImplementation(async (_url, { signal }) => {
      started();
      await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true }));
      return null;
    });
    try {
      const pending = fixture.executor.execute({ model: MODEL, credentials, stream: false, signal: controller.signal,
        body: { messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://synthetic-image.test/a.png" } }] }] } });
      await fetching;
      controller.abort();
      const outcome = await observeSettlement(pending);
      expect(outcome.state).toBe("rejected");
      expect(outcome.reason).toMatchObject({ name: "AbortError" });
      expect(fixture.runs).toHaveLength(0);
    } finally {
      imageFixture.fetch.mockReset();
      await fixture.close();
    }
  });

  it.each([false, true])("rejects an already-cancelled request without sending a Run frame (stream=%s)", async (stream) => {
    const fixture = await openLoopback((upstream) => {
      upstream.respond({ ":status": 200, "content-type": "application/connect+proto" });
      upstream.end(END_SUCCESS);
    });
    const controller = new AbortController();
    controller.abort();
    try {
      const outcome = await observeSettlement(execute(fixture.executor, controller.signal, stream));
      expect(outcome.state, "already-cancelled execution must reject promptly").toBe("rejected");
      expect(outcome.reason).toMatchObject({ name: "AbortError" });
      expect(fixture.runs, "an already-cancelled caller must never start inference").toHaveLength(0);
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    } finally {
      await fixture.close();
    }
  });

  it.each([false, true])("settles cancellation before headers and closes the owned HTTP/2 session (stream=%s)", async (stream) => {
    // Deliberately never send response headers, even after receiving the Run.
    const fixture = await openLoopback(() => {});
    const controller = new AbortController();
    const execution = execute(fixture.executor, controller.signal, stream);
    const outcomePromise = observeSettlement(execution);
    try {
      expect((await observeSettlement(fixture.firstRun)).state).toBe("fulfilled");
      controller.abort();
      const outcome = await outcomePromise;
      expect(outcome.state, "pre-header abort must not orphan executeAgent's pending header await").toBe("rejected");
      expect(outcome.reason).toMatchObject({ name: "AbortError" });
      expect((await observeSettlement(fixture.sessionClosed)).state, "cancellation must close the connection without fixture cleanup").toBe("fulfilled");
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    } finally {
      controller.abort();
      await fixture.close();
    }
  });

  it("rejects and releases the owned session when the peer closes before headers without an error", async () => {
    const fixture = await openLoopback((upstream) => upstream.close());
    const controller = new AbortController();
    try {
      const outcome = await observeSettlement(fixture.executor.executeAgent({ model: MODEL, body: { messages: [{ role: "user", content: "hi" }] }, credentials, signal: controller.signal, stream: false }));
      expect(outcome.state, "a clean pre-header close must settle the header promise").toBe("rejected");
      expect(outcome.reason.message).toMatch(/clos|end|EOF/i);
      expect((await observeSettlement(fixture.sessionClosed)).state).toBe("fulfilled");
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    } finally {
      controller.abort();
      await fixture.close();
    }
  });

  it("detaches caller cancellation after a completed native Run", async () => {
    const fixture = await openLoopback((upstream) => {
      upstream.respond({ ":status": 200, "content-type": "application/connect+proto" });
      upstream.end(END_SUCCESS);
    });
    const controller = new AbortController();
    try {
      const outcome = await observeSettlement(execute(fixture.executor, controller.signal, false));
      expect(outcome.state).toBe("fulfilled");
      expect(outcome.value.response.status).toBe(200);
      expect(getEventListeners(controller.signal, "abort"), "completed requests must not retain their request controller on the caller signal").toHaveLength(0);
      expect((await observeSettlement(fixture.sessionClosed)).state).toBe("fulfilled");
    } finally {
      controller.abort();
      await fixture.close();
    }
  });
});
