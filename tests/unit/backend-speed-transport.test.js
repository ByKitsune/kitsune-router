import { createServer } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "../translator/registerAll.js";

// Only persistence and the external HTTP boundary are substituted. The real
// core, translators, executors, JSON serializer and a loopback HTTP server run.
const fixture = vi.hoisted(() => ({ base: "", requests: [], urls: [], tier: "default", status: 200, sse: false }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (url, init) => {
    fixture.urls.push(String(url));
    return fetch(`${fixture.base}${new URL(url).pathname}`, init);
  },
}));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
  appendProviderChunk() {}, appendConvertedChunk() {}, flush() {},
}) }));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { CodexExecutor } from "../../open-sse/executors/codex.js";

let server;
beforeAll(async () => {
  server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    fixture.requests.push({ path: request.url, headers: request.headers, body });
    response.writeHead(fixture.status, { "Content-Type": fixture.sse ? "text/event-stream" : "application/json" });
    if (fixture.status !== 200) {
      response.end(JSON.stringify({ error: { message: "Ultrafast requires workspace permission", code: "unsupported_service_tier", param: "service_tier" } }));
      return;
    }
    const tier = fixture.tier == null ? {} : { service_tier: fixture.tier };
    const result = request.url.endsWith("/responses")
      ? { id: "resp_fixture", object: "response", status: "completed", model: body.model,
          output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }],
          usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 }, ...tier }
      : { id: "chatcmpl_fixture", object: "chat.completion", model: body.model,
          choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }, ...tier };
    if (fixture.sse) {
      const events = request.url.endsWith("/responses")
        ? [{ type: "response.output_text.delta", delta: "ok" }, { type: "response.completed", response: result }]
        : [{ ...result, object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "ok" }, finish_reason: "stop" }] }];
      response.end(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n");
    } else response.end(JSON.stringify(result));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  fixture.base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});
beforeEach(() => {
  vi.clearAllMocks();
  fixture.requests = [];
  fixture.urls = [];
  fixture.tier = "default";
  fixture.status = 200;
  fixture.sse = false;
});

async function dispatch({ provider = "openai", model = "gpt-6-astra", source = "openai-responses", extra = {}, providerServiceTier, credentials = {}, native = false } = {}) {
  const input = source === "openai-responses"
    ? { input: "hello", instructions: "Be precise.", reasoning: { effort: "high" }, store: false }
    : source === "claude"
      ? { messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }], system: "Be precise.", max_tokens: 1000, output_config: { effort: "high" } }
      : { messages: [{ role: "system", content: "Be precise." }, { role: "user", content: "hello" }], reasoning_effort: "high" };
  const body = { ...input, model, stream: false, ...extra };
  const original = structuredClone(body);
  const result = await handleChatCore({
    body, modelInfo: { provider, model }, credentials: { apiKey: "offline-fixture", ...credentials },
    providerServiceTier, sourceFormatOverride: source, connectionId: "offline-speed",
    clientRawRequest: { body, endpoint: source === "openai" ? "/v1/chat/completions" : "/v1/responses", headers: native ? { "user-agent": "codex-cli/fixture" } : {} },
    log: { debug() {}, info() {}, warn() {} },
  });
  expect(body).toEqual(original);
  return result;
}

