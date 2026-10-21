import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getModelType, getModelsByProviderId } from "../../open-sse/config/providerModels.js";
import { setCatalogSource } from "../../open-sse/providers/capabilities.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { PROVIDER_MEDIA } from "../../open-sse/providers/index.js";

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: async () => [], getCombos: async () => [],
  getCustomModels: async () => [], getModelAliases: async () => ({}),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => ({}) }));
const { buildModelsList } = await import("@/app/api/v1/models/route.js");

beforeEach(() => {
  setCatalogSource(null);
  vi.stubGlobal("fetch", () => { throw new Error("Unexpected network request"); });
});
afterEach(() => { setCatalogSource(null); vi.unstubAllGlobals(); });

describe("media model registration is visible on its supported kind only", () => {
  it.each([
    ["assemblyai", "universal-3-5-pro", "stt"],
    ["cartesia", "sonic-3.6", "tts"],
    ["cartesia", "sonic-3.6-2026-08-27", "tts"],
    ["fish-audio", "s2.1-pro", "tts"],
    ["fish-audio", "s2.1-pro-free", "tts"],
    ["elevenlabs", "eleven_v3", "tts"],
  ])("exposes %s/%s as %s, not an invented chat route", async (provider, id, kind) => {
    expect(getModelsByProviderId(provider).find(model => model.id === id)).toMatchObject({ kind });
    const rows = await buildModelsList([kind]);
    expect(rows.some(model => model.id.endsWith(`/${id}`) && model.metadata?.limits?.kind === kind)).toBe(true);
    expect((await buildModelsList(["llm"])).some(model => model.id === `${provider}/${id}`)).toBe(false);
    expect(getReviewedModelMetadata(provider, id).limits.authenticatedRouteVerified).toBe(false);
  });

  it("does not offer the sunsetted Sonic 2 default after October 20 or retire the live Sonic 3 alias", async () => {
    expect(PROVIDER_MEDIA.cartesia.ttsConfig.models.find(model => model.id === "sonic-2")).toMatchObject({ deprecated: true });
    const rows = await buildModelsList(["tts"]);
    expect(rows.some(model => model.id === "cartesia/sonic-2")).toBe(false);
    expect(rows.some(model => model.id === "cartesia/sonic-3")).toBe(true);
    expect(getReviewedModelMetadata("cartesia", "sonic-2").limits.lifecycle).toMatchObject({ status: "retired", retirementDate: "2026-10-20" });
  });

  it("records Runway video's native price without claiming a /videos adapter", async () => {
    expect(getModelType("runwayml", "gen4.5")).toBe("video");
    expect(getReviewedModelMetadata("runwayml", "gen4.5")).toMatchObject({ billing: {
      currency: "USD", unit: "output_second", rates: { rate: 0.12 },
    }, limits: { routeSupported: false } });
    expect(PROVIDER_MEDIA.runwayml.videoConfig).toBeUndefined();
    expect((await buildModelsList(["video"])).some(model => model.id === "runwayml/gen4.5")).toBe(false);
  });

  it("does not map NanoBanana Pro's different endpoint to the legacy generate adapter", () => {
    expect(getReviewedModelMetadata("nanobanana", "nanobanana-pro")).toMatchObject({
      billing: { unit: "image_by_resolution", rates: { "1K": 0.09, "2K": 0.09, "4K": 0.12 } },
      limits: { routeSupported: false },
    });
    expect(PROVIDER_MEDIA.nanobanana.imageConfig.baseUrl).toBe("https://api.nanobananaapi.ai/api/v1/nanobanana/generate");
  });
});
