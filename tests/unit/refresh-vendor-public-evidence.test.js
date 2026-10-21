import { beforeEach, describe, expect, it, vi } from "vitest";

// Only mock persisted settings; the real registry, capability resolver and
// dashboard serializer run, with no database or authenticated provider traffic.
const storage = vi.hoisted(() => ({ getModelAliases: vi.fn(), getCustomModels: vi.fn(), getDisabledModels: vi.fn() }));
vi.mock("@/models", () => storage);
vi.mock("@/lib/disabledModelsDb", () => storage);
const { GET } = await import("@/app/api/models/route.js");

beforeEach(() => {
  storage.getModelAliases.mockResolvedValue({});
  storage.getCustomModels.mockResolvedValue([]);
  storage.getDisabledModels.mockResolvedValue({});
});

describe("vendor billing provenance in the public dashboard catalog", () => {
  it("distinguishes every assigned product's quote status without advertising authenticated availability", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const { models } = await response.json();
    const cases = [
      ["deepseek", "deepseek-flash", "quote-verified"],
      ["alicode", "qwen3.7-plus", "subscription-unknown"],
      ["alicode-intl", "qwen3.7-plus", "subscription-unknown"],
      ["alitp-intl", "qwen3.8-max", "subscription-unknown"],
      ["alims-intl", "qwen3.8-max", "quote-verified"],
      ["glm", "glm-5.3", "subscription-unknown"],
      ["glm-cn", "glm-5.3", "subscription-unknown"],
      ["minimax", "MiniMax-M3", "quote-verified"],
      ["minimax-cn", "MiniMax-M3", "quote-verified"],
      ["kimi", "k3", "subscription-unknown"],
      ["xiaomi-mimo", "mimo-v2.6-pro", "quote-verified"],
      ["xiaomi-tokenplan", "mimo-v2.6-pro", "subscription-unknown"],
      ["cohere", "command-a-plus-05-2026", "unpublished"],
      ["qianfan", "ernie-5.1", "quote-verified"],
      ["mistral", "mistral-large-latest", "quote-verified"],
      ["ps", "poolside/laguna-s-2.1", "unpublished"],
      ["pplx", "sonar-pro", "unpublished"],
      ["pa", "perplexity/sonar", "quote-verified"],
      ["hunyuan", "hy3-preview", "unpublished"],
      ["ark", "DeepSeek-V4-Pro", "subscription-unknown"],
      ["bpm", "seed-2-0-pro-260328", "subscription-unknown"],
    ];
    for (const [provider, model, status] of cases) {
      const row = models.find(item => item.model === model && (item.provider === provider || item.routedModel === `${provider}/${model}`));
      expect(row, `${provider}/${model} must retain billing provenance`).toBeDefined();
      expect(row.metadata.billing).toMatchObject({ quoteStatus: status, reviewedAt: "2026-10-21", authenticatedRouteVerified: false });
    }
  });

  it("publishes unknown native output ceilings instead of reviving generic caps", async () => {
    const { models } = await (await GET()).json();
    const large = models.find(row => row.model === "mistral-large-4" && row.provider === "mistral");
    expect(large).toBeDefined();
    expect(large.caps).toMatchObject({ maxOutput: null, vision: true, reasoning: true });
    const plan = models.find(row => row.model === "deepseek-v4.1-flash-1017" && row.provider === "alitp-intl");
    expect(plan).toBeDefined();
    expect(plan.caps.maxOutput).toBeNull();
    expect(plan.metadata.pricing).toMatchObject({ input: null, output: null, cached: null });
  });

  it("exposes Qianfan's native CNY units without presenting them as USD token rates", async () => {
    const { models } = await (await GET()).json();
    const row = models.find(item => item.model === "glm-5.3" && item.routedModel === "qianfan/glm-5.3");
    expect(row.metadata.billing).toMatchObject({
      currency: "CNY", unit: "per_1000_tokens", quoteStatus: "quote-verified",
      nativeQuote: { input: 0.008, cached: 0.002, output: 0.028 },
    });
    expect(row.metadata.pricing).toMatchObject({ input: null, cached: null, output: null });
  });
});
