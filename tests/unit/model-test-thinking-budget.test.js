import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";

const fixture = vi.hoisted(() => ({ url: "", requests: [], probes: [] }));
vi.mock("@/lib/localDb", () => ({ getApiKeys: async () => [{ key: "synthetic-ping-key", isActive: true }] }));
vi.mock("@/shared/utils/machineId", () => ({ getConsistentMachineId: async () => "synthetic-cli-token" }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest() {}, appendRequestLog: async () => {}, saveRequestDetail: async () => {}, saveRequestUsage: async () => {},
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
}) }));
// Redirect only the upstream URL. The probe, core translation, native executor
// validation and both serialized HTTP boundaries remain real.
vi.mock("../../open-sse/executors/index.js", async () => {
  const { AntigravityExecutor } = await import("../../open-sse/executors/antigravity.js");
  return { getExecutor() {
    const executor = new AntigravityExecutor();
    executor.buildUrl = () => fixture.url + "/upstream";
    return executor;
  } };
});

import { pingModelByKind } from "../../src/app/api/models/test/ping.js";
import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { parseModel } from "../../open-sse/services/model.js";

let server;
const log = { debug() {}, info() {}, warn() {}, error() {} };

async function dispatch(body) {
  const result = await handleChatCore({ body, sourceFormatOverride: "openai", modelInfo: parseModel(body.model),
    credentials: { accessToken: "synthetic-token", projectId: "synthetic-project" },
    connectionId: "synthetic-ping-connection", providerThinking: { mode: "high" }, log, rtkEnabled: false });
  return result.response;
}

beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (request.url === "/upstream") {
        fixture.requests.push(body);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ response: { candidates: [{ content: { role: "model", parts: [{ text: "Hello" }] }, finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } } }));
        return;
      }
      fixture.probes.push(body);
      const result = await dispatch(body);
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(await result.text());
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  fixture.url = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => { fixture.requests = []; fixture.probes = []; });
afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

describe("dashboard model probe thinking/output compatibility", () => {
  it.each([
    ["ag/claude-sonnet-4-6", 64000], ["antigravity/claude-opus-4-6-thinking", 64000],
    ["ag/claude-sonnet-5-5", 65536], ["ag/claude-sonnet-5-5-medium", 65536], ["ag/claude-sonnet-5-5-low", 65536],
  ])("does not falsely reject %s before contacting the synthetic upstream", async (model, cap) => {
    const result = await pingModelByKind(model, "llm", fixture.url);
    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(fixture.probes).toHaveLength(1);
    expect(Number.isSafeInteger(fixture.probes[0].max_tokens)).toBe(true);
    expect(fixture.probes[0].max_tokens).toBe(cap);
    expect(fixture.probes[0].max_tokens).toBeGreaterThan(1024);
    expect(fixture.probes[0].max_tokens).toBeLessThanOrEqual(65536);
    expect(fixture.requests).toHaveLength(1);
    const config = fixture.requests[0].request.generationConfig;
    expect(config.thinkingConfig.thinkingBudget).toBeGreaterThanOrEqual(1024);
    expect(config.maxOutputTokens).toBeGreaterThan(config.thinkingConfig.thinkingBudget);
    expect(config.maxOutputTokens).toBe(cap);
  });

  it("keeps the explicitly selected 32768-token reasoning budget in a probe", async () => {
    expect(await pingModelByKind("ag/claude-sonnet-4-6(32768)", "llm", fixture.url)).toMatchObject({ ok: true });
    expect(fixture.requests[0].request.generationConfig.thinkingConfig.thinkingBudget).toBe(32768);
  });

  it("does not enlarge unrelated Gemini probes", async () => {
    expect(await pingModelByKind("ag/gemini-3.8-flash-low", "llm", fixture.url)).toMatchObject({ ok: true });
    expect(fixture.requests[0].request.generationConfig.maxOutputTokens).toBe(1024);
  });

  it("still rejects a caller's explicit cap that cannot contain Claude thinking", async () => {
    const result = await dispatch({ model: "ag/claude-sonnet-4-6(32768)", max_tokens: 1024, stream: false,
      messages: [{ role: "user", content: "hi" }] });
    expect(result.status).toBe(400);
    expect(fixture.requests).toHaveLength(0);
  });
});
