import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  getProviderConnections: vi.fn(), getCombos: vi.fn(), getCustomModels: vi.fn(),
  getModelAliases: vi.fn(), getDisabledModels: vi.fn(), getProviderNodes: vi.fn(),
  setModelAlias: vi.fn(),
}));
vi.mock("@/lib/localDb", () => db);
vi.mock("@/models", () => db);
vi.mock("@/lib/disabledModelsDb", () => db);
vi.mock("@/sse/services/tokenRefresh", () => ({ updateProviderCredentials: vi.fn() }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: vi.fn() }));
vi.mock("@/shared/utils/providerLiveModels", () => ({ fetchProviderLiveModels: vi.fn() }));

import { buildModelsList } from "@/app/api/v1/models/route.js";
import { GET as getModel } from "@/app/api/v1/models/[...model]/route.js";
import { GET as getInfo } from "@/app/api/v1/models/info/route.js";
import { GET as getDashboardModels } from "@/app/api/models/route.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { getReviewedModelMetadata, getPublicModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { getModelInfoCore } from "../../open-sse/services/model.js";
import { getModelUpstreamId, isValidModel } from "../../open-sse/config/providerModels.js";
import { calculateCostFromTokens, getPricingForModel, resolveEffectivePricing } from "../../open-sse/providers/pricing.js";

const rejected = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex-spark"];
const connect = (provider, providerSpecificData = {}) => db.getProviderConnections.mockResolvedValue([
  { provider, isActive: true, providerSpecificData },
]);
const rowFor = async (id, kinds = ["llm"]) => (await buildModelsList(kinds)).find(row => row.id === id);

beforeEach(() => {
  vi.clearAllMocks();
  db.getProviderConnections.mockResolvedValue([]);
  db.getCombos.mockResolvedValue([]);
  db.getCustomModels.mockResolvedValue([]);
  db.getModelAliases.mockResolvedValue({});
  db.getDisabledModels.mockResolvedValue({});
  db.getProviderNodes.mockResolvedValue([]);
});

describe("public route availability is separate from saved resolution", () => {
  it.each([false, true])("filters rejected built-ins and review aliases even from configured whitelists (configured=%s)", async configured => {
    const ids = rejected.flatMap(id => [id, `${id}-review`]);
    if (configured) connect("codex", { prefix: "mine", enabledModels: ids.map(id => `mine/${id}`) });
    db.getModelAliases.mockResolvedValue({ saved: "cx/gpt-5.4-review" });
    const rows = await buildModelsList(["llm"]);
    for (const id of ids) expect(rows.some(row => row.id === `${configured ? "mine" : "cx"}/${id}`), id).toBe(false);
    expect(await getModelInfoCore("saved", { saved: "cx/gpt-5.4-review" }))
      .toEqual({ provider: "codex", model: "gpt-5.4-review" });
    expect(getModelUpstreamId("cx", "gpt-5.4-review")).toBe("gpt-5.4");
    expect(isValidModel("cx", "gpt-5.4-review")).toBe(true);
  });

  it("preserves a deliberate custom chat declaration without treating a different kind as permission", async () => {
    connect("codex", { enabledModels: ["gpt-5.4", "gpt-5.4-mini"] });
    db.getCustomModels.mockResolvedValue([
      { providerAlias: "cx", id: "gpt-5.4", kind: "llm", caps: { tools: true, contextWindow: 321000 } },
      { providerAlias: "cx", id: "gpt-5.4-mini", kind: "stt" },
    ]);
    expect(await rowFor("cx/gpt-5.4")).toMatchObject({ context_length: 321000, capabilities: { tools: true } });
    expect(await rowFor("cx/gpt-5.4-mini")).toBeUndefined();
  });

  it("applies the same rejection filter to single-model and info discovery", async () => {
    const single = await getModel(null, { params: Promise.resolve({ model: ["cx", "gpt-5.4-review"] }) });
    expect(single.status).toBe(404);
    expect((await single.json()).error).toMatchObject({ code: "model_not_found", request_id: expect.any(String) });
    const info = await getInfo(new Request("http://localhost/v1/models/info?id=cx/gpt-5.4-review"));
    expect(info.status).toBe(404);
  });

  it("does not infer global unavailability from sampled Antigravity account 404s", async () => {
    connect("antigravity");
    expect(await rowFor("ag/gemini-4-argon")).toBeDefined();
    expect(await rowFor("ag/claude-opus-5-5")).toBeDefined();
  });

  it("filters model deprecation without hiding provider-level risk notices or deliberate custom rows", async () => {
    connect("deepseek");
    expect(await rowFor("ds/deepseek-v4-flash")).toBeUndefined();
    db.getCustomModels.mockResolvedValue([{ providerAlias: "deepseek", id: "deepseek-v4-flash", type: "llm", caps: { tools: true } }]);
    expect(await rowFor("ds/deepseek-v4-flash")).toMatchObject({ capabilities: { tools: true } });
    connect("codex");
    expect(await rowFor("cx/gpt-6-astra")).toBeDefined();
  });
});

