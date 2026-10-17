import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ body: {}, custom: [] }));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: async () => Response.json(fixture.body) }));
vi.mock("@/lib/localDb", () => ({
  getProviderConnections: async () => [{ provider: "openai", apiKey: "offline-fixture", isActive: true }],
  getCombos: async () => [], getCustomModels: async () => fixture.custom, getModelAliases: async () => ({}),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => ({}) }));
import { clearProviderLiveModelsCache, fetchProviderLiveModels } from "@/shared/utils/providerLiveModels.js";
import { buildModelsList } from "@/app/api/v1/models/route.js";

beforeEach(() => { fixture.body = {}; fixture.custom = []; clearProviderLiveModelsCache(); });

describe("native live catalog fields reach effective public model metadata", () => {
  it("preserves independent snake-case ceilings and explicit capability flags through the real live parser", async () => {
    fixture.body = { data: [{ id: "opaque-live-facts", context_window: 1050000, max_input_tokens: 922000, max_output_tokens: 128000,
      architecture: { input_modalities: ["text"] }, capabilities: { vision: false, reasoning: true, tools: false } }] };
    const row = (await buildModelsList(["llm"])).find(model => model.id === "openai/opaque-live-facts");
    expect(row).toMatchObject({ context_length: 1050000, max_input_tokens: 922000, max_completion_tokens: 128000,
      capabilities: { contextWindow: 1050000, maxInput: 922000, maxOutput: 128000, vision: false, reasoning: true, tools: false } });
  });

  it("does not relabel a per-request prompt ceiling as the total context window", async () => {
    fixture.body = { data: [{ id: "opaque-prompt-only", per_request_limits: { prompt_tokens: 480000, completion_tokens: 32000 } }] };
    const rows = await fetchProviderLiveModels("openai", "offline-fixture", { useCache: false });
    expect(rows[0].capabilities).toMatchObject({ maxInput: 480000, maxOutput: 32000 });
    expect(rows[0]).not.toHaveProperty("context_length");
    expect(rows[0].capabilities).not.toHaveProperty("contextWindow");
  });

  it("honors a complete text-only input declaration above a vision-looking model name", async () => {
    fixture.body = { data: [{ id: "opaque-vision-model", input_modalities: ["text"] }] };
    const row = (await buildModelsList(["llm"])).find(model => model.id === "openai/opaque-vision-model");
    expect(row.capabilities.vision).toBe(false);
    expect((await buildModelsList(["imageToText"])).some(model => model.id === row.id)).toBe(false);
  });

  it("retains explicit operator overrides above equivalent live fields", async () => {
    fixture.body = { data: [{ id: "opaque-operator-model", context_window: 1050000, max_input_tokens: 922000, max_output_tokens: 128000,
      capabilities: { vision: false } }] };
    fixture.custom = [{ providerAlias: "openai", id: "opaque-operator-model", caps: { contextWindow: 333333, maxInput: 222222, maxOutput: 11111, vision: true } }];
    const row = (await buildModelsList(["llm"])).find(model => model.id === "openai/opaque-operator-model");
    expect(row).toMatchObject({ context_length: 333333, max_input_tokens: 222222, max_completion_tokens: 11111, capabilities: { vision: true } });
  });
});
