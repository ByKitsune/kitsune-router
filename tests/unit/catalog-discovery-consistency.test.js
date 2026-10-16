import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(), getCombos: vi.fn(), getCustomModels: vi.fn(),
  getModelAliases: vi.fn(), getDisabledModels: vi.fn(), live: vi.fn(),
}));
vi.mock("@/lib/localDb", () => mocks);
vi.mock("@/lib/disabledModelsDb", () => mocks);
vi.mock("@/sse/services/tokenRefresh", () => ({ updateProviderCredentials: vi.fn() }));
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
const { parseModel } = await import("open-sse/services/model.js");
const { PROVIDER_MODELS, PROVIDER_ID_TO_ALIAS, getModelUpstreamId } = await import("open-sse/config/providerModels.js");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProviderConnections.mockResolvedValue([]);
  mocks.getCombos.mockResolvedValue([]);
  mocks.getCustomModels.mockResolvedValue([]);
  mocks.getModelAliases.mockResolvedValue({});
  mocks.getDisabledModels.mockResolvedValue({});
  mocks.live.mockResolvedValue(null);
});

const connect = (provider, providerSpecificData = {}) => mocks.getProviderConnections.mockResolvedValue([{ provider, isActive: true, providerSpecificData }]);



it("retains custom maxInput independently from total context", async () => {
  connect("codex", { enabledModels: ["gpt-6.1-sol"] });
  mocks.getCustomModels.mockResolvedValue([{ providerAlias: "cx", id: "gpt-6.1-sol", caps: { maxInput: 222222, contextWindow: 333333 } }]);
  const row = (await buildModelsList(["llm"])).find(m => m.id === "cx/gpt-6.1-sol");
  expect(row.capabilities).toMatchObject({ maxInput: 222222, contextWindow: 333333 });
  expect(row.max_input_tokens).toBe(222222);
  expect(row.context_length).toBe(333333);
});
it.each([false, true])("scopes built-in cross-kind declarations (%s)", async reverse => {
  connect("gemini", { enabledModels: ["gemini-2.5-pro"] });
  const custom = [
    { providerAlias: "gemini", id: "gemini-2.5-pro", type: "llm", caps: { contextWindow: 11111 } },
    { providerAlias: "gemini", id: "gemini-2.5-pro", type: "stt", caps: { contextWindow: 22222 } },
  ];
  mocks.getCustomModels.mockResolvedValue(reverse ? custom.reverse() : custom);
  expect((await buildModelsList(["llm"])).find(m => m.id === "gemini/gemini-2.5-pro")?.capabilities.contextWindow).toBe(11111);
  expect((await buildModelsList(["stt"])).find(m => m.id === "gemini/gemini-2.5-pro")?.capabilities.contextWindow).toBe(22222);
});
it("applies custom vision false before vision filtering in the actual kind route", async () => {
  connect("anthropic");
  mocks.getCustomModels.mockResolvedValue([{ providerAlias: "anthropic", id: "claude-sonnet-4-6", caps: { vision: false } }]);
  const { GET } = await import("@/app/api/v1/models/[...model]/route.js");
  const { data } = await (await GET(null, { params: Promise.resolve({ model: ["image-to-text"] }) })).json();
  expect(data.some(m => m.id === "anthropic/claude-sonnet-4-6")).toBe(false);
});
it("preserves noAuth connection prefixes, whitelists, disabled lists and kind filters", async () => {
  const id = PROVIDER_MODELS["edge-tts"][0].id;
  connect("edge-tts", { prefix: "speech", enabledModels: [id] });
  expect((await buildModelsList(["tts"])).filter(m => m.owned_by === "speech").map(m => m.id)).toEqual([`speech/${id}`]);
  expect((await buildModelsList(["llm"])).some(m => m.owned_by === "speech")).toBe(false);
  mocks.getDisabledModels.mockResolvedValue({ "edge-tts": [id] });
  expect((await buildModelsList(["tts"])).some(m => m.owned_by === "speech")).toBe(false);
});


it("does not overlay another provider's custom declaration", async () => {
  connect("anthropic", { enabledModels: ["claude-sonnet-4-6"] });
  mocks.getCustomModels.mockResolvedValue([{ providerAlias: "openrouter", id: "claude-sonnet-4-6", caps: { vision: false, contextWindow: 1 } }]);
  const row = (await buildModelsList(["llm"])).find(m => m.id === "anthropic/claude-sonnet-4-6");
  expect(row.capabilities.vision).toBe(true);
  expect(row.capabilities.contextWindow).not.toBe(1);
});
it.each([{}, { architecture: { input_modalities: ["image"] } }])("merges untyped live media metadata without losing the service floor (%j)", async metadata => {
  mocks.getProviderConnections.mockResolvedValue([{ provider: "fal-ai", apiKey: "fixture" }]);
  mocks.live.mockResolvedValue([{ id: "fal-ai/flux/schnell", ...metadata }]);
  const row = (await buildModelsList(["image"])).find(m => m.id === "fal/fal-ai/flux/schnell");
  expect(row.capabilities.imageOutput).toBe(true);
  if (metadata.architecture) expect(row.capabilities.vision).toBe(true);
  expect((await buildModelsList(["imageToText"])).some(m => m.id === row.id)).toBe(false);
});


