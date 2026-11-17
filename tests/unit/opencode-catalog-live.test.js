import { describe, expect, it } from "vitest";
import { getProviderModels, getModelTargetFormat } from "../../open-sse/config/providerModels.js";
import { isFreeOpenCodeModel, normalizeOpenCodeModel } from "../../open-sse/config/opencodeCatalog.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { openCodeGoCatalog, openCodeZenCatalog } from "../../open-sse/providers/metadata/opencodeCatalogData.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { getPricingForModel, resolveEffectivePricing } from "../../open-sse/providers/pricing.js";
import { resolveTransport } from "../../open-sse/services/provider.js";
import { validateOpenCodeKey } from "../../open-sse/services/opencodeValidation.js";

describe("first-party OpenCode catalogs", () => {
  it("registers every captured route under its own billing product", () => {
    const free = new Set(getProviderModels("oc").map(model => model.id));
    const zen = new Set(getProviderModels("opencode-zen").map(model => model.id));
    const go = new Set(getProviderModels("opencode-go").map(model => model.id));
    for (const row of openCodeZenCatalog.models) {
      expect((isFreeOpenCodeModel(row) ? free : zen).has(row.id), row.id).toBe(true);
    }
    for (const row of openCodeGoCatalog.models) {
      expect(go.has(row.id), row.id).toBe(true);
      const metadata = getReviewedModelMetadata("ocg", row.id);
      expect(metadata.billing).toMatchObject({ kind: "subscription-reference", catalogReferencePricing: row.pricing });
      expect(getPricingForModel("ocg", row.id)).toMatchObject({ input: null, output: null });
    }
    expect(getPricingForModel("oc", "big-pickle")).toMatchObject({ input: 0, output: 0, cached: 0 });
    expect(free.has("gpt-6.2-sol")).toBe(false);
    expect(go.has("gpt-6.2-astra")).toBe(false);
  });

  it.each([
    ["gpt-6.2-sol", { input: 2, cached: 0.1, output: 10, cache_write_30m: 2.5, cache_write_12h: 5 }, { input: 4, cached: 0.2, output: 15 }],
    ["gpt-6.2-astra", { input: 8, cached: 0.4, output: 40, cache_write_30m: 10, cache_write_12h: 20 }, { input: 16, cached: 0.8, output: 60 }],
  ])("routes paid Zen %s through Responses and prices its own context tiers", (model, standard, longContext) => {
    const provider = "opencode-zen";
    expect(getModelTargetFormat(provider, model)).toBe("openai-responses");
    const executor = new DefaultExecutor(provider);
    const credentials = { apiKey: "fixture", runtimeTransport: resolveTransport(provider, "openai-responses") };
    const url = executor.buildUrl(model, true, 0, credentials);
    expect(url).toBe("https://opencode.ai/inference/openai/v1/responses");
    expect(executor.buildHeaders(credentials, true, url, model)).toMatchObject({ Authorization: "Bearer fixture" });
    const quote = getPricingForModel(provider, model);
    expect(resolveEffectivePricing(quote, 272000)).toMatchObject(standard);
    expect(resolveEffectivePricing(quote, 272001)).toMatchObject(longContext);
  });

  it.each(["opencode-zen", "opencode-go"])("constructs the Gemini RPC with the correct key for %s", (provider) => {
    const model = "gemini-4-argon";
    const executor = new DefaultExecutor(provider);
    const credentials = { apiKey: "fixture", runtimeTransport: resolveTransport(provider, "gemini") };
    const prefix = provider === "opencode-go" ? "go/" : "";
    expect(getModelTargetFormat(provider, model)).toBe("gemini");
    const url = executor.buildUrl(model, true, 0, credentials);
    expect(url).toBe(`https://opencode.ai/inference/${prefix}google/v1beta/models/${model}:streamGenerateContent?alt=sse`);
    expect(executor.buildHeaders(credentials, true, url, model)).toMatchObject({ "x-goog-api-key": "fixture" });
  });

  it("requires an explicit free tariff and a first-party endpoint instead of trusting the ID suffix", () => {
    const raw = {
      id: "future-free", type: "chat", cost: { text: { input: { price: 0 }, output: { price: 1 } } },
      api: { "chat-completions": { base_url: "https://opencode.ai/inference/openai/v1" } },
    };
    expect(isFreeOpenCodeModel(normalizeOpenCodeModel(raw, "zen"))).toBe(false);
    raw.cost.text.output.price = 0;
    expect(isFreeOpenCodeModel(normalizeOpenCodeModel(raw, "zen"))).toBe(true);
    raw.api["chat-completions"].base_url = "https://example.com/v1";
    expect(normalizeOpenCodeModel(raw, "zen")).toBeNull();
  });

  it("reports the Go session restriction as an unverified connection", async () => {
    const result = await validateOpenCodeKey("opencode-go", "fixture", async (_url, { headers }) => {
      expect(headers.Authorization).toBe("Bearer fixture");
      expect(headers).not.toHaveProperty("x-opencode-session");
      return Response.json({ error: { type: "MissingSessionID" } }, { status: 400 });
    });
    expect(result).toMatchObject({ valid: false, error: expect.stringContaining("requires a supported client session") });
  });

  it("probes an authenticated paid Zen route", async () => {
    const result = await validateOpenCodeKey("opencode-zen", "fixture", async (url, { body, headers }) => {
      expect(url).toBe("https://opencode.ai/inference/openai/v1/chat/completions");
      expect(headers.Authorization).toBe("Bearer fixture");
      expect(JSON.parse(body).model).toBe("deepseek-v4.1-flash");
      return Response.json({ object: "chat.completion" });
    });
    expect(result).toEqual({ valid: true, error: null });
  });
});