describe("processing-speed serialization to real HTTP", () => {
  it.each(["auto", "default", "fast", "priority", "ultrafast"])("preserves public Responses %s independently of reasoning", async tier => {
    const result = await dispatch({ extra: { service_tier: tier } });
    expect(result.success).toBe(true);
    expect(fixture.urls).toEqual(["https://api.openai.com/v1/responses"]);
    expect(fixture.requests[0].body).toMatchObject({ model: "gpt-6-astra", service_tier: tier, reasoning: { effort: "high" }, instructions: "Be precise.", store: false });
    expect(fixture.requests[0].body).not.toHaveProperty("serviceTier");
  });

  it("keeps the unconfigured public tier omitted", async () => {
    expect((await dispatch()).success).toBe(true);
    expect(fixture.requests[0].body).not.toHaveProperty("service_tier");
  });

  it.each(["openai", "openai-responses", "claude"])("injects the provider default into %s translation", async source => {
    expect((await dispatch({ source, providerServiceTier: "fast" })).success).toBe(true);
    expect(fixture.requests[0].body.service_tier).toBe("fast");
  });

  it.each(["auto", "default", "fast", null])("explicit %s overrides a saved Ultrafast default", async service_tier => {
    expect((await dispatch({ extra: { service_tier }, providerServiceTier: "ultrafast" })).success).toBe(true);
    expect(fixture.requests[0].body.service_tier).toBe(service_tier);
  });

  it.each(["openai", "claude"])("routes Astra Ultrafast from %s to Responses, not Chat", async source => {
    expect((await dispatch({ source, extra: { service_tier: "ultrafast" } })).success).toBe(true);
    expect(fixture.urls).toEqual(["https://api.openai.com/v1/responses"]);
    expect(fixture.requests[0].body).toMatchObject({ model: "gpt-6-astra", service_tier: "ultrafast", reasoning: { effort: "high" } });
    expect(fixture.requests[0].body).not.toHaveProperty("messages");
    expect(JSON.stringify(fixture.requests[0].body.input)).toContain("hello");
  });

  it.each(["fast", "priority"])("keeps Chat %s on the real Chat endpoint", async service_tier => {
    expect((await dispatch({ source: "openai", extra: { service_tier } })).success).toBe(true);
    expect(fixture.urls).toEqual(["https://api.openai.com/v1/chat/completions"]);
    expect(fixture.requests[0].body).toMatchObject({ service_tier, reasoning_effort: "high" });
  });

  it.each([["fast", "priority"], ["priority", "priority"], ["ultrafast", "ultrafast"]])("sends Codex %s as %s even on native passthrough", async (service_tier, wire) => {
    const result = await dispatch({ provider: "codex", native: true, extra: { service_tier }, credentials: { accessToken: "offline-codex", providerSpecificData: { chatgptAccountId: "account-a" } } });
    expect(result.success).toBe(true);
    expect(fixture.requests[0].path).toBe("/backend-api/codex/responses");
    expect(fixture.requests[0].headers["chatgpt-account-id"]).toBe("account-a");
    expect(fixture.requests[0].body).toMatchObject({ service_tier: wire, model: "gpt-6-astra", store: false, stream: true, reasoning: { effort: "high" } });
  });

  it.each([undefined, "auto"])("uses an advertised Codex model default for %s", async service_tier => {
    const extra = service_tier === undefined ? {} : { service_tier };
    expect((await dispatch({ provider: "codex", extra, credentials: { providerSpecificData: { models: [{ slug: "gpt-6-astra", service_tiers: [{ id: "priority" }, { id: "ultrafast" }], default_service_tier: "ultrafast" }] } } })).success).toBe(true);
    expect(fixture.requests[0].body.service_tier).toBe("ultrafast");
  });

  it("keeps explicit Codex Standard omitted across repeated transformations without inferring a paid default", () => {
    const executor = new CodexExecutor();
    const body = { input: "hello", service_tier: "default" };
    const credentials = { providerSpecificData: { models: [{ slug: "gpt-6-astra", service_tiers: [{ id: "ultrafast" }], default_service_tier: "ultrafast" }] } };
    for (let turn = 0; turn < 2; turn++) {
      const wire = executor.transformRequest("gpt-6-astra", body, true, credentials);
      expect(wire).not.toHaveProperty("service_tier");
    }
    expect(body.service_tier).toBe("default");
  });

  it.each(["auto", "default"])("never sends the API-only Codex %s sentinel", async service_tier => {
    expect((await dispatch({ provider: "codex", extra: { service_tier } })).success).toBe(true);
    expect(fixture.requests[0].body).not.toHaveProperty("service_tier");
  });

  it("treats explicit Codex null as Auto, overriding a saved paid tier without sending null", async () => {
    const credentials = { providerSpecificData: { models: [{ slug: "gpt-6-astra", service_tiers: [{ id: "priority" }], default_service_tier: "priority" }] } };
    expect((await dispatch({ provider: "codex", extra: { service_tier: null }, providerServiceTier: "ultrafast", credentials })).success).toBe(true);
    expect(fixture.requests[0].body.service_tier).toBe("priority");
  });

  it.each(["ultra", "ultra_fast", "turbo", 42, {}])("rejects invalid wire tier %j locally", async service_tier => {
    const result = await dispatch({ extra: { service_tier } });
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toMatchObject({ error: { code: "invalid_service_tier", param: "service_tier" } });
    expect(fixture.requests).toHaveLength(0);
  });

  it.each([["gpt-6-sol", "ultrafast"], ["gpt-6-luna", "ultrafast"], ["text-embedding-3-small", "fast"], ["ft:gpt-6-astra:org:custom:id", "ultrafast"]])("rejects unsupported public %s + %s before HTTP", async (model, service_tier) => {
    const result = await dispatch({ model, extra: { service_tier } });
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toMatchObject({ error: { code: "unsupported_service_tier", param: "service_tier" } });
    expect(fixture.requests).toHaveLength(0);
  });

  it("does not mistake OpenCode's semantic serviceTier for a native wire field", async () => {
    const result = await dispatch({ extra: { serviceTier: "ultrafast" } });
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toMatchObject({ error: { code: "invalid_service_tier", param: "serviceTier" } });
    expect(fixture.requests).toHaveLength(0);
  });

  it("preserves a tier authorization failure rather than stripping the tier and retrying", async () => {
    fixture.status = 403;
    const result = await dispatch({ provider: "codex", extra: { service_tier: "ultrafast" } });
    expect(result.response.status).toBe(403);
    expect(result).not.toHaveProperty("accountServiceTierDenied");
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0].body.service_tier).toBe("ultrafast");
  });

  it("revalidates a fallback account and never sends its unsupported Ultrafast request", async () => {
    const extra = { service_tier: "ultrafast" };
    expect((await dispatch({ provider: "codex", extra, credentials: { providerSpecificData: { chatgptAccountId: "account-a", models: [{ slug: "gpt-6-astra", service_tiers: [{ id: "ultrafast" }] }] } } })).success).toBe(true);
    const result = await dispatch({ provider: "codex", extra, credentials: { providerSpecificData: { chatgptAccountId: "account-b", models: [{ slug: "gpt-6-astra", service_tiers: [{ id: "priority" }] }] } } });
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toMatchObject({ error: { code: "unsupported_service_tier", param: "service_tier" } });
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0].headers["chatgpt-account-id"]).toBe("account-a");
  });
});

