import { describe, expect, it } from "vitest";
import { adjustMaxTokens, readOutputTokenCap } from "../../open-sse/translator/formats/maxTokens.js";
import "../../open-sse/translator/index.js";
import { openaiToGeminiRequest, openaiToGeminiCLIRequest, openaiToAntigravityRequest } from "../../open-sse/translator/request/openai-to-gemini.js";
import { openaiToOllamaRequest } from "../../open-sse/translator/request/openai-to-ollama.js";
import { openaiToCommandCodeRequest } from "../../open-sse/translator/request/openai-to-commandcode.js";
import { openaiToKiroRequest } from "../../open-sse/translator/request/openai-to-kiro.js";
import { claudeToKiroRequest } from "../../open-sse/translator/request/claude-to-kiro.js";
import { claudeToOpenAIRequest } from "../../open-sse/translator/request/claude-to-openai.js";
import { geminiToOpenAIRequest } from "../../open-sse/translator/request/gemini-to-openai.js";
import { antigravityToOpenAIRequest } from "../../open-sse/translator/request/antigravity-to-openai.js";
import { vi, beforeEach } from "vitest";
import { GithubExecutor } from "../../open-sse/executors/github.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

describe("explicit output budget selection", () => {
  it.each([
    { tools: [{ name: "lookup" }] },
    { reasoning_effort: "high" },
    { thinking: { type: "enabled", budget_tokens: 24576 } },
    { thinking: { type: "adaptive" } },
  ])("never raises an explicit cap for %j", (reasoning) => {
    expect(adjustMaxTokens({ max_tokens: 1000, ...reasoning })).toBe(1000);
  });
  it("prefers the modern cap over the legacy cap", () => {
    expect(adjustMaxTokens({ max_completion_tokens: 1000, max_tokens: 50000 })).toBe(1000);
  });
  it.each([0, -1, 1.5, "1000", NaN, Infinity])("rejects invalid explicit cap %j", (value) => {
    expect(() => adjustMaxTokens({ max_completion_tokens: value, max_tokens: 50000 }))
      .toThrowError(expect.objectContaining({ code: "invalid_output_budget" }));
  });
  it.each([null, 0, NaN, Infinity])("does not turn an unknown ceiling %j into a zero cap", (ceiling) => {
    expect(adjustMaxTokens({ max_tokens: 1000 }, ceiling)).toBe(1000);
  });
  it("clamps downward to a known ceiling", () => {
    expect(adjustMaxTokens({ max_tokens: 100000 }, 32768)).toBe(32768);
  });
  it("retains the existing omitted-cap default", () => {
    expect(adjustMaxTokens({})).toBe(64000);
  });
});


const messages = [{ role: "user", content: "Reply OK" }];
const wire = (body) => JSON.parse(JSON.stringify(body));
const capRoutes = [
  ["Gemini", (b) => openaiToGeminiRequest("gemini-2.5-flash", b, false), (b) => b.generationConfig.maxOutputTokens],
  ["Gemini CLI", (b) => openaiToGeminiCLIRequest("gemini-2.5-flash", b, false), (b) => b.generationConfig.maxOutputTokens],
  ["Antigravity", (b) => openaiToAntigravityRequest("gemini-2.5-flash", b, false), (b) => b.request.generationConfig.maxOutputTokens],
  ["Ollama", (b) => openaiToOllamaRequest("qwen3", b, false), (b) => b.options?.num_predict],
  ["CommandCode", (b) => openaiToCommandCodeRequest("claude-sonnet-4-5", b, false), (b) => b.params.max_tokens],
  ["Kiro", (b) => openaiToKiroRequest("claude-sonnet-4.5", b, false, {}), (b) => b.inferenceConfig.maxTokens],
];

describe("translated output cap on serialized requests", () => {
  it.each(capRoutes)("%s forwards the modern cap instead of the larger legacy cap", (_name, convert, cap) => {
    const result = wire(convert({ messages, max_completion_tokens: 1000, max_tokens: 50000 }));
    expect(cap(result)).toBe(1000);
  });
  it.each(capRoutes)("%s forwards a modern-only cap", (_name, convert, cap) => {
    expect(cap(wire(convert({ messages, max_completion_tokens: 1000 })))).toBe(1000);
  });
  it.each(capRoutes)("%s rejects zero rather than dropping it or increasing the budget", (_name, convert) => {
    expect(() => convert({ messages, max_completion_tokens: 0 }))
      .toThrowError(expect.objectContaining({ code: "invalid_output_budget" }));
  });
  it.each([
    ["Claude", (value) => claudeToOpenAIRequest("gpt-5.4", { messages, max_tokens: value }, false)],
    ["Gemini", (value) => geminiToOpenAIRequest("gpt-5.4", { generationConfig: { maxOutputTokens: value } }, false)],
    ["Antigravity", (value) => antigravityToOpenAIRequest("gpt-5.4", { request: { generationConfig: { maxOutputTokens: value } } }, false)],
    ["Claude to Kiro", (value) => claudeToKiroRequest("claude-sonnet-4.5", { messages, max_tokens: value }, false, {})],
  ])("%s rejects zero on a target without native cache-prewarm semantics", (_name, convert) => {
    expect(() => convert(0)).toThrowError(expect.objectContaining({ code: "invalid_output_budget" }));
  });
  it("does not invent a model ceiling from the omitted-cap default", () => {
    expect(adjustMaxTokens({ max_tokens: 100000 })).toBe(100000);
  });
});

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

