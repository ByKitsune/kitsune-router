import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  getCombos: vi.fn(),
  getCustomModels: vi.fn(),
  getModelAliases: vi.fn(),
  getDisabledModels: vi.fn(),
}));
vi.mock("@/lib/localDb", () => db);
vi.mock("@/lib/disabledModelsDb", () => db);
vi.mock("@/sse/services/tokenRefresh", () => ({ updateProviderCredentials: vi.fn() }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: vi.fn() }));

const { buildModelsList } = await import("@/app/api/v1/models/route.js");

beforeEach(() => {
  vi.clearAllMocks();
  db.getProviderConnections.mockResolvedValue([{ id: "ag-fixture", provider: "antigravity", isActive: true }]);
  db.getCombos.mockResolvedValue([]);
  db.getCustomModels.mockResolvedValue([]);
  db.getModelAliases.mockResolvedValue({});
  db.getDisabledModels.mockResolvedValue({});
});

describe("Antigravity retirement discovery", () => {
  it.each(["claude-sonnet-4-6", "claude-opus-4-6-thinking", "gpt-oss-120b-medium"])("publishes %s scheduled removal without hiding it early", async model => {
    const row = (await buildModelsList(["llm"])).find(entry => entry.id === `ag/${model}`);
    expect(row).toBeDefined();
    expect(row.metadata?.limits?.lifecycle).toMatchObject({
      status: "scheduled-retirement",
      retirementDate: "2026-11-02",
      dateMeaning: "scheduled-shutdown",
      source: "https://antigravity.google/docs/models.md",
    });
  });

  it("keeps current, account-restricted and separately served legacy models discoverable", async () => {
    const ids = (await buildModelsList(["llm"])).map(row => row.id);
    for (const model of [
      "gemini-3.8-flash", "gemini-3.8-flash-low", "gemini-4-argon",
      "gemini-4-argon-high", "gemini-3.7-flash-low", "gemini-3.6-flash-low",
      "gemini-pro-agent", "gemini-3.1-pro-low", "claude-sonnet-5-5", "claude-opus-5-5",
      "gemini-3-flash",
    ]) expect(ids).toContain(`ag/${model}`);
  });

  it("does not resurrect a retired alias from an enabled-model list or custom output prefix", async () => {
    db.getProviderConnections.mockResolvedValue([{
      id: "ag-fixture", provider: "antigravity", isActive: true,
      providerSpecificData: { prefix: "my-ag", enabledModels: ["my-ag/gemini-3-flash-agent", "my-ag/gemini-3-flash"] },
    }]);
    const ids = (await buildModelsList(["llm"])).map(row => row.id);
    expect(ids).not.toContain("my-ag/gemini-3-flash-agent");
    expect(ids).toContain("my-ag/gemini-3-flash");
  });

  it("preserves an operator's explicit custom declaration of a compatibility alias", async () => {
    db.getCustomModels.mockResolvedValue([{ providerAlias: "ag", id: "gemini-3-flash-agent", type: "llm" }]);
    expect((await buildModelsList(["llm"])).some(row => row.id === "ag/gemini-3-flash-agent")).toBe(true);
  });

  it("keeps retired alias resolution intact for stored requests and combos", async () => {
    const { getModelUpstreamId } = await import("open-sse/config/providerModels.js");
    expect(getModelUpstreamId("ag", "gemini-3.5-flash-high")).toBe("gemini-3-flash-agent");
    expect(getModelUpstreamId("ag", "gemini-3-flash-agent")).toBe("gemini-3-flash-agent");
    expect(getModelUpstreamId("ag", "gemini-3-flash")).toBe("gemini-3-flash");
  });

  it("keeps single-model and vision discovery consistent with the filtered catalog", async () => {
    const { GET } = await import("@/app/api/v1/models/[...model]/route.js");
    const retired = await GET(null, { params: Promise.resolve({ model: ["ag", "gemini-3-flash-agent"] }) });
    expect(retired.status).toBe(404);
    expect((await retired.json()).error.code).toBe("model_not_found");
    const legacy = await GET(null, { params: Promise.resolve({ model: ["ag", "gemini-3-flash"] }) });
    expect(legacy.status).toBe(200);
    const { data } = await (await GET(null, { params: Promise.resolve({ model: ["image-to-text"] }) })).json();
    expect(data.some(row => row.id === "ag/gemini-3-flash-agent")).toBe(false);
    expect(data.some(row => row.id === "ag/gemini-3.8-flash-low")).toBe(true);
  });

  it("does not advertise the four aliases whose upstream returns a retirement notice instead of inference", async () => {
    const ids = (await buildModelsList(["llm"])).map(row => row.id);
    for (const model of [
      "ag/gemini-3.5-flash-high",
      "ag/gemini-3-flash-agent",
      "ag/gemini-3.5-flash-low",
      "ag/gemini-3.5-flash-extra-low",
    ]) {
      expect(ids, model).not.toContain(model);
    }
  });
});
