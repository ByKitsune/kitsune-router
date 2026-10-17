import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setCatalogSource } from "../../open-sse/providers/capabilities.js";
import { augmentModelsWithCapacityAdapter, getCapacityAdapterModels } from "../../open-sse/services/capacityAdapter.js";
import { getModelUpstreamId } from "../../open-sse/config/providerModels.js";

// DeepSeek renamed its flash model on 2026-09-10: `deepseek-flash` is the
// canonical id for V4.1 Flash, and `deepseek-v4-flash` /
// `deepseek-v4-flash-vision-exp` are retired ids that DeepSeek still routes to
// the same model for compatibility. All three accept image input.
const V41_FLASH_IDS = ["deepseek-flash", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp"];

const TEXT_ONLY_MODEL = "oc/text-only-model";
const FALLBACK_POOLS = {
  capacityAdapter: {
    vision: { enabled: true, models: ["openai/gpt-4o"] },
    audioInput: { enabled: true, models: ["gemini/gemini-3.8-flash"] },
  },
};

beforeEach(() => setCatalogSource(null));
afterEach(() => setCatalogSource(null));

describe("capacity adapter pooling", () => {
  it.each(V41_FLASH_IDS)("does not replace the vision-capable %s with a pool model", (id) => {
    const models = [`ds/${id}`];
    expect(augmentModelsWithCapacityAdapter(models, ["vision"], FALLBACK_POOLS)).toEqual(models);
  });
  it.each(["deepseek-v4-flash", "deepseek-v4-flash-vision-exp"])("routes the legacy %s identity to the canonical upstream", (id) => {
    expect(getModelUpstreamId("deepseek", id)).toBe("deepseek-flash");
  });

  it("prepends a capable pool model when no requested model covers the capability", () => {
    const settings = { capacityAdapter: { vision: { enabled: true, models: ["ds/deepseek-v4-flash-vision-exp"] } } };
    const out = augmentModelsWithCapacityAdapter([TEXT_ONLY_MODEL], ["vision"], settings);
    expect(out[0]).toBe("ds/deepseek-v4-flash-vision-exp");
    expect(out).toContain(TEXT_ONLY_MODEL);
  });

  it("only pools models for the capabilities the request needs", () => {
    const onlyAudioEnabled = { capacityAdapter: { audioInput: { enabled: true, models: ["gemini/gemini-3.8-flash"] } } };
    // A vision request must not pick up an audio pool's models.
    expect(getCapacityAdapterModels(onlyAudioEnabled, ["vision"])).toEqual([]);
    expect(augmentModelsWithCapacityAdapter([TEXT_ONLY_MODEL], ["vision"], onlyAudioEnabled)).toEqual([TEXT_ONLY_MODEL]);
  });

  it("selects the pool belonging to the requested capability", () => {
    const settings = {
      capacityAdapter: {
        vision: { enabled: true, models: ["ds/vision-pool-model"] },
        pdf: { enabled: true, models: ["oc/pdf-pool-model"] },
      },
    };
    expect(getCapacityAdapterModels(settings, ["vision"])).toEqual(["ds/vision-pool-model"]);
    expect(getCapacityAdapterModels(settings, ["pdf"])).toEqual(["oc/pdf-pool-model"]);
    expect(getCapacityAdapterModels(settings)).toEqual(["ds/vision-pool-model", "oc/pdf-pool-model"]);
  });
});