const agBody = (config, extra = {}) => ({
  ...extra,
  request: { contents: [{ role: "user", parts: [{ text: "Reply OK" }] }], generationConfig: config },
});
const agConfig = (config, extra = {}, model = "gemini-2.5-pro") => wire(new AntigravityExecutor()
  .transformRequest(model, agBody(config, extra), false, { projectId: "cap-test" })).request.generationConfig;

describe("final executor output caps", () => {
  beforeEach(() => {
    vi.mocked(proxyAwareFetch).mockReset();
    vi.mocked(proxyAwareFetch).mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
  });
  it.each(["gpt-5.4", "gpt-6"])("GitHub %s keeps modern precedence in the actual serialized fetch body", async (model) => {
    await new GithubExecutor().execute({ model, body: { messages, max_completion_tokens: 1000, max_tokens: 50000 }, stream: false, credentials: {} });
    const sent = JSON.parse(vi.mocked(proxyAwareFetch).mock.calls[0][1].body);
    expect(sent.max_completion_tokens).toBe(1000);
    expect(sent.max_tokens).toBeUndefined();
  });
  it("GitHub rejects an invalid modern cap before fetch", async () => {
    await expect(new GithubExecutor().execute({ model: "gpt-5.4", body: { messages, max_completion_tokens: 0, max_tokens: 50000 }, stream: false, credentials: {} }))
      .rejects.toMatchObject({ code: "invalid_output_budget" });
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });
  it("Antigravity rejects an explicit budget that cannot fit without dispatching or increasing the cap", async () => {
    const body = agBody({ maxOutputTokens: 1000, thinkingConfig: { thinkingBudget: 24576 } });
    await expect(new AntigravityExecutor().execute({ model: "gemini-2.5-pro", body, stream: false, credentials: { projectId: "cap-test" } }))
      .rejects.toMatchObject({ code: "invalid_thinking_budget", param: "request.generationConfig.maxOutputTokens" });
    expect(body.request.generationConfig.maxOutputTokens).toBe(1000);
    expect(body.request.generationConfig.thinkingConfig.thinkingBudget).toBe(24576);
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });
  it.each([-1, 0])("Antigravity preserves native thinking sentinel %s without changing its output cap", (budget) => {
    const result = agConfig({ maxOutputTokens: 1000, thinkingConfig: { thinkingBudget: budget, includeThoughts: false } });
    expect(result.maxOutputTokens).toBe(1000);
    expect(result.thinkingConfig).toEqual({ thinkingBudget: budget, includeThoughts: false });
  });
  it("Antigravity preserves qualitative thinkingLevel without adding a numeric budget", () => {
    expect(agConfig({ maxOutputTokens: 1000, thinkingConfig: { thinkingLevel: "high" } }, { reasoning_effort: "high" }, "gemini-4-argon").thinkingConfig)
      .toEqual({ thinkingLevel: "high" });
  });
  it("Antigravity rejects explicit thinking above the final known output ceiling", () => {
    expect(() => agConfig({ maxOutputTokens: 100000, thinkingConfig: { thinkingBudget: 100000 } }))
      .toThrow(expect.objectContaining({ code: "invalid_thinking_budget", message: expect.stringContaining("100000") }));
  });
  it("Antigravity retains the omitted-cap positive-budget default", () => {
    expect(agConfig({ thinkingConfig: { thinkingBudget: 4096 } }).maxOutputTokens).toBe(12288);
  });
  it("Antigravity does not invent arithmetic headroom for dynamic thinking", () => {
    expect(agConfig({ thinkingConfig: { thinkingBudget: -1 } }).maxOutputTokens).toBeUndefined();
  });
  it("Antigravity rejects zero output rather than spending a default budget", () => {
    expect(() => agConfig({ maxOutputTokens: 0 })).toThrowError(expect.objectContaining({ code: "invalid_output_budget" }));
  });
  it("Antigravity image final writer also preserves an explicit cap", () => {
    expect(agConfig({ maxOutputTokens: 1000 }, {}, "gemini-3-pro-image").maxOutputTokens).toBe(1000);
  });
  it("Antigravity refuses a Claude budget which cannot fit its minimum", () => {
    expect(() => agConfig({ maxOutputTokens: 1000, thinkingConfig: { thinkingBudget: 4096 } }, {}, "claude-sonnet-4-5-thinking"))
      .toThrowError(expect.objectContaining({ code: "invalid_thinking_budget" }));
  });
});

