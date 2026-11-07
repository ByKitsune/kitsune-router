import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: vi.fn(async () => undefined) }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest: vi.fn(), logRawRequest: vi.fn(), logTargetRequest: vi.fn(),
  logProviderResponse: vi.fn(), logConvertedResponse: vi.fn(), logError: vi.fn(),
}) }));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { translateRequest } from "../../open-sse/translator/index.js";

const messages = [{ role: "user", content: "Reply briefly." }];
const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
const reply = { id: "relay-reasoning", object: "chat.completion", model: "fixture",
  choices: [{ index: 0, message: { role: "assistant", content: "answer", reasoning_content: "visible thought" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 12, completion_tokens: 16, total_tokens: 28, completion_tokens_details: { reasoning_tokens: 13 } } };

beforeEach(() => {
  vi.clearAllMocks();
  proxyAwareFetch.mockImplementation(async () => Response.json(reply));
});

async function dispatch(body, sourceFormat = "openai", model = "gemini-2.5-flash") {
  const original = structuredClone(body);
  const result = await handleChatCore({
    body: { model, stream: false, ...body }, modelInfo: { provider: "bykitsune", model },
    sourceFormatOverride: sourceFormat, credentials: { apiKey: "offline-fixture" },
    connectionId: "relay-reasoning", log,
  });
  expect(result.success).toBe(true);
  expect(body).toEqual(original);
  expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  expect(proxyAwareFetch.mock.calls[0][0]).toBe("https://api.bykitsune.com/v1/chat/completions");
  return { sent: JSON.parse(proxyAwareFetch.mock.calls[0][1].body), response: await result.response.json() };
}

describe("ByKitsune relay keeps provider-independent caller reasoning", () => {
  it.each([
    { thinking: { type: "enabled", budget_tokens: 4096, display: "omitted" } },
    { reasoning_effort: "high", reasoning: { max_tokens: 4096, exclude: false } },
    { thinking: { type: "disabled" }, output_config: { effort: "high" } },
    { reasoning: { enabled: false } },
    { generationConfig: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } } },
    { request: { generationConfig: { thinkingConfig: { thinkingBudget: -1, includeThoughts: true } } } },
  ])("retains explicit controls on the actual Chat fetch body: %j", async controls => {
    const { sent, response } = await dispatch({ messages, max_tokens: 8192, ...controls });
    for (const key of Object.keys(controls)) expect(sent[key]).toEqual(controls[key]);
    expect(sent.max_tokens).toBe(8192);
    expect(response.choices[0].message.reasoning_content).toBe("visible thought");
    expect(response.usage.completion_tokens_details.reasoning_tokens).toBe(13);
  });

  it("does not infer that an unknown deployment model cannot reason", async () => {
    const { sent } = await dispatch({ messages, max_tokens: 1000, reasoning_effort: "high" }, "openai", "vendor/fixture");
    expect(sent.reasoning_effort).toBe("high");
    expect(sent.max_tokens).toBe(1000);
  });

  it.each([
    ["claude", { messages, max_tokens: 8192, thinking: { type: "enabled", budget_tokens: 4096, display: "summarized" } },
      { thinking: { type: "enabled", budget_tokens: 4096, display: "summarized" } }],
    ["openai-responses", { input: "Reply briefly.", max_output_tokens: 8192, reasoning: { effort: "high", summary: "detailed" } },
      { reasoning: { effort: "high", summary: "detailed" } }],
    ["gemini", { contents: [{ role: "user", parts: [{ text: "Reply briefly." }] }],
      generationConfig: { maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 4096, includeThoughts: true } } },
      { generationConfig: { thinkingConfig: { thinkingBudget: 4096, includeThoughts: true } } }],
  ])("preserves source controls before %s is converted to the gateway Chat wire", async (format, body, controls) => {
    const { sent } = await dispatch(body, format);
    for (const key of Object.keys(controls)) expect(sent[key]).toEqual(controls[key]);
    expect(sent.max_tokens ?? sent.max_completion_tokens).toBe(8192);
  });

  it("retains an explicit suffix override without applying underlying always-on guesses", async () => {
    const { sent } = await dispatch({ messages, max_tokens: 1000, reasoning_effort: "high" }, "openai", "gemini-4-argon(0)");
    expect(sent.reasoning).toEqual({ enabled: false });
    expect(sent.reasoning_effort).toBeUndefined();
    expect(sent.max_tokens).toBe(1000);
  });

  it("delivers the exact budget and visibility to a subsequent native Google translation", async () => {
    const { sent } = await dispatch({ messages, max_tokens: 8192,
      thinking: { type: "enabled", budget_tokens: 4096, display: "omitted" } });
    const final = translateRequest("openai", "gemini", "gemini-2.5-flash", sent, false, null, "gemini");
    expect(final.generationConfig.maxOutputTokens).toBe(8192);
    expect(final.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 4096, includeThoughts: false });
  });
});