describe("uploaded-file identity through processing-speed routing", () => {
  const fileId = { type: "file", file: { file_id: "file-offline-pdf" } };
  const fileData = { type: "file", file: { file_data: "data:application/pdf;base64,JVBERi0xLjE=", filename: "offline.pdf" } };
  const history = attachment => [
    { role: "user", content: "Earlier question" },
    { role: "assistant", content: "Earlier answer" },
    { role: "user", content: [{ type: "text", text: "Summarize this PDF" }, attachment] },
  ];

  it.each([false, true])("retains uploaded file IDs unchanged on the Standard Chat path (stream=%s)", async stream => {
    fixture.sse = stream;
    const messages = history(fileId);
    const result = await dispatch({ source: "openai", extra: { messages, service_tier: "default", stream } });
    expect(result.success).toBe(true);
    await result.response.text();
    expect(fixture.requests[0].path).toBe("/v1/chat/completions");
    expect(fixture.requests[0].body.messages).toEqual(messages);
  });

  it.each([false, true])("lowers uploaded file IDs to real Responses input_file without losing history (stream=%s)", async stream => {
    fixture.sse = stream;
    const result = await dispatch({ source: "openai", extra: { messages: history(fileId), service_tier: "ultrafast", stream } });
    expect(result.success).toBe(true);
    await result.response.text();
    const sent = fixture.requests[0].body;
    expect(fixture.requests[0].path).toBe("/v1/responses");
    expect(sent).toMatchObject({ model: "gpt-6-astra", service_tier: "ultrafast", reasoning: { effort: "high" } });
    expect(sent.input).toEqual([
      { type: "message", role: "user", content: [{ type: "input_text", text: "Earlier question" }] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "Earlier answer" }] },
      { type: "message", role: "user", content: [{ type: "input_text", text: "Summarize this PDF" }, { type: "input_file", file_id: "file-offline-pdf" }] },
    ]);
  });

  it.each([false, true])("keeps existing inline PDF data and filename on the Ultrafast path (stream=%s)", async stream => {
    fixture.sse = stream;
    const result = await dispatch({ source: "openai", extra: { messages: history(fileData), service_tier: "ultrafast", stream } });
    expect(result.success).toBe(true);
    await result.response.text();
    expect(fixture.requests[0].body.input[2].content).toEqual([
      { type: "input_text", text: "Summarize this PDF" },
      { type: "input_file", file_data: "data:application/pdf;base64,JVBERi0xLjE=", filename: "offline.pdf" },
    ]);
  });

  it.each([false, true])("preserves native Responses file IDs losslessly (stream=%s)", async stream => {
    fixture.sse = stream;
    const input = [{ type: "message", role: "user", content: [{ type: "input_text", text: "Summarize this PDF" }, { type: "input_file", file_id: "file-offline-pdf" }] }];
    const result = await dispatch({ extra: { input, service_tier: "ultrafast", stream } });
    expect(result.success).toBe(true);
    await result.response.text();
    expect(fixture.requests[0].body.input).toEqual(input);
    expect(fixture.requests[0].path).toBe("/v1/responses");
  });

  it("retains uploaded files returned by tools alongside their result and following user turn", async () => {
    const messages = [
      { role: "user", content: "Find the PDF" },
      { role: "assistant", content: null, tool_calls: [{ id: "call_pdf", type: "function", function: { name: "find_pdf", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call_pdf", content: [{ type: "text", text: "Found the PDF" }, fileId] },
      { role: "user", content: "Summarize it" },
    ];
    const result = await dispatch({ source: "openai", extra: { messages, service_tier: "ultrafast" } });
    expect(result.success).toBe(true);
    await result.response.text();
    expect(fixture.requests[0].body.input).toEqual([
      { type: "message", role: "user", content: [{ type: "input_text", text: "Find the PDF" }] },
      { type: "function_call", call_id: "call_pdf", name: "find_pdf", arguments: "{}" },
      { type: "function_call_output", call_id: "call_pdf", output: "Found the PDF" },
      { type: "message", role: "user", content: [{ type: "input_file", file_id: "file-offline-pdf" }] },
      { type: "message", role: "user", content: [{ type: "input_text", text: "Summarize it" }] },
    ]);
  });
});
