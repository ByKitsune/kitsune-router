import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROVIDER_MODELS, filterAdvertisedModels, getDefaultModel, getModelUpstreamId, isValidModel } from "../../open-sse/config/providerModels.js";
import { getCapabilitiesForModel, setCatalogSource } from "../../open-sse/providers/capabilities.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import openaiTts from "../../open-sse/handlers/ttsProviders/openai.js";

const fixture = vi.hoisted(() => ({ customModels: [] }));
vi.mock("@/lib/localDb", () => ({
  getProviderConnections: async () => [], getCombos: async () => [],
  getCustomModels: async () => fixture.customModels, getModelAliases: async () => ({}),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => ({}) }));
const { buildModelsList } = await import("@/app/api/v1/models/route.js");

beforeEach(() => { fixture.customModels = []; setCatalogSource(null); });
afterEach(() => { setCatalogSource(null); vi.unstubAllGlobals(); });

describe("publisher model lifecycle reaches advertisements without removing stored routes", () => {
  it("suppresses past and announced future deprecations on the exact provider", async () => {
    const ids = new Set((await buildModelsList(["llm", "tts", "stt", "embedding", "image"])).map((model) => model.id));
    for (const id of ["openai/gpt-4-turbo", "openai/gpt-5.3-codex", "openai/tts-1", "openai/gpt-4o-mini-tts", "gemini/gemini-2.5-pro", "gemini/gemini-embedding-2-preview", "xai/grok-imagine-image-quality", "qd/lite", "xiaomi-tokenplan/mimo-v2.5-pro-claude"]) {
      expect(ids.has(id), id).toBe(false);
    }
    expect(ids.has("gemini/gemini-2.5-flash-lite")).toBe(true);
    expect(ids.has("gemini/gemini-3-flash-preview")).toBe(true);
    expect(ids.has("gc/gemini-2.5-pro")).toBe(true);
    expect(ids.has("xai/grok-imagine-image")).toBe(true);
    expect(isValidModel("openai", "gpt-4-turbo")).toBe(true);
    expect(getModelUpstreamId("xiaomi-tokenplan", "mimo-v2.5-pro-claude")).toBe("mimo-v2.5-pro");
    expect(getModelUpstreamId("ag", "gemini-3.5-flash-high")).toBe("gemini-3-flash-agent");
  });

  it("keeps an explicit operator model even when its built-in suggestion is deprecated", async () => {
    fixture.customModels = [{ providerAlias: "openai", id: "gpt-4-turbo", type: "llm", name: "Stored operator route" }];
    expect((await buildModelsList(["llm"])).find((model) => model.id === "openai/gpt-4-turbo")).toBeDefined();
    expect(filterAdvertisedModels("openai", [{ id: "gpt-4-turbo" }, { id: "gpt-4-turbo", isCustom: true }])).toEqual([{ id: "gpt-4-turbo", isCustom: true }]);
  });

  it("does not select deprecated rows as an automatic default", () => {
    const alias = "__lifecycle_test__";
    PROVIDER_MODELS[alias] = [{ id: "old", deprecated: true }, { id: "current" }];
    try {
      expect(getDefaultModel(alias)).toBe("current");
      PROVIDER_MODELS[alias].pop();
      expect(getDefaultModel(alias)).toBeNull();
    } finally { delete PROVIDER_MODELS[alias]; }
    expect(getDefaultModel("if")).toBeNull();
  });

  it("requires an explicit legacy Speech model instead of choosing a deprecated default or Realtime model", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2]), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const result = await openaiTts.synthesize("hello", "alloy", { apiKey: "test-key" });
    expect(result).toMatchObject({ success: false, status: 400 });
    expect(fetch).not.toHaveBeenCalled();
    await openaiTts.synthesize("hello", "tts-1/alloy", { apiKey: "test-key" });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ model: "tts-1", voice: "alloy" });
  });
});

describe("exact login and gateway catalog additions", () => {
  it.each([
    ["cl", "openai/gpt-6.1-terra-pro"], ["cl", "google/gemini-4-argon"],
    ["clinepass", "cline-pass/kimi-k3.1-pro"], ["clinepass", "cline-pass/mimo-v2.6-pro"],
    ["kgw", "nvidia/nemotron-3.5-super-vl:free"], ["kgw", "reflection/beam-free"],
    ["cbai", "primary-model"], ["cbai", "deep-model"],
  ])("preserves the literal ID and unknown independent input for %s/%s", (provider, model) => {
    expect(isValidModel(provider, model)).toBe(true);
    expect(getModelUpstreamId(provider, model)).toBe(model);
    expect(getReviewedModelMetadata(provider, model)?.capabilities.maxInput).toBeNull();
  });

  it("uses exact Kilo route capabilities without transferring public model limits to ClinePass", () => {
    expect(getCapabilitiesForModel("kilo-gateway", "nvidia/nemotron-3.5-super-vl:free")).toMatchObject({ contextWindow: 1000000, maxOutput: 131072, maxInput: null, vision: true, videoInput: true, tools: true });
    expect(getReviewedModelMetadata("clinepass", "cline-pass/kimi-k3.1-pro").capabilities).toMatchObject({ contextWindow: null, maxInput: null, maxOutput: null });
  });

  it.each(["cline", "clinepass"])("requests the standard non-streaming OpenAI shape from %s", (provider) => {
    const headers = new DefaultExecutor(provider).buildHeaders({ apiKey: "test-key" }, false);
    expect(headers["X-Response-Format"]).toBe("openai");
  });
});