describe("route-scoped capabilities and actionable constraints", () => {
  it.each(["claude-sonnet-4-6", "claude-opus-5-5-low"])("keeps Antigravity %s PDF disabled under explicit operator overrides", async model => {
    connect("antigravity", { enabledModels: [model] });
    db.getCustomModels.mockResolvedValue([{ providerAlias: "ag", id: model, caps: { pdf: true } }]);
    expect((await rowFor(`ag/${model}`)).capabilities.pdf).toBe(false);
    const response = await getInfo(new Request(`http://localhost/v1/models/info?id=ag/${model}`));
    expect((await response.json()).capabilities.pdf).toBe(false);
  });

  it.each(["gpt-reserve", "gpt-reserve-review"])("advertises owner-verified function tools on cx/%s without inventing reasoning or limits", async model => {
    connect("codex", { enabledModels: [model] });
    const row = await rowFor(`cx/${model}`);
    expect(row.capabilities).toMatchObject({ tools: true, reasoning: false, pdf: false, maxInput: null });
    expect(row).not.toHaveProperty("max_input_tokens");
    expect(row.metadata.limits.maxInputStatus).toMatch(/unknown|not.*verified/i);
  });

  it.each(["gpt-6.1-sol", "gpt-6.1-sol-review", "gpt-6.1-sol[1m]"])("publishes the actual Codex %s effort set", model => {
    expect(getCapabilitiesForModel("cx", model)).toMatchObject({
      thinkingEffortSupported: true, thinkingCanDisable: false,
      thinkingEfforts: ["low", "medium", "high", "xhigh", "max"],
    });
  });

  it.each(["gpt-6-luna", "gpt-6-luna-review", "gpt-5.6-luna", "gpt-5.6-luna-review"])("does not offer upstream-rejected Ultra on cx/%s discovery", async model => {
    connect("codex", { enabledModels: [model] });
    const row = await rowFor(`cx/${model}`);
    expect(row.capabilities.thinkingEfforts).toEqual(["none", "low", "medium", "high", "xhigh", "max"]);
    expect(row.metadata.limits.routeReasoningEfforts).not.toContain("ultra");
    expect(getThinkingLevels("cx", model)).not.toContain("ultra");
  });

  it.each(["gpt-6-sol"])("keeps %s disabled thinking requestable independently of Sol 6.1 restrictions", model => {
    expect(getCapabilitiesForModel("cx", model)).toMatchObject({ thinkingCanDisable: true, thinkingEfforts: expect.arrayContaining(["none", "low", "high", "max"]) });
  });

  it("keeps Argon vision, effort support and independent input unknowns consistent", async () => {
    connect("antigravity", { enabledModels: ["gemini-4-argon", "gemini-4-argon-high"] });
    const base = await rowFor("ag/gemini-4-argon");
    expect(base.capabilities).toMatchObject({ vision: true, thinkingEffortSupported: true, thinkingEfforts: ["low", "medium", "high"], maxInput: null });
    expect(base.metadata.limits.maxInputStatus).toMatch(/independent|separate/i);
    expect(base).not.toHaveProperty("max_input_tokens");
    expect((await rowFor("ag/gemini-4-argon-high")).capabilities)
      .toMatchObject({ thinkingEfforts: ["high"], fixedThinkingEffort: "high" });
  });

  it("publishes the conditional Claude bridge budget requirement, not a universal minimum output", async () => {
    connect("antigravity", { enabledModels: ["claude-sonnet-4-6", "claude-sonnet-5-5"] });
    const budget = await rowFor("ag/claude-sonnet-4-6");
    expect(budget.capabilities).toMatchObject({ reasoning: true, thinkingFormat: "gemini-budget", thinkingRange: { min: 1024 }, thinkingEffortSupported: false });
    expect(budget.metadata.limits.thinkingBudgetConstraints).toMatchObject({ outputCapMustExceedSelectedBudget: true, appliesWhen: "enabled-numeric-thinking" });
    expect(budget.metadata.limits).not.toHaveProperty("minOutput");
    expect(getThinkingLevels("ag", "claude-sonnet-4-6")).toEqual([]);
    expect((await rowFor("ag/claude-sonnet-5-5")).capabilities)
      .toMatchObject({ thinkingEfforts: ["high"], fixedThinkingEffort: "high", thinkingCanDisable: false });
  });

  it("distinguishes Antigravity dedicated grounding from unsupported inline chat search", async () => {
    connect("antigravity", { enabledModels: ["gemini-4-argon"] });
    const model = await rowFor("ag/gemini-4-argon");
    expect(model.capabilities.search).toBe(false);
    expect(model.metadata.limits.search).toMatchObject({
      inlineChat: false,
      dedicated: { endpoint: "/v1/search", provider: "ag" },
    });
    expect(await rowFor("ag/search", ["webSearch"])).toMatchObject({ kind: "webSearch" });
    const info = await getInfo(new Request("http://localhost/v1/models/info?id=ag/search"));
    expect(await info.json()).toMatchObject({ endpoint: "/v1/search", kind: "webSearch" });
  });

  it("explains Codex prompt/cache accounting without a fabricated constant offset", async () => {
    connect("codex", { enabledModels: ["gpt-6.1-sol"] });
    const row = await rowFor("cx/gpt-6.1-sol");
    expect(row.metadata.limits.promptAccounting).toMatchObject({
      defaultInstructions: "injected-when-absent-or-empty", upstreamInputIncludesInstructions: true,
      cachedInputMayIncludeSharedPrefix: true, firstRequestCacheHitPossible: true,
    });
    expect(row.metadata.limits.promptAccounting).not.toHaveProperty("instructionTokens");
  });

  it("removes the stale tools-require-none restriction from API and copied Codex facts", async () => {
    for (const provider of ["openai", "cx"]) {
      for (const model of ["gpt-6-sol", "gpt-6-luna"]) {
        expect(getPublicModelMetadata(provider, model).limits).not.toHaveProperty("toolCallingNote");
      }
    }
  });
});

