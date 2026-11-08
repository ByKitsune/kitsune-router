import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import { translateRequest } from "../../open-sse/translator/index.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { KiroExecutor } from "../../open-sse/executors/kiro.js";
import { clearKiroSessionReplayStore } from "../../open-sse/utils/kiroSessionReplay.js";

const messages = [{ role: "user", content: "Explain briefly." }];
let server;
let origin;
let requests;

beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.writeHead(422, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "Offline wire fixture; no inference performed." } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

beforeEach(() => {
  requests = [];
  clearKiroSessionReplayStore();
});

async function send(source, target, provider, model, body) {
  const original = structuredClone(body);
  const credentials = {
    accessToken: "offline-visibility-fixture", apiKey: "offline-visibility-fixture",
    connectionId: "offline-visibility-fixture", providerSpecificData: {},
  };
  const wire = translateRequest(source, target, model, body, false, credentials, provider);
  expect(body).toEqual(original);
  const executor = provider === "kiro" ? new KiroExecutor() : new DefaultExecutor(provider);
  executor.buildUrl = () => origin;
  executor.config = { ...executor.config, retry: { 429: 0, 500: 0, 502: 0, 503: 0, 504: 0 } };
  const result = await executor.execute({ model, body: wire, stream: false, credentials });
  await result.response.arrayBuffer();
  expect(requests).toHaveLength(1);
  return requests[0];
}

describe("visibility-only controls reach real outbound JSON without selecting effort", () => {
  it.each([
    [{ summary: null }, false],
    [{ summary: "none" }, false],
    [{ summary: "auto" }, true],
    [{ summary: "concise" }, true],
    [{ summary: "detailed" }, true],
    [{ generate_summary: null }, false],
    [{ generate_summary: "none" }, false],
    [{ generate_summary: "concise" }, true],
    [{ summary: null, generate_summary: "detailed" }, false],
  ])("preserves supported Responses visibility %j on Gemini", async (reasoning, includeThoughts) => {
    const sent = await send("openai-responses", "gemini", "gemini", "gemini-2.5-flash", {
      input: "Explain briefly.", max_output_tokens: 8192, reasoning,
    });
    expect(sent.generationConfig).toMatchObject({ maxOutputTokens: 8192, thinkingConfig: { includeThoughts } });
    expect(sent.generationConfig.thinkingConfig).toEqual({ includeThoughts });
    for (const field of ["thinking", "reasoning", "reasoning_effort"]) expect(sent).not.toHaveProperty(field);
  });

  it.each([null, "none", "auto", "detailed"])("retains native Responses summary %s without effort", async summary => {
    const sent = await send("openai-responses", "openai-responses", "openai", "gpt-5.4", {
      input: "Explain briefly.", max_output_tokens: 8192, reasoning: { summary },
      include: ["reasoning.encrypted_content"],
    });
    expect(sent.reasoning).toEqual({ summary: summary === "none" ? null : summary });
    expect(sent.include).toEqual(["reasoning.encrypted_content"]);
    expect(sent).not.toHaveProperty("reasoning_effort");
  });

  it("preserves a native deprecated summary setting without adding a conflicting summary default", async () => {
    const sent = await send("openai-responses", "openai-responses", "openai", "gpt-5.4", {
      input: "Explain briefly.", max_output_tokens: 8192, reasoning: { generate_summary: "concise" },
    });
    expect(sent.reasoning).toEqual({ generate_summary: "concise" });
  });

  it.each([true, false])("maps Gemini includeThoughts=%s to OpenRouter visibility alone", async includeThoughts => {
    const sent = await send("gemini", "openai", "openrouter", "anthropic/claude-sonnet-4.6", {
      contents: [{ role: "user", parts: [{ text: "Explain briefly." }] }],
      generationConfig: { maxOutputTokens: 8192, thinkingConfig: { includeThoughts } },
    });
    expect(sent.reasoning).toEqual({ exclude: !includeThoughts });
    expect(sent).not.toHaveProperty("reasoning_effort");
  });

  it.each(["claude-sonnet-4.5", "claude-opus-4.7"])("rejects standalone Claude visibility rather than emitting an invalid union for %s", model => {
    expect(() => translateRequest("gemini", "claude", model, {
      contents: [{ role: "user", parts: [{ text: "Explain briefly." }] }],
      generationConfig: { maxOutputTokens: 8192, thinkingConfig: { includeThoughts: false } },
    }, false, null, "claude")).toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "thinking.display" }));
    expect(requests).toHaveLength(0);
  });

  it("rejects the same missing Claude discriminator on native passthrough", () => {
    const body = { messages, max_tokens: 8192, thinking: { display: "omitted" } };
    const original = structuredClone(body);
    expect(() => translateRequest("claude", "claude", "claude-sonnet-4.5", body, false, null, "claude"))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "thinking.display" }));
    expect(body).toEqual(original);
    expect(requests).toHaveLength(0);
  });

  it("accepts visibility when an explicit Claude suffix supplies the mode", async () => {
    const sent = await send("openai-responses", "claude", "claude", "claude-sonnet-4.5(low)", {
      input: "Explain briefly.", max_output_tokens: 8192, reasoning: { summary: null },
    });
    expect(sent.thinking).toEqual({ type: "enabled", budget_tokens: 1024, display: "omitted" });
    expect(sent).not.toHaveProperty("output_config");
  });
});

describe("Kiro explicit disable stays independent from visibility and effort", () => {
  it.each([
    { thinking: false, reasoning_effort: "high" },
    { reasoning: false, reasoning_effort: "high" },
    { reasoning: { enabled: false, effort: "high", exclude: true } },
    { enable_thinking: false, reasoning_effort: "high" },
  ])("does not inject an activation prefix for %j", async controls => {
    const sent = await send("openai", "kiro", "kiro", "claude-sonnet-4.6", {
      messages, max_tokens: 8192, ...controls,
    });
    expect(sent.additionalModelRequestFields.thinking).toEqual({ type: "disabled" });
    expect(JSON.stringify(sent)).not.toContain("<thinking_mode>");
    expect(sent.inferenceConfig.maxTokens).toBe(8192);
  });

  it("preserves explicit disable above a separate effort on Kiro's GPT wire", async () => {
    const sent = await send("openai", "kiro", "kiro", "gpt-5.6-sol", {
      messages, max_tokens: 8192, reasoning: { enabled: false, effort: "high" },
    });
    expect(sent.additionalModelRequestFields).toEqual({ reasoning: { effort: "none" } });
    expect(JSON.stringify(sent)).not.toContain("<thinking_mode>");
  });

  it.each([null, "auto"])("does not invent Kiro adaptive thinking for Responses summary %s alone", async summary => {
    const sent = await send("openai-responses", "kiro", "kiro", "claude-sonnet-4.6", {
      input: "Explain briefly.", max_output_tokens: 8192, reasoning: { summary },
    });
    expect(sent).not.toHaveProperty("additionalModelRequestFields");
    expect(JSON.stringify(sent)).not.toContain("<thinking_mode>");
    for (const field of ["thinking", "reasoning", "reasoning_effort"]) expect(sent).not.toHaveProperty(field);
  });
});