it("maps Zed's typed image/thinking/tool booleans without inventing capabilities", async () => {
  connect("zed");
  mocks.live.mockResolvedValue({ models: [{ id: "claude-sonnet-4-6", supportsImages: false, supportsThinking: false, supportsTools: false }] });
  const row = (await buildModelsList(["llm"])).find(m => m.id === "zd/claude-sonnet-4-6");
  expect(row.capabilities).toMatchObject({ vision: false, reasoning: false, tools: false });
});
it("applies imageToText declarations as chat-input overrides before vision filtering", async () => {
  connect("anthropic");
  mocks.getCustomModels.mockResolvedValue([{ providerAlias: "anthropic", id: "claude-sonnet-4-6", type: "imageToText", caps: { vision: false, contextWindow: 333333 } }]);
  expect((await buildModelsList(["llm"])).find(m => m.id === "anthropic/claude-sonnet-4-6").capabilities).toMatchObject({ vision: false, contextWindow: 333333 });
  expect((await buildModelsList(["imageToText"])).some(m => m.id === "anthropic/claude-sonnet-4-6")).toBe(false);
});

describe("catalog discovery identity", () => {
  it.each([
    ["poolside", "poolside/laguna-s-2.1", "llm"],
    ["nvidia", "nvidia/nemotron-3-ultra-550b-a55b", "llm"],
    ["fal-ai", "fal-ai/flux/schnell", "image"],
  ])("preserves %s native namespace through discovery, parsing and upstream lookup", async (provider, id, kind) => {
    const alias = PROVIDER_ID_TO_ALIAS[provider] || provider;
    const outputAlias = provider === "fal-ai" ? "fal" : provider === "poolside" ? "ps" : alias;
    expect(PROVIDER_MODELS[alias].some(m => m.id === id)).toBe(true);
    for (const enabledModels of [undefined, [id], [`${alias}/${id}`]]) {
      connect(provider, { enabledModels });
      const listed = await buildModelsList([kind]);
      const entry = listed.find(m => m.id === `${outputAlias}/${id}`);
      expect(entry).toBeDefined();
      const parsed = parseModel(entry.id);
      expect(parsed.model).toBe(id);
      expect(getModelUpstreamId(alias, parsed.model)).toBe(id);
    }
  });
  it("strips an actual configured routing prefix without altering vendor namespaces", async () => {
    connect("poolside", { prefix: "mine", enabledModels: ["mine/poolside/laguna-s-2.1"] });
    expect((await buildModelsList(["llm"])).some(m => m.id === "mine/poolside/laguna-s-2.1")).toBe(true);
  });
});


