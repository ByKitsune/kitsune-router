import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real public catalog, registry, aliases and metadata stay in the test.
// Only persisted operator state is synthetic; no host/production DB is opened.
vi.mock("@/lib/localDb", () => ({
  getProviderConnections: vi.fn(async () => []),
  getCombos: vi.fn(async () => []),
  getCustomModels: vi.fn(async () => []),
  getModelAliases: vi.fn(async () => ({})),
  getProviderNodes: vi.fn(async () => []),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: vi.fn(async () => ({})) }));

import { buildModelsList } from "../../src/app/api/v1/models/route.js";
import { getModelUpstreamId, getModelsByProviderId, getDefaultModel, isValidModel } from "../../open-sse/config/providerModels.js";
import { getModelInfoCore } from "../../open-sse/services/model.js";
import { getProviderConnections } from "@/lib/localDb";

beforeEach(() => {
  vi.clearAllMocks();
  getProviderConnections.mockResolvedValue([]);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected network request in static catalog test"); }));
});
afterEach(() => vi.unstubAllGlobals());

// Exact IDs are from publisher model pages, public provider catalogs and the
// region-specific CodeBuddy 2.171.0 product files captured 2026-10-21.
// Catch a model omitted from the client catalog, rewritten namespace/case,
// wrong regional alias, or inherited vendor limits overriding hosted limits.
describe("refreshed OAuth and IDE fallback catalog resolution", () => {
  it.each([
    ["cursor", "cu", "claude-sonnet-5-5", "claude-sonnet-5-5"],
    ["cursor", "cu", "claude-opus-5-5", "claude-opus-5-5"],
    ["cursor", "cu", "claude-haiku-5-5", "claude-haiku-5-5"],
    ["cursor", "cu", "gemini-4-argon", "gemini-4-argon"],
    ["cursor", "cu", "gemini-3.8-flash", "gemini-3.8-flash"],
    ["cursor", "cu", "gpt-5.6-sol", "gpt-5.6-sol"],
    ["cursor", "cu", "gpt-5.6-terra", "gpt-5.6-terra"],
    ["cursor", "cu", "gpt-5.6-luna", "gpt-5.6-luna"],
    ["cursor", "cu", "grok-4.7", "grok-4.7"],
    ["cursor", "cu", "grok-4.6", "grok-4.6"],
    ["cursor", "cu", "composer-2.5", "composer-2.5"],
    ["kiro", "kr", "auto", "auto"],
    ["codebuddy-cn", "cbcn", "kimi-k3-2", "kimi-k3-2"],
    ["codebuddy-cn", "cbcn", "minimax-m3-pay", "minimax-m3-pay"],
    ["codebuddy-cn", "cbcn", "glm-5.3-flashx", "glm-5.3-flashx"],
    ["codebuddy-intl", "cbai", "kimi-k3", "kimi-k3"],
    ["codebuddy-intl", "cbai", "deepseek-v4.1-flash", "deepseek-v4.1-flash"],
    ["codebuddy-intl", "cbai", "deepseek-v4.1-flash-sg", "deepseek-v4.1-flash-sg"],
    ["codebuddy-intl", "cbai", "gpt-6-astra", "gpt-6-astra"],
    ["commandcode", "commandcode", "deepseek/deepseek-v4.1-flash", "deepseek/deepseek-v4.1-flash"],
    ["commandcode", "commandcode", "deepseek/deepseek-v4.1-flash-fast", "deepseek/deepseek-v4.1-flash-fast"],
    ["commandcode", "commandcode", "Qwen/Qwen3.8-Max-Prime", "Qwen/Qwen3.8-Max-Prime"],
    ["commandcode", "commandcode", "Qwen/Qwen3.8-27B", "Qwen/Qwen3.8-27B"],
    ["commandcode", "commandcode", "MiniMaxAI/MiniMax-M3", "MiniMaxAI/MiniMax-M3"],
    ["commandcode", "commandcode", "xiaomi/mimo-v2.6-pro", "xiaomi/mimo-v2.6-pro"],
    ["cline", "cl", "anthropic/claude-sonnet-5.5", "anthropic/claude-sonnet-5.5"],
    ["cline", "cl", "anthropic/claude-opus-5.5", "anthropic/claude-opus-5.5"],
    ["cline", "cl", "openai/gpt-6.1-sol", "openai/gpt-6.1-sol"],
    ["cline", "cl", "deepseek/deepseek-v4.1-flash-1017", "deepseek/deepseek-v4.1-flash-1017"],
    ["cline", "cl", "cline-free/minimax-m3.1-flash", "cline-free/minimax-m3.1-flash"],
    ["kilocode", "kc", "anthropic/claude-sonnet-5.5", "anthropic/claude-sonnet-5.5"],
    ["kilocode", "kc", "anthropic/claude-opus-5.5", "anthropic/claude-opus-5.5"],
    ["kilocode", "kc", "openai/gpt-6.1-sol", "openai/gpt-6.1-sol"],
    ["kilocode", "kc", "deepseek/deepseek-v4.1-flash-1017", "deepseek/deepseek-v4.1-flash-1017"],
    ["kilocode", "kc", "minimax/minimax-m3.1-flash:free", "minimax/minimax-m3.1-flash:free"],
    ["blackbox", "blackbox", "gemini-3.5-flash", "blackboxai/google/gemini-3.5-flash"],
    ["blackbox", "blackbox", "gemma-4-31b-it", "blackboxai/google/gemma-4-31b-it"],
    ["blackbox", "blackbox", "mistral-medium-3.5", "blackboxai/mistral/mistral-medium-3.5"],
    ["bazaarlink", "bzl", "gpt-6.1-sol", "gpt-6.1-sol"],
    ["bazaarlink", "bzl", "claude-sonnet-5.5", "claude-sonnet-5.5"],
    ["bazaarlink", "bzl", "claude-opus-5.5", "claude-opus-5.5"],
    ["bazaarlink", "bzl", "deepseek-v4.1-flash-1017", "deepseek-v4.1-flash-1017"],
    ["bazaarlink", "bzl", "kimi-k3", "kimi-k3"],
    ["api-airforce", "af", "claude-sonnet-5.5", "claude-sonnet-5.5"],
    ["api-airforce", "af", "claude-opus-5.5", "claude-opus-5.5"],
    ["llm7", "llm7", "DeepSeek-V4.1-Flash", "DeepSeek-V4.1-Flash"],
    ["llm7", "llm7", "gpt-6.1-sol", "gpt-6.1-sol"],
    ["llm7", "llm7", "claude-opus-5-5", "claude-opus-5-5"],
  ])("resolves %s's public %s/%s route without borrowing another provider's wire ID", async (provider, alias, model, wire) => {
    expect(isValidModel(alias, model)).toBe(true);
    const selected = getModelsByProviderId(provider).find(row => row.id === model);
    expect(selected).toBeDefined();
    expect(await getModelInfoCore(`${alias}/${model}`)).toEqual({ provider, model });
    expect(getModelUpstreamId(alias, selected.id)).toBe(wire);
  });

  it("publishes Cursor's ordinary windows rather than its opt-in Max windows", async () => {
    getProviderConnections.mockResolvedValue([{ id: "fixture-cursor", provider: "cursor", isActive: true }]);
    const models = await buildModelsList(["llm"]);
    for (const [id, context] of [["cu/claude-sonnet-5-5", 200000], ["cu/claude-opus-5-5", 300000], ["cu/gpt-5.6-sol", 272000], ["cu/grok-4.7", 256000], ["cu/composer-2.5", 200000]]) {
      expect(models.find(row => row.id === id)).toMatchObject({ context_length: context, capabilities: { tools: true, reasoning: true } });
    }
  });

  it("keeps CodeBuddy region-specific limits and an opt-in context default", async () => {
    getProviderConnections.mockResolvedValue([
      { id: "fixture-cn", provider: "codebuddy-cn", isActive: true },
      { id: "fixture-intl", provider: "codebuddy-intl", isActive: true },
    ]);
    const models = await buildModelsList(["llm"]);
    expect(models.find(row => row.id === "cbcn/kimi-k3-2")).toMatchObject({ context_length: 1000000, max_completion_tokens: 32000 });
    expect(models.find(row => row.id === "cbai/kimi-k3")).toMatchObject({ context_length: 1000000, max_completion_tokens: 32000 });
    expect(models.find(row => row.id === "cbai/deepseek-v4.1-flash")).toMatchObject({ context_length: 300000, max_completion_tokens: 128000 });
    expect(models.find(row => row.id === "cbai/gpt-6-astra")).toMatchObject({ context_length: 400000, max_completion_tokens: 128000 });
  });

  it("does not import a vendor's vision claim into LLM7's text-only DeepSeek route", async () => {
    getProviderConnections.mockResolvedValue([{ id: "fixture-llm7", provider: "llm7", isActive: true }]);
    const models = await buildModelsList(["llm"]);
    expect(models.find(row => row.id === "llm7/DeepSeek-V4.1-Flash")).toMatchObject({ context_length: 1000000, capabilities: { vision: false, reasoning: true, tools: true } });
  });

  it("retains Kiro's default and synthetic variants while exposing the documented GPT window", async () => {
    expect(getDefaultModel("kr")).toBe("claude-opus-5-5");
    getProviderConnections.mockResolvedValue([{ id: "fixture-kiro", provider: "kiro", isActive: true }]);
    const models = await buildModelsList(["llm"]);
    expect(models.find(row => row.id === "kr/gpt-5.6-sol-thinking-agentic")).toMatchObject({ context_length: 1000000 });
    expect(models.find(row => row.id === "kr/auto")).toBeDefined();
  });

  it("does not add CommandCode profiles requiring unimplemented prefix-bound or deferred-tool behavior", () => {
    expect(isValidModel("commandcode", "claude-sonnet-5-5")).toBe(false);
    expect(isValidModel("commandcode", "gpt-6.1-sol")).toBe(false);
    expect(isValidModel("commandcode", "moonshotai/Kimi-K3")).toBe(false);
  });

  it("defers Cursor's approval-gated Fable 5.1 to authenticated discovery instead of advertising it by default", async () => {
    getProviderConnections.mockResolvedValue([{ id: "fixture-cursor", provider: "cursor", isActive: true }]);
    const models = await buildModelsList(["llm"]);
    expect(models.some(row => row.id === "cu/claude-fable-5-1")).toBe(false);
  });

  it("keeps existing opaque keys and entitlements when anonymous catalogs are unavailable or omit them", () => {
    for (const [alias, model] of [["cu", "claude-4.5-opus-high-thinking"], ["kr", "claude-opus-5-thinking-agentic"], ["cbcn", "kimi-k3-1"], ["qd", "qmodel_38max"], ["kimchi", "nemotron-3-ultra-fp4"], ["bm", "claude-opus-4-5"], ["paraloncloud", "qwen3.8-27b"], ["mmf", "mimo-auto"]]) {
      expect(isValidModel(alias, model), `${alias}/${model}`).toBe(true);
    }
    expect(getDefaultModel("cu")).toBe("default");
    expect(getDefaultModel("commandcode")).toBe("deepseek/deepseek-v4-pro");
  });
});
