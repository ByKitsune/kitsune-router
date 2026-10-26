import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

const state = vi.hoisted(() => ({ credentials: null, failures: [], directCalls: 0, usage: [], accept: null }));
const transport = vi.hoisted(() => ({ nativeFetch: globalThis.fetch }));
vi.hoisted(() => {
  globalThis.fetch = (url, options) => {
    if (new URL(url).hostname !== "127.0.0.1") {
      state.directCalls++;
      return Promise.reject(new Error("fixture forbids direct egress"));
    }
    return transport.nativeFetch(url, options);
  };
});
vi.mock("@/sse/handlers/chat.js", () => ({ handleChat: async () => { throw new Error("unexpected chat translation"); } }));
vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: async () => state.credentials,
  clearAccountError: async () => {}, isValidApiKey: async () => true,
  markAccountUnavailable: async (...args) => { state.failures.push(args); return { shouldFallback: false }; },
}));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => ({}), isApiKeyRequired: () => false }));
vi.mock("open-sse/translator/index.js", () => ({ initTranslators: async () => {} }));
vi.mock("@/lib/usageDb.js", () => ({ enqueueRequestUsage: async (entry) => { state.usage.push(entry); return state.accept?.(entry); } }));

import { POST } from "../../src/app/api/v1beta/models/[...path]/route.js";

