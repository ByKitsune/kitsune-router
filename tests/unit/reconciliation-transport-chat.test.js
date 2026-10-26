import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

const transport = vi.hoisted(() => ({ nativeFetch: globalThis.fetch }));
vi.hoisted(() => {
  globalThis.fetch = (url, options) => {
    if (new URL(url).hostname !== "127.0.0.1") return Promise.reject(new Error("fixture forbids direct egress"));
    return transport.nativeFetch(url, options);
  };
});
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest() {}, appendRequestLog: async () => {},
  saveRequestDetail: async () => {}, saveRequestUsage: async () => {},
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";

const servers = [];
const log = { debug() {}, info() {}, warn() {}, error() {}, line() {} };
afterAll(() => { globalThis.fetch = transport.nativeFetch; });
async function listen(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
function options(relay, extra = {}) {
  return {
    modelInfo: { provider: "claude", model: "claude-sonnet-4-6" },
    body: { messages: [{ role: "user", content: "hello" }], stream: false, max_tokens: 37 },
    credentials: { accessToken: "expired-fixture", refreshToken: "refresh-fixture",
      providerSpecificData: { strictProxy: true, vercelRelayUrl: relay } },
    log, ...extra,
  };
}

describe("chat reactive refresh transport", () => {
  it("keeps the auth refresh and retry on the resolved account relay", async () => {
    const seen = [];
    const relay = await listen(async (req, res) => {
      let text = "";
      for await (const chunk of req) text += chunk;
      seen.push({ path: req.headers["x-relay-path"], auth: req.headers.authorization, body: JSON.parse(text) });
      res.setHeader("Content-Type", "application/json");
      if (seen.length === 1) {
        res.statusCode = 401;
        res.end('{"error":{"message":"expired"}}');
      } else if (req.headers["x-relay-path"] === "/v1/oauth/token") {
        res.end('{"access_token":"fresh-fixture","refresh_token":"rotated-fixture","expires_in":3600}');
      } else {
        res.end(JSON.stringify({ id: "fixture", type: "message", role: "assistant", model: "claude-sonnet-4-6",
          content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 3, output_tokens: 1 } }));
      }
    });
    const result = await handleChatCore(options(relay));
    expect(result.success).toBe(true);
    expect((await result.response.json()).choices[0].message.content).toBe("ok");
    expect(seen.map(entry => entry.path)).toEqual(["/v1/messages?beta=true", "/v1/oauth/token", "/v1/messages?beta=true"]);
    expect(seen[2].auth).toBe("Bearer fresh-fixture");
    expect(seen[2].body.max_tokens).toBe(37);
  });

  it("returns caller cancellation rather than 502 when the fetch throws a plain Error", async () => {
    let requestSeen;
    const started = new Promise(resolve => { requestSeen = resolve; });
    const relay = await listen((_req, _res) => { requestSeen(); });
    const caller = new AbortController();
    const pending = handleChatCore(options(relay, { clientSignal: caller.signal }));
    await started;
    caller.abort(new Error("caller left"));
    const result = await pending;
    expect(result.status).toBe(499);
  });

  it("stops reactive refresh on caller cancellation instead of returning the stale 401", async () => {
    const caller = new AbortController();
    let attempts = 0;
    const relay = await listen(async (req, res) => {
      for await (const _chunk of req) { /* drain */ }
      attempts++;
      if (attempts === 1) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end('{"error":{"message":"expired"}}');
        setTimeout(() => caller.abort(new Error("caller left during refresh")), 40);
      }
    });
    const pending = handleChatCore(options(relay, { clientSignal: caller.signal }));
    const result = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve({ status: "kept refreshing" }), 400))]);
    expect(result.status).toBe(499);
    expect(attempts).toBe(2);
  });

  it("does not cool down an account when the caller cancels while its error body is pending", async () => {
    const caller = new AbortController();
    const relay = await listen((_req, res) => {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.write('{"error":{"message":"');
      setTimeout(() => caller.abort(new Error("caller left during error body")), 40);
    });
    const result = await handleChatCore({
      ...options(relay, { clientSignal: caller.signal }),
      modelInfo: { provider: "openai-compatible-fixture", model: "chat-fixture" },
      credentials: { apiKey: "fixture", providerSpecificData: {
        baseUrl: "https://chat.invalid/v1", strictProxy: true, vercelRelayUrl: relay,
      } },
    });
    expect(result.status).toBe(499);
  });
});
