import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getPricingForModel as staticPrice, calculateCostFromTokens, calculateCostBreakdown } from "../../open-sse/providers/pricing.js";
import { PROVIDER_MODELS } from "../../open-sse/config/providerModels.js";

const mocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(), getCombos: vi.fn(), getCustomModels: vi.fn(),
  getModelAliases: vi.fn(), getDisabledModels: vi.fn(), live: vi.fn(),
  saved: {}, getAll: vi.fn(), write: vi.fn(() => { throw Error("Unexpected DB write"); }),
}));
vi.mock("@/lib/localDb", () => mocks);
vi.mock("@/lib/disabledModelsDb", () => mocks);
vi.mock("../../src/lib/db/helpers/kvStore.js", () => ({ makeKv: () => ({ getAll: mocks.getAll, clear: mocks.write }) }));
vi.mock("../../src/lib/db/driver.js", () => ({ getAdapter: mocks.write }));
vi.mock("@/sse/services/tokenRefresh", () => ({ updateProviderCredentials: mocks.write }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: vi.fn() }));
vi.mock("@/shared/utils/providerLiveModels", () => ({ fetchProviderLiveModels: mocks.live }));
vi.mock("open-sse/services/kiroModels.js", () => ({ resolveKiroModels: mocks.live }));
vi.mock("open-sse/services/kimchiModels.js", () => ({ resolveKimchiModels: mocks.live }));
vi.mock("open-sse/services/qoderModels.js", () => ({ resolveQoderModels: mocks.live }));
vi.mock("open-sse/services/copilotModels.js", () => ({ resolveCopilotModels: mocks.live }));
vi.mock("open-sse/services/clinepassModels.js", () => ({ resolveClinepassModels: mocks.live }));
vi.mock("open-sse/services/grokCliModels.js", () => ({ resolveGrokCliModels: mocks.live }));
vi.mock("open-sse/services/cursorModels.js", () => ({ resolveCursorModels: mocks.live }));
vi.mock("open-sse/shared/zedAuth.js", () => ({ resolveZedModels: mocks.live }));
const { buildModelsList } = await import("@/app/api/v1/models/route.js");

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.saved = {};
  mocks.getAll.mockImplementation(async () => mocks.saved);
  mocks.getProviderConnections.mockResolvedValue([{ provider: "openai" }]);
  mocks.getCombos.mockResolvedValue([]);
  mocks.getCustomModels.mockResolvedValue([]);
  mocks.getModelAliases.mockResolvedValue({});
  mocks.getDisabledModels.mockResolvedValue({});
  mocks.live.mockResolvedValue(null);
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("Unexpected network request"); }));
});
afterEach(() => { expect(mocks.write).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const connect = provider => mocks.getProviderConnections.mockResolvedValue([{ provider }]);

describe("review P2: saved reasoning tariff", () => {
  it.each([[undefined, 99], [0, 0], [7, 7]])("uses saved output unless reasoning is explicitly distinct (%s)", async (reasoning, expected) => {
    const model = "gpt-6-astra";
    mocks.saved = { openai: { [model]: { input: 9, output: 99, ...(reasoning === undefined ? {} : { reasoning }) } } };
    const before = structuredClone(mocks.saved);
    const repo = await import("../../src/lib/db/repos/pricingRepo.js");
    const pricing = await repo.getPricingForModel("openai", model);
    const tokens = { prompt_tokens: 1, completion_tokens: 1000000, reasoning_tokens: 1000000 };
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(expected + 9 / 1e6, 10);
    expect(calculateCostBreakdown(tokens, pricing)).toMatchObject({ reasoningCost: expected });
    expect(calculateCostBreakdown(tokens, pricing).totalCost).toBeCloseTo(expected + 9 / 1e6, 10);
    expect(pricing.reasoning).toBe(expected);
    expect((await repo.getPricing()).openai[model]).toEqual(pricing);
    expect(mocks.saved).toEqual(before);
  });
  it("retains a genuinely distinct static reasoning tariff", async () => {
    const model = "gpt-4";
    const base = staticPrice("openai", model);
    expect(base.reasoning).not.toBe(base.output);
    mocks.saved = { openai: { [model]: { output: 99 } } };
    const repo = await import("../../src/lib/db/repos/pricingRepo.js");
    const pricing = await repo.getPricingForModel("openai", model);
    expect(pricing.reasoning).toBe(base.reasoning);
    const tokens = { completion_tokens: 1000000, reasoning_tokens: 1000000 };
    expect(calculateCostFromTokens(tokens, pricing)).toBe(base.reasoning);
    expect(calculateCostBreakdown(tokens, pricing).reasoningCost).toBe(base.reasoning);
  });
});

describe("review P2: media service floors", () => {
  it.each([
    ["openai", "openai/whisper-1", "stt", "audioInput"],
    ["fal-ai", "fal/fal-ai/flux/schnell", "image", "imageOutput"],
    ["edge-tts", `edge-tts/${PROVIDER_MODELS["edge-tts"][0].id}`, "tts", "audioOutput"],
    ["openai", "openai/text-embedding-3-small", "embedding", "tools"],
  ])("does not assign chat defaults to %s %s", async (provider, id, kind, flag) => {
    connect(provider);
    const row = (await buildModelsList([kind])).find(m => m.id === id);
    expect(row).toBeDefined();
    expect(row.capabilities[flag]).toBe(flag !== "tools");
    expect(row.capabilities.tools).not.toBe(true);
    expect(Number.isFinite(row.capabilities.contextWindow)).toBe(false);
    expect(Number.isFinite(row.capabilities.maxOutput)).toBe(false);
  });
  it("keeps researched audio limits and live/custom per-kind facts", async () => {
    connect("gemini");
    const tts = (await buildModelsList(["tts"])).find(m => m.id === "gemini/gemini-3.8-flash-tts");
    expect(tts.capabilities).toMatchObject({ tools: false, audioOutput: true, maxInput: 8192, maxOutput: 16384 });
    mocks.getProviderConnections.mockResolvedValue([{ provider: "openai", apiKey: "offline-fixture" }]);
    mocks.live.mockResolvedValue([{ id: "whisper-1", kind: "stt", capabilities: { vision: true, maxInput: 123 } }]);
    mocks.getCustomModels.mockResolvedValue([{ providerAlias: "openai", id: "whisper-1", type: "stt", caps: { maxOutput: 456 } }]);
    const row = (await buildModelsList(["stt"])).find(m => m.id === "openai/whisper-1");
    expect(row.capabilities).toMatchObject({ audioInput: true, vision: true, maxInput: 123, maxOutput: 456 });
    expect((await buildModelsList(["imageToText"])).some(m => m.id === row.id)).toBe(false);
  });
});

describe("review P2: nonchat declaration overlays", () => {
  it.each([
    { vision: true },
    { vision: true, maxInput: 123 },
    { maxOutput: 456 },
  ])("does not fill undeclared whisper limits from chat defaults: %j", async caps => {
    mocks.getCustomModels.mockResolvedValue([{ providerAlias: "openai", id: "whisper-1", type: "stt", caps }]);
    const row = (await buildModelsList(["stt"])).find(m => m.id === "openai/whisper-1");
    expect(row).toBeDefined();
    expect(row.capabilities).toMatchObject({ audioInput: true, tools: false, ...caps });
    for (const key of ["contextWindow", "maxInput", "maxOutput"]) {
      if (!(key in caps)) expect(Number.isFinite(row.capabilities[key]), key).toBe(false);
    }
    expect(row).not.toHaveProperty("context_length");
    expect(row).not.toHaveProperty("max_completion_tokens");
    expect((await buildModelsList(["imageToText"])).some(m => m.id === row.id)).toBe(false);
  });

  it("keeps reviewed Gemini TTS limits when only a capability is overridden", async () => {
    connect("gemini");
    mocks.getCustomModels.mockResolvedValue([{ providerAlias: "gemini", id: "gemini-3.8-flash-tts", type: "tts", caps: { audioOutput: false } }]);
    const row = (await buildModelsList(["tts"])).find(m => m.id === "gemini/gemini-3.8-flash-tts");
    expect(row.capabilities).toMatchObject({ audioOutput: false, tools: false, maxInput: 8192, maxOutput: 16384 });
    expect(Number.isFinite(row.capabilities.contextWindow)).toBe(false);
  });

  it("preserves live numeric facts and explicit false operator declarations", async () => {
    mocks.getProviderConnections.mockResolvedValue([{ provider: "openai", apiKey: "mock-only" }]);
    mocks.live.mockResolvedValue([{ id: "whisper-1", kind: "stt", capabilities: { vision: true, audioInput: true, contextWindow: 789, maxInput: 123, maxOutput: 456 } }]);
    mocks.getCustomModels.mockResolvedValue([{ providerAlias: "openai", id: "whisper-1", type: "stt", caps: { vision: false, audioInput: false } }]);
    const row = (await buildModelsList(["stt"])).find(m => m.id === "openai/whisper-1");
    expect(row.capabilities).toMatchObject({ vision: false, audioInput: false, tools: false, contextWindow: 789, maxInput: 123, maxOutput: 456 });
    expect(mocks.live).toHaveBeenCalled();
  });

  it("honors top-level custom numeric limits without adding missing limits", async () => {
    mocks.getCustomModels.mockResolvedValue([{ providerAlias: "openai", id: "review-custom-stt", type: "stt", contextWindow: 321, maxOutputTokens: 654, caps: { vision: true, audioInput: false } }]);
    const row = (await buildModelsList(["stt"])).find(m => m.id === "openai/review-custom-stt");
    expect(row.capabilities).toMatchObject({ contextWindow: 321, maxOutput: 654, vision: true, audioInput: false, tools: false });
    expect(Number.isFinite(row.capabilities.maxInput)).toBe(false);
    expect((await buildModelsList(["imageToText"])).some(m => m.id === row.id)).toBe(false);
    expect((await buildModelsList(["llm"])).some(m => m.id === row.id)).toBe(false);
  });
});

describe("review P2: combo unknown limits", () => {
  const members = ["grok-cli/grok-build", "openai/gpt-6-astra"];
  it("omits inferred limits if any member's limits are unknown", async () => {
    // Both providers must be selectable: unconfigured providers are excluded
    // from the combo envelope rather than contributing an unknown limit.
    mocks.getProviderConnections.mockResolvedValue([{ provider: "openai" }, { provider: "grok-cli" }]);
    mocks.getCombos.mockResolvedValue([{ name: "review-mixed", models: members }]);
    const row = (await buildModelsList(["llm"])).find(m => m.id === "review-mixed");
    expect(row).not.toHaveProperty("context_length");
    expect(row).not.toHaveProperty("max_completion_tokens");
  });
  it("preserves explicit operator limits and the known-only minimum policy", async () => {
    const known = ["openai/gpt-6-astra", "openai/gpt-4.1"];
    mocks.getCombos.mockResolvedValue([
      { name: "review-explicit", models: members, contextWindow: 12345, maxOutput: 123 },
      { name: "review-known", models: known },
    ]);
    const rows = await buildModelsList(["llm"]);
    expect(rows.find(m => m.id === "review-explicit")).toMatchObject({ context_length: 12345, max_completion_tokens: 123 });
    const caps = known.map(id => getCapabilitiesForModel("openai", id.slice("openai/".length)));
    expect(rows.find(m => m.id === "review-known")).toMatchObject({ context_length: Math.min(...caps.map(c => c.contextWindow)), max_completion_tokens: Math.min(...caps.map(c => c.maxOutput)) });
  });
});

describe("review P2: Morph unknown token counts", () => {
  it.each(["morph-kimik3", "morph-glm53-744b", "morph-glm53flash", "morph-dsv41flash", "morph-dsv4flash"])("suppresses guessed limits for %s in capabilities and discovery", async id => {
    expect(getCapabilitiesForModel("morph", id)).toMatchObject({ contextWindow: null, maxOutput: null });
    connect("morph");
    const row = (await buildModelsList(["llm"])).find(m => m.id.endsWith(`/${id}`));
    expect(row).toBeDefined();
    expect(row.capabilities).toMatchObject({ contextWindow: null, maxOutput: null });
    expect(row.metadata.limits.contextWindowText).toBe("1M");
    expect(row).not.toHaveProperty("context_length");
    expect(row).not.toHaveProperty("max_completion_tokens");
  });
});