const servers = [];
afterAll(() => { globalThis.fetch = transport.nativeFetch; });
const model = "gemini-3.1-flash-tts-preview";
const audioBody = {
  contents: [{ role: "user", parts: [{ text: "Speak naturally: hello" }] }],
  generationConfig: { maxOutputTokens: 37, responseModalities: ["AUDIO"],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
};
async function listen(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
function dispatch({ signal, stream = false } = {}) {
  const suffix = stream ? ":streamGenerateContent?alt=sse&key=client-fixture" : ":generateContent?key=client-fixture";
  return POST(new Request(`http://localhost/v1beta/models/${model}${suffix}`, {
    method: "POST", body: JSON.stringify(audioBody), signal,
    headers: { "Content-Type": "application/json", Authorization: "Bearer client-fixture" },
  }), { params: Promise.resolve({ path: [`${model}${stream ? ":streamGenerateContent" : ":generateContent"}`] }) });
}
beforeEach(() => {
  state.directCalls = 0;
  state.failures = [];
  state.usage = [];
  state.accept = null;
  state.credentials = { connectionId: "native-fixture", apiKey: "provider-fixture", providerSpecificData: {} };
  for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(name, "");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

describe("native Gemini audio transport reconciliation", () => {
  it("uses the resolved account relay while preserving native typed audio, caps, and caller-key isolation", async () => {
    const requests = [];
    const nativeBody = { candidates: [{ content: { role: "model", parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: "AAE=" } }] } }],
      usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 5, totalTokenCount: 8 } };
    const relay = await listen(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      requests.push({ target: req.headers["x-relay-target"], path: req.headers["x-relay-path"],
        key: req.headers["x-goog-api-key"], authorization: req.headers.authorization, body: JSON.parse(body) });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(nativeBody));
    });
    state.credentials.providerSpecificData = { strictProxy: true, vercelRelayUrl: relay };
    const response = await dispatch();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(nativeBody);
    expect(requests).toEqual([{ target: "https://generativelanguage.googleapis.com",
      path: `/v1beta/models/${model}:generateContent`, key: "provider-fixture", authorization: undefined, body: audioBody }]);
    expect(state.directCalls).toBe(0);
  });

  it("does not dial direct transport when strict account egress is unavailable", async () => {
    state.credentials.providerSpecificData = { strictProxy: true };
    const response = await dispatch();
    expect(response.status).toBe(502);
    expect(state.directCalls).toBe(0);
  });

  it("keeps caller cancellation attached after SSE headers and closes the local upstream socket", async () => {
    let socketClosed;
    const closed = new Promise(resolve => { socketClosed = resolve; });
    const firstFrame = 'data: {"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"audio/L16;rate=24000","data":"AAE="}}]}}]}\n\n';
    const relay = await listen(async (req, res) => {
      for await (const _chunk of req) { /* drain */ }
      res.on("close", socketClosed);
      res.setHeader("Content-Type", "text/event-stream");
      res.write(firstFrame);
    });
    state.credentials.providerSpecificData = { strictProxy: true, vercelRelayUrl: relay };
    const caller = new AbortController();
    const response = await dispatch({ signal: caller.signal, stream: true });
    const reader = response.body.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(firstFrame);
    const next = reader.read().then(() => "finished", () => "cancelled");
    caller.abort(new Error("caller left after headers"));
    expect(await Promise.race([next, new Promise(resolve => setTimeout(() => resolve("kept running"), 250))])).toBe("cancelled");
    expect(await Promise.race([closed.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 250))])).toBe(true);
    expect(state.failures).toEqual([]);
  });

  it.each([
    [429, "RESOURCE_EXHAUSTED"], [403, "PERMISSION_DENIED"], [503, "UNAVAILABLE"],
  ])("sanitizes native %s errors without discarding quota retry hints", async (status, nativeStatus) => {
    const relay = await listen((_req, res) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Retry-After", "60");
      res.end(JSON.stringify({ error: { code: status, message: "provider: gemini account private@example.test Bearer synthetic-private-token", status: nativeStatus } }));
    });
    state.credentials.providerSpecificData = { strictProxy: true, vercelRelayUrl: relay };
    const response = await dispatch();
    const body = await response.json();
    expect(response.status).toBe(status);
    expect(body.error.message).not.toMatch(/gemini|private@|synthetic-private-token/);
    expect(body.error.code).toBe(String(status));
    expect(body.error.status).toBe(nativeStatus);
    expect(response.headers.get("retry-after")).toMatch(/^6[01]$/);
    expect(state.failures[0][0]).toBe("native-fixture");
    expect(state.failures[0][1]).toBe(status);
    expect(state.failures[0][5]).toBeGreaterThan(Date.now() + 58000);
  });

  it("accepts one cumulative native usage event before EOF without changing audio framing", async () => {
    const usageMetadata = { promptTokenCount: 3, candidatesTokenCount: 5, totalTokenCount: 8 };
    const text = `data: ${JSON.stringify({ usageMetadata })}\n\ndata: ${JSON.stringify({ usageMetadata })}\n\n`;
    const relay = await listen((_req, res) => { res.setHeader("Content-Type", "text/event-stream"); res.end(text); });
    state.credentials.providerSpecificData = { strictProxy: true, vercelRelayUrl: relay };
    let accept;
    state.accept = () => new Promise(resolve => { accept = resolve; });
    const response = await dispatch({ stream: true });
    let settled = false;
    const body = response.text().then(value => { settled = true; return value; });
    await vi.waitFor(() => expect(accept).toBeTypeOf("function"));
    expect(settled).toBe(false);
    expect(state.usage).toHaveLength(1);
    expect(state.usage[0]).toMatchObject({ eventId: expect.stringMatching(/^[0-9a-f-]{36}$/), timestamp: expect.any(String),
      tokens: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 } });
    accept({ accepted: true });
    expect(await body).toBe(text);
    expect(state.usage).toHaveLength(1);
  });

  it("fails native EOF honestly when durable usage cannot be accepted", async () => {
    const relay = await listen((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 5, totalTokenCount: 8 } }));
    });
    state.credentials.providerSpecificData = { strictProxy: true, vercelRelayUrl: relay };
    state.accept = async () => { throw new Error("private database path"); };
    const response = await dispatch();
    expect(response.status).toBe(200);
    await expect(response.text()).rejects.toMatchObject({ code: "usage_acceptance_failed" });
    expect(state.failures).toEqual([]);
    expect(state.usage).toHaveLength(1);
  });
});
