import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  getCombos: vi.fn(),
  getCustomModels: vi.fn(),
  getModelAliases: vi.fn(),
  getDisabledModels: vi.fn(),
  getProviderNodes: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: mocks.getProviderConnections,
  getCombos: mocks.getCombos,
  getCustomModels: mocks.getCustomModels,
  getModelAliases: mocks.getModelAliases,
  getProviderNodes: mocks.getProviderNodes,
}));

vi.mock("@/lib/disabledModelsDb", () => ({
  getDisabledModels: mocks.getDisabledModels,
}));

const { buildModelsList } = await import("../../src/app/api/v1/models/route.js");

const MILLION_MEMBER = "ocg/deepseek-v4.1-flash";

async function comboEntry(name, models, kind = null) {
  mocks.getCombos.mockResolvedValue([{ id: `id-${name}`, name, kind, models }]);
  const list = await buildModelsList(kind ? [kind] : ["llm"]);
  return list.find((m) => m.id === name);
}

function activeConnection(provider, enabledModels, extra = {}) {
  return {
    id: `synthetic-${provider}`, provider, authType: "apikey", apiKey: "synthetic-only",
    isActive: true, providerSpecificData: { enabledModels }, ...extra,
  };
}

describe("combo entries expose token limits (#3486, #4096)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderConnections.mockResolvedValue([]);
    mocks.getCustomModels.mockResolvedValue([]);
    mocks.getModelAliases.mockResolvedValue({});
    mocks.getDisabledModels.mockResolvedValue({});
    mocks.getProviderNodes.mockResolvedValue([]);
  });

  it("emits the effective context window of the combo", async () => {
    const combo = await comboEntry("all-million", [MILLION_MEMBER]);

    expect(combo).toBeTruthy();
    expect(combo.owned_by).toBe("combo");
    expect(combo.context_length).toBe(1_000_000);
  });


  it("accepts member objects as well as plain string ids", async () => {
    const combo = await comboEntry("object-members", [
      { model: MILLION_MEMBER },
    ]);

    expect(combo.context_length).toBe(1_000_000);
  });

  it("keeps web combos free of llm token limits", async () => {
    const combo = await comboEntry("web-search-mix", [MILLION_MEMBER], "webSearch");

    expect(combo.kind).toBe("webSearch");
    expect(combo.context_length).toBeUndefined();
  });

  it("excludes permanently inactive and unconfigured providers from an active combo envelope", async () => {
    mocks.getProviderConnections.mockResolvedValue([
      activeConnection("opencode-go", ["deepseek-v4.1-flash"]),
      activeConnection("openai", ["gpt-4o-mini"], { isActive: false }),
    ]);
    const combo = await comboEntry("active-only", [
      "openai/gpt-4o-mini", "ghost/does-not-exist", MILLION_MEMBER,
    ]);
    expect(combo).toMatchObject({ context_length: 1_000_000, max_completion_tokens: 384_000 });
  });

  it("keeps the conservative minimum and operator limits among selectable members", async () => {
    mocks.getProviderConnections.mockResolvedValue([
      activeConnection("opencode-go", ["deepseek-v4.1-flash"]),
      activeConnection("openai", ["gpt-4o-mini"]),
    ]);
    mocks.getCustomModels.mockResolvedValue([{
      providerAlias: "openai", id: "gpt-4o-mini", kind: "llm",
      caps: { contextWindow: 64_000, maxOutput: 4_000 },
    }]);
    const combo = await comboEntry("active-minimum", ["openai/gpt-4o-mini", MILLION_MEMBER]);
    expect(combo).toMatchObject({ context_length: 64_000, max_completion_tokens: 4_000 });
  });

  it("retains credential-free members and their declared limits in a connected pool", async () => {
    mocks.getProviderConnections.mockResolvedValue([activeConnection("opencode-go", ["deepseek-v4.1-flash"])]);
    mocks.getCustomModels.mockResolvedValue([{
      providerAlias: "oc", id: "muse-spark-1.3-contributor-free", kind: "llm",
      caps: { contextWindow: 96_000, maxOutput: 8_000 },
    }]);
    const combo = await comboEntry("with-public", [MILLION_MEMBER, "oc/muse-spark-1.3-contributor-free"]);
    expect(combo).toMatchObject({ context_length: 96_000, max_completion_tokens: 8_000 });
  });

  it("resolves active compatible prefixes instead of treating them as unconfigured providers", async () => {
    const provider = "openai-compatible-chat-synthetic";
    mocks.getProviderConnections.mockResolvedValue([
      activeConnection("opencode-go", ["deepseek-v4.1-flash"]),
      activeConnection(provider, ["custom-model"], {
        providerSpecificData: { prefix: "custom-route", enabledModels: ["custom-model"] },
      }),
    ]);
    mocks.getProviderNodes.mockResolvedValue([{ id: provider, prefix: "custom-route", type: "openai-compatible" }]);
    mocks.getCustomModels.mockResolvedValue([{
      providerAlias: "custom-route", id: "custom-model", kind: "llm",
      caps: { contextWindow: 48_000, maxOutput: 3_000 },
    }]);
    const combo = await comboEntry("with-compatible", ["custom-route/custom-model", MILLION_MEMBER]);
    expect(combo).toMatchObject({ context_length: 48_000, max_completion_tokens: 3_000 });
  });

  it("expands nested combos and saved model aliases before aggregating limits", async () => {
    mocks.getProviderConnections.mockResolvedValue([activeConnection("opencode-go", ["deepseek-v4.1-flash"])]);
    mocks.getModelAliases.mockResolvedValue({ friendly: MILLION_MEMBER });
    mocks.getCombos.mockResolvedValue([
      { name: "inner", models: ["friendly"] },
      { name: "outer", models: ["inner", MILLION_MEMBER] },
    ]);
    const list = await buildModelsList(["llm"]);
    expect(list.find((model) => model.id === "outer")).toMatchObject({
      context_length: 1_000_000, max_completion_tokens: 384_000,
    });
  });

  it("does not restore the full private catalog when all configured accounts are disabled", async () => {
    mocks.getProviderConnections.mockResolvedValue([activeConnection("openai", ["gpt-4o-mini"], { isActive: false })]);
    mocks.getCombos.mockResolvedValue([{ name: "disabled-only", models: ["openai/gpt-4o-mini"] }]);
    const list = await buildModelsList(["llm"]);
    expect(list.some((model) => model.id === "openai/gpt-4o-mini")).toBe(false);
    const combo = list.find((model) => model.id === "disabled-only");
    expect(combo).toMatchObject({ owned_by: "combo" });
    expect(combo.context_length).toBeUndefined();
    expect(combo.max_completion_tokens).toBeUndefined();
    expect(list.some((model) => model.id.startsWith("oc/"))).toBe(true);
  });

  it("leaves cyclic envelopes unknown without inventing a generic context allowance", async () => {
    mocks.getProviderConnections.mockResolvedValue([activeConnection("opencode-go", ["deepseek-v4.1-flash"])]);
    const combo = await comboEntry("recursive", ["recursive", MILLION_MEMBER]);
    expect(combo.context_length).toBeUndefined();
    expect(combo.max_completion_tokens).toBeUndefined();
  });

  it("preserves explicit operator combo limits even when its providers are inactive", async () => {
    mocks.getProviderConnections.mockResolvedValue([activeConnection("openai", ["gpt-4o-mini"], { isActive: false })]);
    mocks.getCombos.mockResolvedValue([{
      name: "declared", models: ["openai/gpt-4o-mini"], contextWindow: 64_000, maxOutput: 4_000,
    }]);
    const list = await buildModelsList(["llm"]);
    expect(list.find((model) => model.id === "declared")).toMatchObject({
      context_length: 64_000, max_completion_tokens: 4_000,
    });
  });
});