describe("catalog live and declared metadata", () => {
  it("publishes API versus CLI provenance and never restores guessed static limits", async () => {
    connect("codex", { enabledModels: ["gpt-6.1-sol"] });
    const sol = (await buildModelsList(["llm"])).find(m => m.id === "cx/gpt-6.1-sol");
    // The CLI ceiling stays recorded, but the published window is the API one:
    // the Codex route used to advertise 872000 while the backend accepted
    // 902,486 input tokens (true ceiling apiMaxInput 922,000).
    expect(sol.metadata.limits).toMatchObject({
      cliMaxContext: 872000, apiContextWindow: 1050000, apiMaxInput: 922000,
    });
    expect(sol.context_length).toBe(1050000);
    // maxOutput is now sourced (models.dev + live gateway), so it is published.
    expect(sol.max_completion_tokens).toBe(128000);
    // A provider whose output limit is genuinely unknown must stay unset — the
    // rule that "unknown is not a guess" still holds.
    connect("grok-cli", { enabledModels: ["grok-build"] });
    const grok = (await buildModelsList(["llm"])).find(m => m.id === "gcli/grok-build");
    expect(grok.capabilities.maxOutput).toBeNull();
    expect(grok).not.toHaveProperty("max_completion_tokens");
  });
  it.each(["qoder", "zed", "grok-cli", "kiro"])("retains %s typed live limits and explicit false", async provider => {
    connect(provider);
    mocks.live.mockResolvedValue({ models: [{ id: "claude-sonnet-4-6", contextLength: 123456, maxOutputTokens: 12345, supportsTools: false, capabilities: { vision: false } }] });
    const row = (await buildModelsList(["llm"])).find(m => m.id.endsWith("/claude-sonnet-4-6"));
    expect(row).toMatchObject({ context_length: 123456, max_completion_tokens: 12345, capabilities: { vision: false, reasoning: true } });
    if (provider === "zed") expect(row.capabilities.tools).toBe(false);
  });
  it("merges partial live metadata above static capabilities and custom last", async () => {
    mocks.getProviderConnections.mockResolvedValue([{ provider: "anthropic", apiKey: "fixture" }]);
    mocks.live.mockResolvedValue([{ id: "claude-sonnet-4-6", capabilities: { contextWindow: 900000 } }]);
    let row = (await buildModelsList(["llm"])).find(m => m.id === "anthropic/claude-sonnet-4-6");
    expect(row.capabilities).toMatchObject({ contextWindow: 900000, vision: true, reasoning: true });
    mocks.getCustomModels.mockResolvedValue([{ providerAlias: "anthropic", id: "claude-sonnet-4-6", caps: { vision: false, contextWindow: 333333 } }]);
    row = (await buildModelsList(["llm"])).find(m => m.id === "anthropic/claude-sonnet-4-6");
    expect(row.capabilities).toMatchObject({ contextWindow: 333333, vision: false, reasoning: true });
  });
  it.each([false, true])("preserves custom per-kind metadata in either declaration order (%s)", async reverse => {
    connect("gemini");
    const custom = [
      { providerAlias: "gemini", id: "fixture-shared", type: "llm", caps: { vision: false, contextWindow: 11111 } },
      { providerAlias: "gemini", id: "fixture-shared", type: "stt", caps: { vision: true, contextWindow: 22222 } },
    ];
    mocks.getCustomModels.mockResolvedValue(reverse ? custom.reverse() : custom);
    expect((await buildModelsList(["llm"])).find(m => m.id.endsWith("/fixture-shared"))?.capabilities).toMatchObject({ vision: false, contextWindow: 11111 });
    expect((await buildModelsList(["stt"])).find(m => m.id.endsWith("/fixture-shared"))?.capabilities).toMatchObject({ audioInput: true, contextWindow: 22222 });
  });
  it("applies built-in custom overrides without connections", async () => {
    mocks.getCustomModels.mockResolvedValue([{ providerAlias: "codex", id: "gpt-6.1-sol", caps: { vision: false, contextWindow: 333333 } }]);
    expect((await buildModelsList(["llm"])).find(m => m.id === "cx/gpt-6.1-sol")).toMatchObject({ context_length: 333333, capabilities: { vision: false } });
  });
  it("preserves service capability floors under architecture-only live rows", async () => {
    mocks.getProviderConnections.mockResolvedValue([{ provider: "openai", apiKey: "fixture" }]);
    mocks.live.mockResolvedValue([{ id: "whisper-1", kind: "stt", architecture: { input_modalities: ["image"] } }]);
    expect((await buildModelsList(["stt"])).find(m => m.id === "openai/whisper-1")?.capabilities).toMatchObject({ audioInput: true, vision: true });
  });
  it("retains both intentional Gemini chat and STT kinds in a whitelist", async () => {
    // Uses gemini-2.5-flash rather than the retired gemini-2.5-pro: same
    // chat+STT id collision, and verified live with HTTP 200.
    connect("gemini", { enabledModels: ["gemini-2.5-flash"] });
    for (const kind of ["llm", "stt"]) expect((await buildModelsList([kind])).some(m => m.id === "gemini/gemini-2.5-flash")).toBe(true);
  });

  it("does not advertise a retired Gemini model in either kind", async () => {
    // gemini-2.5-pro answers 404 "is no longer available" on both routes, so
    // neither the chat nor the STT list may offer it.
    connect("gemini", { enabledModels: ["gemini-2.5-pro"] });
    for (const kind of ["llm", "stt"]) {
      expect((await buildModelsList([kind])).some(m => m.id === "gemini/gemini-2.5-pro"), kind).toBe(false);
    }
  });
  it.each([[[]], [[{ provider: "openai" }]]])("lists noAuth independently of unrelated connections (%j)", async connections => {
    mocks.getProviderConnections.mockResolvedValue(connections);
    const ids = (await buildModelsList(["tts"])).map(m => m.id);
    expect(ids).toContain(`edge-tts/${PROVIDER_MODELS["edge-tts"][0].id}`);
    expect(ids).toContain("coqui/tts_models/en/ljspeech/tacotron2-DDC");
    expect((await buildModelsList(["webSearch"])).some(m => m.id === "searxng/search")).toBe(true);
    mocks.getDisabledModels.mockResolvedValue({ searxng: ["search"], "edge-tts": [PROVIDER_MODELS["edge-tts"][0].id] });
    expect((await buildModelsList(["webSearch"])).some(m => m.id === "searxng/search")).toBe(false);
    expect((await buildModelsList(["tts"])).some(m => m.id === `edge-tts/${PROVIDER_MODELS["edge-tts"][0].id}`)).toBe(false);
  });
});
