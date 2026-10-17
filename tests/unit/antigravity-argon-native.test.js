import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { getModelUpstreamId } from "../../open-sse/config/providerModels.js";
import { getCapabilitiesForModel, setCatalogSource, withDeclaredCapabilities } from "../../open-sse/providers/capabilities.js";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { applyThinking, stripThinkingSuffix } from "../../open-sse/translator/concerns/thinkingUnified.js";

const ARGON = "gemini-4-argon";
const credentials = { accessToken: "synthetic-argon-token", projectId: "synthetic-project", connectionId: "synthetic-connection" };
const requestBody = () => ({ request: { contents: [{ role: "user", parts: [{ text: "Describe the supplied fixture" }] }] } });
afterEach(() => setCatalogSource(null));

describe("Antigravity Argon native request contract", () => {
  it("reaches the CLI-only native surface instead of the unsupported IDE surface", async () => {
    const server = createServer((request, response) => {
      request.resume();
      if (!/^antigravity\/cli\//.test(request.headers["user-agent"] || "")) {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "Requested entity was not found" } }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ response: { candidates: [{ content: { role: "model", parts: [{ text: "Native CLI accepted" }] }, finishReason: "STOP" }] } }));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const executor = new AntigravityExecutor();
    executor.config = { ...executor.config, baseUrls: [`http://127.0.0.1:${server.address().port}`] };
    try {
      const { response } = await executor.execute({ model: ARGON, body: requestBody(), stream: false, credentials });
      expect(response.status).toBe(200);
      expect((await response.json()).response.candidates[0].content.parts[0].text).toBe("Native CLI accepted");
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });

  it.each(["low", "medium", "high"])("emits the selected %s tier and matching native reasoning level", level => {
    const model = `${ARGON}-${level}`;
    const upstream = getModelUpstreamId("ag", model);
    const body = requestBody();
    applyThinking("antigravity", upstream, body, "antigravity");
    const native = new AntigravityExecutor().transformRequest(stripThinkingSuffix(upstream), body, true, credentials);
    expect(native.model).toBe(model);
    expect(native.request.generationConfig.thinkingConfig).toMatchObject({ thinkingLevel: level });
    expect(native.request.generationConfig.thinkingConfig).not.toHaveProperty("thinkingBudget");
  });

  it("keeps explicit API thinking on the base model instead of forcing a medium preset", () => {
    const upstream = getModelUpstreamId("ag", ARGON);
    const body = { ...requestBody(), reasoning_effort: "high" };
    applyThinking("antigravity", upstream, body, "antigravity");
    const native = new AntigravityExecutor().transformRequest(stripThinkingSuffix(upstream), body, true, credentials);
    expect(native.model).toBe(ARGON);
    expect(native.request.generationConfig.thinkingConfig).toMatchObject({ thinkingLevel: "high" });
  });
});

describe("Argon route-scoped limits and billing", () => {
  it("cannot advertise long-decode output beyond this gateway's native transport ceiling", () => {
    setCatalogSource({ getModalities: () => null, getLimits: () => ({ contextWindow: 1048576, maxInput: 1048576, maxOutput: 1000000 }) });
    const caps = getCapabilitiesForModel("ag", ARGON);
    const declared = withDeclaredCapabilities(caps, { maxOutput: 1000000, vision: false }, "antigravity", ARGON);
    expect(declared).toMatchObject({ contextWindow: 1048576, maxOutput: 65536, vision: false });
    expect(declared.maxInput).toBeNull();
    const native = new AntigravityExecutor().transformRequest(ARGON, { request: { ...requestBody().request, generationConfig: { maxOutputTokens: 1000000 } } }, true, credentials);
    expect(declared.maxOutput).toBe(native.request.generationConfig.maxOutputTokens);
  });

  it("retains a smaller operator cap and does not clamp unrelated provider declarations", () => {
    const caps = getCapabilitiesForModel("antigravity", ARGON);
    expect(withDeclaredCapabilities(caps, { maxOutput: 12000, maxInput: 500000 }, "ag", ARGON))
      .toMatchObject({ maxOutput: 12000, maxInput: 500000 });
    expect(withDeclaredCapabilities({ maxOutput: 1000000 }, { maxOutput: 200000 }, "openai-compatible-custom", ARGON).maxOutput).toBe(200000);
  });

  it("does not bill subscription Argon with another route's public API or Flash tariff", () => {
    const tokens = { prompt_tokens: 100000, cached_tokens: 50000, completion_tokens: 10000, reasoning_tokens: 6000 };
    for (const model of [ARGON, `${ARGON}-low`, `${ARGON}-medium`, `${ARGON}-high`]) {
      expect(calculateCostFromTokens(tokens, getPricingForModel("ag", model)), model).toBeNull();
    }
    expect(calculateCostFromTokens(tokens, getPricingForModel("gemini", ARGON))).toBeCloseTo(0.205, 12);
  });
});