describe("public metadata does not export audit internals or ambiguous billing", () => {
  it("strips local paths, build members and hashes recursively while the authenticated dashboard retains audit evidence", async () => {
    for (const [provider, id] of [["codex", "gpt-6.1-sol-review"], ["antigravity", "gemini-4-argon"], ["codebuddy-cn", "glm-5.3-flashx"]]) {
      connect(provider, { enabledModels: [id] });
      const row = (await buildModelsList(["llm"])).find(candidate => candidate.id.endsWith(`/${id}`));
      const serialized = JSON.stringify(row.metadata);
      expect(serialized).not.toMatch(/\/(?:tmp|root|home|opt|var)\//);
      expect(serialized).not.toMatch(/\b[a-f0-9]{32,64}\b/i);
      expect(serialized).not.toMatch(/provenance|sourceEvidence|cliBundle|bundleMember|evidenceSha256/);
    }
    const { models } = await (await getDashboardModels()).json();
    const dashboard = models.find(row => row.provider === "cx" && row.model === "gpt-6.1-sol");
    expect(dashboard.metadata.limits.cliBundle.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(getReviewedModelMetadata("cx", "gpt-6.1-sol").provenance).toBeDefined();
  });

  it("retains API USD references and subscription credits as separate labeled representations", async () => {
    connect("codex", { enabledModels: ["gpt-6.1-sol"] });
    const { metadata } = await rowFor("cx/gpt-6.1-sol");
    expect(metadata.billing).toMatchObject({ kind: "api-reference", currency: "USD", planPricing: { currency: "credits", input: 50, output: 250 } });
    expect(metadata.pricing).toMatchObject({ input: 2, output: 10, cache_write_30m: 2.5, cache_write_12h: 5, tier: { threshold: 272000, inclusive: false } });
    expect(metadata.pricing).not.toHaveProperty("cache_creation");
    expect(resolveEffectivePricing(metadata.pricing, 272000).input).toBe(2);
    expect(resolveEffectivePricing(metadata.pricing, 272001).input).toBe(4);
    const anthropic = getPublicModelMetadata("anthropic", "claude-sonnet-5-5");
    expect(anthropic.pricing).toMatchObject({ cache_creation: 2.5, cache_creation_1h: 4 });
    expect(anthropic.pricing).not.toHaveProperty("cache_write_30m");
  });

  it.each(["gemini-4-argon", "gemini-3.8-flash", "claude-sonnet-5-5", "claude-opus-5-5-low"])("does not fill ag/%s subscription tariffs from an unrelated public API", async model => {
    connect("antigravity", { enabledModels: [model] });
    const row = await rowFor(`ag/${model}`);
    expect(row.metadata.billing).toMatchObject({ kind: "plan", currency: "unknown", unit: "subscription" });
    expect(row.metadata.pricing).toMatchObject({ input: null, output: null, cached: null, cache_creation: null, cache_creation_1h: null, cache_write_30m: null, cache_write_12h: null });
    expect(calculateCostFromTokens({ prompt_tokens: 100000, completion_tokens: 1000 }, getPricingForModel("ag", model))).toBeNull();
    expect(row.metadata).not.toHaveProperty("publicAPI");
  });
});