describe("executor validation edge cases", () => {
  it("GitHub removes the conflicting legacy cap even for older Chat models", () => {
    const result = wire(new GithubExecutor().transformRequest("gpt-4o", { max_tokens: 50000, max_completion_tokens: 1000 }, false, {}));
    expect(result.max_completion_tokens).toBe(1000);
    expect(result.max_tokens).toBeUndefined();
  });
  it("Antigravity recognizes a provider-prefixed Claude model for budget minimums", () => {
    expect(() => agConfig({ maxOutputTokens: 1000, thinkingConfig: { thinkingBudget: 4096 } }, {}, "ag/claude-sonnet-4-5-thinking"))
      .toThrowError(expect.objectContaining({ code: "invalid_thinking_budget" }));
  });
  it.each(["4096", 1.5, -2, NaN, Infinity])("Antigravity rejects invalid numeric thinking budget %s", (budget) => {
    expect(() => agConfig({ maxOutputTokens: 2000, thinkingConfig: { thinkingBudget: budget } }))
      .toThrowError(expect.objectContaining({ code: "invalid_thinking_budget" }));
  });
});

describe("Antigravity Claude cap envelope", () => {
  it.each([0, "1000", -1, 1.5])("rejects invalid modern Claude-bridge cap %s before the legacy fallback", (cap) => {
    expect(() => openaiToAntigravityRequest("claude-sonnet-4-5", { messages, max_completion_tokens: cap, max_tokens: 50000 }, false))
      .toThrowError(expect.objectContaining({ code: "invalid_output_budget" }));
  });
});

describe("smallest explicit Antigravity cap", () => {
  it("rejects a positive thinking budget that would otherwise silently become disabled", () => {
    expect(() => agConfig({ maxOutputTokens: 1, thinkingConfig: { thinkingBudget: 4096 } }))
      .toThrowError(expect.objectContaining({ code: "invalid_thinking_budget" }));
  });
});

describe("output cap compatibility controls", () => {
  it("preserves the Claude-to-OpenAI cap with numeric thinking and tools", () => {
    const result = wire(claudeToOpenAIRequest("gpt-5.4", { messages, max_tokens: 2000, thinking: { type: "enabled", budget_tokens: 1024 }, tools: [{ name: "lookup" }] }, false));
    expect(result.max_completion_tokens).toBe(2000);
  });
  it("retains Qwen's legacy max_tokens field", () => {
    const result = wire(claudeToOpenAIRequest("qwen3", { messages, max_tokens: 1000 }, false));
    expect(result.max_tokens).toBe(1000);
    expect(result.max_completion_tokens).toBeUndefined();
  });
  it("preserves native Google caps even when tool declarations are present", () => {
    const body = { generationConfig: { maxOutputTokens: 1000 }, tools: [{ functionDeclarations: [{ name: "lookup" }] }] };
    expect(wire(geminiToOpenAIRequest("gpt-5.4", body, false)).max_completion_tokens).toBe(1000);
    expect(wire(antigravityToOpenAIRequest("gpt-5.4", { request: body }, false)).max_completion_tokens).toBe(1000);
  });
  it("keeps existing Kiro and CommandCode defaults only for omitted caps", () => {
    expect(openaiToKiroRequest("claude-sonnet-4.5", { messages }, false, {}).inferenceConfig.maxTokens).toBe(32000);
    expect(claudeToKiroRequest("claude-sonnet-4.5", { messages }, false, {}).inferenceConfig.maxTokens).toBe(32000);
    expect(openaiToCommandCodeRequest("claude-sonnet-4-5", { messages }, false).params.max_tokens).toBe(64000);
  });
  it("does not invent omitted Google or Ollama output caps", () => {
    expect(openaiToGeminiRequest("gemini-2.5-flash", { messages }, false).generationConfig.maxOutputTokens).toBeUndefined();
    expect(openaiToOllamaRequest("qwen3", { messages }, false).options).toBeUndefined();
  });
  it("allows zero only when a caller explicitly opts into native prewarming", () => {
    expect(readOutputTokenCap({ max_tokens: 0 }, ["max_tokens"], { allowZero: true })).toBe(0);
  });
});
