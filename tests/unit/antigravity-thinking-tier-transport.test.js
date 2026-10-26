import { beforeEach, describe, expect, it, vi } from "vitest";

// Keep core resolution, translators and the native executor real. Only external
// transport and app persistence/logging are replaced; no provider is contacted.
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("../../open-sse/executors/index.js", async () => {
  const { AntigravityExecutor } = await import("../../open-sse/executors/antigravity.js");
  return { getExecutor: () => new AntigravityExecutor() };
});
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({
  getDeclaredModelCaps: vi.fn(async () => undefined),
}));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({
  createRequestLogger: async () => ({
    logClientRawRequest: vi.fn(), logRawRequest: vi.fn(), logTargetRequest: vi.fn(),
    logProviderResponse: vi.fn(), logConvertedResponse: vi.fn(), logError: vi.fn(),
  }),
}));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { getModelUpstreamId } from "../../open-sse/config/providerModels.js";
import { extractThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

const FLASH = "gemini-3.8-flash";
const ARGON = "gemini-4-argon";
const formats = ["openai", "openai-responses", "claude"];
const effortFields = (format, effort) => format === "claude" ? { output_config: { effort } }
  : format === "openai-responses" ? { reasoning: { effort } } : { reasoning_effort: effort };
const nativeReply = {
  response: {
    candidates: [{ content: { role: "model", parts: [{ text: "synthetic reply" }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
  },
};

async function dispatch(format, { model = FLASH, extra = {}, providerThinking, expectedStatus = 200 } = {}) {
  const input = format === "openai-responses"
    ? { input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Describe the fixture." }] }], max_output_tokens: 4096 }
    : format === "claude"
      ? { messages: [{ role: "user", content: [{ type: "text", text: "Describe the fixture." }] }], max_tokens: 4096 }
      : { messages: [{ role: "user", content: "Describe the fixture." }], max_tokens: 4096 };
  const body = { ...input, model: `ag/${model}`, stream: false, ...extra };
  const before = structuredClone(body);
  const result = await handleChatCore({
    body, modelInfo: { provider: "antigravity", model }, sourceFormatOverride: format,
    credentials: { accessToken: "synthetic-tier-token", projectId: "synthetic-tier-project", connectionId: "synthetic-tier-connection" },
    connectionId: "synthetic-tier-connection", providerThinking,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  });
  if (expectedStatus !== 200) {
    expect(result.status).toBe(expectedStatus);
    expect(proxyAwareFetch).not.toHaveBeenCalled();
    expect(body).toEqual(before);
    expect(await result.response.json()).toMatchObject({ error: { code: "unsupported_parameter" } });
    return;
  }
  expect(result.success).toBe(true);
  expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  expect(body).toEqual(before);
  const [url, init] = proxyAwareFetch.mock.calls[0];
  expect(new URL(url).pathname).toBe("/v1internal:generateContent");
  const sent = JSON.parse(init.body);
  expect(sent.request.contents).toEqual([{ role: "user", parts: [{ text: "Describe the fixture." }] }]);
  expect(sent.request.generationConfig.maxOutputTokens).toBe(4096);
  return sent;
}

function expectTier(sent, model, level) {
  expect(sent.model).toBe(model);
  expect(sent.request.generationConfig.thinkingConfig).toMatchObject({ thinkingLevel: level });
  expect(sent.request.generationConfig.thinkingConfig).not.toHaveProperty("thinkingBudget");
}

beforeEach(() => {
  vi.clearAllMocks();
  proxyAwareFetch.mockImplementation(async () => Response.json(nativeReply));
});

describe.each(formats)("Antigravity declared tier selection from %s", format => {
  it.each(["low", "medium", "high"])("sends the requested %s wire tier and matching thinking level", async effort => {
    const sent = await dispatch(format, { extra: effortFields(format, effort) });
    expectTier(sent, `${FLASH}-${effort}`, effort);
  });

  it("rejects an explicit low annotation with conflicting high effort", async () => {
    await dispatch(format, { model: `${FLASH}(low)`, extra: effortFields(format, "high"), expectedStatus: 400 });
  });

  it("rejects a directly named high tier with low effort", async () => {
    await dispatch(format, { model: `${FLASH}-high`, extra: effortFields(format, "low"), expectedStatus: 400 });
  });
});

describe("Antigravity normalized intent and provider defaults", () => {
  it("retains the declared medium default when no intent is supplied", async () => {
    expectTier(await dispatch("openai"), "gemini-3.8-flash-medium", "medium");
  });

  it("selects the provider thinking default after its injection into an otherwise unset request", async () => {
    const sent = await dispatch("openai", { providerThinking: { mode: "high" } });
    expectTier(sent, "gemini-3.8-flash-high", "high");
  });

  it("selects a declared tier from normalized mixed-case effort", async () => {
    const sent = await dispatch("openai", { extra: { reasoning_effort: " HIGH " } });
    expectTier(sent, "gemini-3.8-flash-high", "high");
  });

  it("does not replace explicit Messages effort with the provider default", async () => {
    const sent = await dispatch("claude", { extra: { output_config: { effort: "low" } }, providerThinking: { mode: "high" } });
    expectTier(sent, "gemini-3.8-flash-low", "low");
  });

  it("rejects conflicting effort controls rather than silently picking one", async () => {
    await dispatch("openai", {
      extra: { output_config: { effort: "low" }, reasoning_effort: "high", reasoning: { effort: "medium" } }, expectedStatus: 400,
    });
    await dispatch("openai-responses", { extra: { reasoning_effort: "low", reasoning: { effort: "high" } }, expectedStatus: 400 });
  });

  it("does not replace an explicit low annotation with an injected high provider default", async () => {
    const sent = await dispatch("openai", { model: `${FLASH}(low)`, providerThinking: { mode: "high" } });
    expectTier(sent, "gemini-3.8-flash-low", "low");
  });
});

describe("existing Argon routing is not tier-inferred", () => {
  it.each(formats)("keeps the unsuffixed base and explicit %s effort", async format => {
    const sent = await dispatch(format, { model: ARGON, extra: effortFields(format, "high") });
    expectTier(sent, "gemini-4-argon", "high");
  });

  it("does not force a medium thinking config onto an unset native base request", async () => {
    const sent = await dispatch("openai", { model: ARGON });
    expect(sent.model).toBe("gemini-4-argon");
    expect(sent.request.generationConfig).not.toHaveProperty("thinkingConfig");
  });

  it.each(["low", "medium", "high"])("keeps the named %s tier and its preset", async level => {
    const sent = await dispatch("openai", { model: `${ARGON}-${level}`, extra: { reasoning_effort: level } });
    expectTier(sent, `${ARGON}-${level}`, level);
  });
});

describe("normalized tier intent does not rewrite unrelated model identities", () => {
  it.each([
    ["gemini", "gemini-3.8-flash", { reasoning_effort: "high" }, "gemini-3.8-flash"],
    ["ag", "vendor/gemini-3.8-flash", { reasoning_effort: "high" }, "vendor/gemini-3.8-flash"],
    ["openai-compatible-fixture", "vendor/gemini-3.8-flash", { reasoning_effort: "low" }, "vendor/gemini-3.8-flash"],
    ["ag", "claude-sonnet-5-5", { reasoning_effort: "low" }, "claude-sonnet-5-5-high(high)"],
    ["ag", "gemini-3.8-flash", { thinking: { type: "enabled", budget_tokens: 24576 } }, "gemini-3.8-flash-medium(medium)"],
    ["ag", "gemini-3.8-flash(8192)", { reasoning_effort: "high" }, "gemini-3.8-flash-medium(8192)"],
    ["ag", "gemini-3.8-flash", { reasoning_effort: "max" }, "gemini-3.8-flash-medium(medium)"],
  ])("leaves %s/%s at its declared resolution without inventing a tier", (provider, model, body, expected) => {
    const before = structuredClone(body);
    expect(getModelUpstreamId(provider, model, extractThinking(body))).toBe(expected);
    expect(body).toEqual(before);
  });
});
