import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getPublicModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import {
  applyExactCatalogCapabilities,
  getModelsDevCapabilityReference,
} from "../../open-sse/providers/metadata/modelsDevCapabilityResolution.js";
import {
  MODELS_DEV_CAPABILITY_REFERENCES,
  MODELS_DEV_CAPABILITY_SOURCE,
} from "../../open-sse/providers/metadata/modelsDevCapabilities.js";

const catalogModel = ["perplexity-agent", "google/gemini-3.8-flash"];

describe("pinned exact-product capability refresh", () => {
  it("does not borrow native Gemini audio/video support for the Agent route", () => {
    expect(getCapabilitiesForModel(...catalogModel)).toMatchObject({
      vision: true, audioInput: false, videoInput: false,
      contextWindow: null, maxInput: null, maxOutput: null,
    });
    expect(getCapabilitiesForModel("gemini", "gemini-3.8-flash")).toMatchObject({
      audioInput: true, videoInput: true,
    });
  });

  it.each(["xai/grok-4.5", "xai/grok-4.6", "openai/gpt-5.4"])("does not advertise unsupported Agent PDF input on %s", (model) => {
    expect(getCapabilitiesForModel("perplexity-agent", model).pdf).toBe(false);
  });

  it("uses Morph-specific modalities instead of Kimi's vendor-family defaults", () => {
    expect(getCapabilitiesForModel("morph", "morph-kimik3")).toMatchObject({
      vision: true, pdf: false, videoInput: false, reasoning: true,
    });
    expect(getCapabilitiesForModel("morph", "morph-glm53flash").videoInput).toBe(true);
    expect(getCapabilitiesForModel("morph", "morph-dsv41flash-1017")).toMatchObject({ vision: true, reasoning: true });
  });

  it("fills newly documented reasoning and vision without inventing numeric limits", () => {
    expect(getCapabilitiesForModel("chutes", "google/gemma-4-31B-turbo-TEE"))
      .toMatchObject({ reasoning: true, contextWindow: null, maxInput: null, maxOutput: null });
    expect(getCapabilitiesForModel("kilo-gateway", "kilo-auto/efficient"))
      .toMatchObject({ reasoning: true, vision: true, contextWindow: null, maxOutput: null });
  });

  it("never falls across provider products or guesses aliases from leaf names", () => {
    expect(getModelsDevCapabilityReference("codex", "gpt-4o")).toBeNull();
    expect(getModelsDevCapabilityReference("private-endpoint", "google/gemini-3.8-flash")).toBeNull();
    expect(getModelsDevCapabilityReference("perplexity-agent", "gemini-3.8-flash")).toBeNull();
    expect(getModelsDevCapabilityReference("perplexity-agent", "google/gemini-3.8-flash-unverified")).toBeNull();
  });

  it("preserves primary-source negative facts and explicit route restrictions", () => {
    const record = { sources: ["https://example.com/provider-spec"], capabilities: { vision: false } };
    expect(applyExactCatalogCapabilities({ vision: false, audioInput: true }, ...catalogModel, record))
      .toMatchObject({ vision: false, audioInput: false });
    expect(applyExactCatalogCapabilities({ vision: false }, ...catalogModel, null, { vision: false }).vision).toBe(false);
  });

  it("refreshes stale secondary facts but retains an explicit unknown limit", () => {
    const secondary = { sources: ["https://models.dev/api.json"], capabilities: { vision: false } };
    expect(applyExactCatalogCapabilities({ vision: false }, ...catalogModel, secondary).vision).toBe(true);
    const unknown = { limits: { unverifiedCapabilityFields: ["contextWindow"] } };
    expect(applyExactCatalogCapabilities({ contextWindow: null }, "openai", "gpt-4o", unknown).contextWindow).toBeNull();
  });

  it("retains bounded route ceilings and unsupported document paths", () => {
    expect(getCapabilitiesForModel("antigravity", "claude-sonnet-4-6"))
      .toMatchObject({ contextWindow: 250000, maxOutput: 64000, pdf: false });
    expect(getCapabilitiesForModel("codex", "gpt-6.1-terra"))
      .toMatchObject({ contextWindow: null, maxInput: null, maxOutput: null, pdf: false });
  });

  it("publishes source scope and date without publishing raw capture identifiers", () => {
    const result = getPublicModelMetadata(...catalogModel, getCapabilitiesForModel(...catalogModel));
    expect(result.capabilityCatalog).toMatchObject({
      source: "https://models.dev/api.json", asOf: "2026-10-30", product: "perplexity-agent",
      model: "google/gemini-3.8-flash", authenticatedRouteVerified: false,
    });
    expect(JSON.stringify(result.capabilityCatalog)).not.toMatch(/[a-f0-9]{40,64}/);
    expect(MODELS_DEV_CAPABILITY_SOURCE.retrieval).toMatch(/not an HTTP API (?:response )?capture/);
    expect(MODELS_DEV_CAPABILITY_SOURCE.commit).toBe("971a07c53cdb688185015776b76151d514b7bde5");
    expect(MODELS_DEV_CAPABILITY_SOURCE.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("stores one valid record per exact provider/model identity", () => {
    const identities = MODELS_DEV_CAPABILITY_REFERENCES.map(([provider, model]) => `${provider}\0${model}`);
    expect(new Set(identities).size).toBe(406);
    expect(identities).toHaveLength(406);
    for (const [, , product, model, caps] of MODELS_DEV_CAPABILITY_REFERENCES) {
      expect(product).toBeTruthy();
      expect(model).toBeTruthy();
      for (const [field, value] of Object.entries(caps)) {
        if (["contextWindow", "maxInput", "maxOutput"].includes(field)) {
          expect(Number.isSafeInteger(value) && value > 0, field).toBe(true);
        } else expect(typeof value, field).toBe("boolean");
      }
    }
  });
});
