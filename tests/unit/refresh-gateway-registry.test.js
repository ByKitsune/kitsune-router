import { describe, expect, it } from "vitest";
import { getDefaultModel, getModelSupportedFormats, getModelTargetFormat, getModelUpstreamId, getProviderModels, isValidModel } from "../../open-sse/config/providerModels.js";

describe("public gateway catalog at the client registry boundary", () => {
  it.each([
    ["chutes", "google/gemma-4-31B-turbo-TEE"],
    ["nebius", "deepseek-ai/DeepSeek-V4.1-Flash"],
    ["nvidia", "nvidia/nemotron-3.5-super-vl-120b-a12b"],
    ["ollama", "minimax-m3.1-flash"],
    ["siliconflow", "deepseek-ai/DeepSeek-V4-Pro-0813"],
    ["together", "meta-models/Muse-Spark-Open-816B-A42B"],
    ["venice", "deepseek-v4-1-flash-1017"],
    ["kgw", "kilo-auto/efficient"],
    ["openrouter", "minimax/minimax-m3.1-flash:free"],
    ["tokenrouter", "deepseek/deepseek-v4.1-flash-1017"],
    ["morph", "morph-dsv41flash-1017"],
    ["oc", "deepseek-v4.1-flash-free"],
    ["kgw", "minimax/minimax-m3.1-flash:free"],
    ["oc", "minimax-m3.1-flash-free"],
  ])("advertises the exact public text ID %s/%s without namespace rewriting", (provider, model) => {
    expect(isValidModel(provider, model)).toBe(true);
    expect(getModelUpstreamId(provider, model)).toBe(model);
    expect(getProviderModels(provider).find(row => row.id === model)?.kind || "llm").toBe("llm");
  });

  it.each([
    ["tokenrouter", "anthropic/claude-haiku-5.5"],
    ["tokenrouter", "google/gemini-4-argon"],
    ["tokenrouter", "typesafe/jev-1.13"],
  ])("does not advertise a new %s/%s route requiring an unsupported native wire", (provider, model) => {
    expect(isValidModel(provider, model)).toBe(false);
  });

  it("keeps existing literal aliases even when an anonymous catalog no longer lists them", () => {
    for (const [provider, model] of [["ollama", "qwen3.5"], ["tokenrouter", "moonshotai/kimi-k3-free"], ["oc", "muse-spark-1.2-contributor-free"]]) {
      expect(isValidModel(provider, model)).toBe(true);
      expect(getModelUpstreamId(provider, model)).toBe(model);
    }
  });

  it.each([
    ["chutes", "moonshotai/Kimi-K3-TEE"],
    ["nebius", "deepseek-ai/DeepSeek-V4-Flash-0731"],
    ["nvidia", "minimaxai/minimax-m2.7"],
    ["ollama", "gpt-oss:120b"],
    ["siliconflow", "deepseek-ai/DeepSeek-V4-Pro"],
    ["together", "meta-llama/Llama-3.3-70B-Instruct-Turbo"],
    ["venice", "venice-uncensored-1-2"],
    ["kgw", "kilo-auto/free"],
    ["openrouter", "openai/text-embedding-3-large"],
    ["tokenrouter", "MiniMax-Hailuo-2.3"],
    ["morph", "morph-v3-large"],
    ["oc", "muse-spark-1.2-contributor-free"],
  ])("does not change %s's configured first-model fallback when adding catalog seeds", (provider, expected) => {
    expect(getDefaultModel(provider)).toBe(expected);
  });

  it("limits new OpenCode Chat routes to the adapter's actual supported format", async () => {
    expect(getModelTargetFormat("oc", "deepseek-v4.1-flash-free")).toBe("openai");
    expect(getModelSupportedFormats("oc", "deepseek-v4.1-flash-free")).toEqual(["openai"]);
    const { getCapabilitiesForModel } = await import("../../open-sse/providers/capabilities.js");
    expect(getCapabilitiesForModel("opencode", "deepseek-v4.1-flash-free")).toMatchObject({ audioInput: false, videoInput: false, imageOutput: false, audioOutput: false });
  });

  it("does not promise audio/video or media generation for a newly seeded hosted text model", async () => {
    const { getCapabilitiesForModel } = await import("../../open-sse/providers/capabilities.js");
    expect(getCapabilitiesForModel("nvidia", "nvidia/nemotron-3.5-super-vl-120b-a12b")).toMatchObject({ audioInput: false, videoInput: false, imageOutput: false, audioOutput: false });
  });

  it.each([
    ["nvidia", "nvidia/nemotron-3.5-super-vl-120b-a12b"],
    ["tokenrouter", "openai/gpt-6.1-sol"],
    ["opencode", "minimax-m3.1-flash-free"],
  ])("does not manufacture %s/%s route limits from another vendor's model name", async (provider, model) => {
    const { getCapabilitiesForModel } = await import("../../open-sse/providers/capabilities.js");
    expect(getCapabilitiesForModel(provider, model)).toMatchObject({ contextWindow: null, maxInput: null, maxOutput: null });
  });
});
