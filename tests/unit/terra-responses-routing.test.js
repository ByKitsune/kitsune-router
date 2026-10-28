import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ origin: "", requests: [] }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}), saveRequestDetail: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: vi.fn(async () => undefined) }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest: vi.fn(), logRawRequest: vi.fn(), logTargetRequest: vi.fn(), logOpenAIRequest: vi.fn(),
  logProviderResponse: vi.fn(), logConvertedResponse: vi.fn(), logError: vi.fn(),
}) }));
// Redirect only the destination host: endpoint selection and serialization stay real.
vi.mock("../../open-sse/executors/index.js", async () => {
  const { DefaultExecutor } = await import("../../open-sse/executors/default.js");
  return { getExecutor(provider) {
    const executor = new DefaultExecutor(provider);
    const buildUrl = executor.buildUrl.bind(executor);
    executor.buildUrl = (...args) => `${fixture.origin}${new URL(buildUrl(...args)).pathname}`;
    return executor;
  } };
});

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";

const id = "gpt-6.1-terra";
const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
let server;
beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    fixture.requests.push({ path: request.url, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: "resp_terra_fixture", object: "response", status: "completed", model: id,
      output: [{ type: "function_call", id: "fc_fixture", call_id: "call_fixture", name: "lookup", arguments: '{"city":"Rome"}', status: "completed" }],
      usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 } }));
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  fixture.origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
beforeEach(() => { fixture.requests = []; });

describe("Terra tool transport over offline loopback", () => {
  it("translates Chat tools to Responses and returns the function call to the Chat client", async () => {
    const result = await handleChatCore({
      modelInfo: { provider: "openai", model: id }, credentials: { apiKey: "fixture-only" },
      sourceFormatOverride: "openai", connectionId: "fixture-terra", log,
      body: { model: id, stream: false, messages: [{ role: "user", content: "Look up Rome." }],
        reasoning_effort: "max", tools: [{ type: "function", function: {
          name: "lookup", description: "Look up a city", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
        } }], tool_choice: { type: "function", function: { name: "lookup" } } },
    });
    expect(result.success).toBe(true);
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0].path).toBe("/v1/responses");
    expect(fixture.requests[0].body).toMatchObject({ model: id, reasoning: { effort: "max" },
      tools: [{ type: "function", name: "lookup", parameters: { type: "object", required: ["city"] } }],
      tool_choice: { type: "function", name: "lookup" } });
    expect(fixture.requests[0].body).not.toHaveProperty("messages");
    const reply = await result.response.json();
    expect(reply.choices[0].message.tool_calls[0]).toMatchObject({ id: "call_fixture", function: { name: "lookup", arguments: '{"city":"Rome"}' } });
  });

  it("keeps native Responses hosted tools and the disabled reasoning effort intact", async () => {
    const result = await handleChatCore({
      modelInfo: { provider: "openai", model: id }, credentials: { apiKey: "fixture-only" },
      sourceFormatOverride: "openai-responses", connectionId: "fixture-terra", log,
      body: { model: id, stream: false, input: "Find a source.", reasoning: { effort: "none" }, tools: [{ type: "web_search" }] },
    });
    expect(result.success).toBe(true);
    expect(fixture.requests[0]).toMatchObject({ path: "/v1/responses", body: { model: id, reasoning: { effort: "none" }, tools: [{ type: "web_search" }] } });
  });
});
