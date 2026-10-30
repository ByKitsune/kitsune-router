import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  getProviderConnections: vi.fn(), getCombos: vi.fn(), getCustomModels: vi.fn(),
  getModelAliases: vi.fn(), getDisabledModels: vi.fn(), live: vi.fn(),
}));
vi.mock("@/lib/localDb", () => db);
vi.mock("@/lib/disabledModelsDb", () => db);
vi.mock("@/sse/services/tokenRefresh", () => ({ updateProviderCredentials: vi.fn() }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: vi.fn() }));
vi.mock("open-sse/services/copilotModels.js", () => ({ resolveCopilotModels: db.live }));

const { buildModelsList } = await import("@/app/api/v1/models/route.js");

// Publisher retirement dates are explicit, not inferred from a missing model:
// github/docs@6167b6d08e8548a411a2ab1e0f3627fe6f89aaec:
// data/tables/copilot/model-deprecation-history.yml (2026-10-31).
const retired = [
  "gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5-mini", "claude-opus-4.7",
  "gemini-3.6-flash", "gemini-3.7-flash", "oswe-vscode-prime",
];

beforeEach(() => {
  vi.clearAllMocks();
  db.getProviderConnections.mockResolvedValue([{ id: "copilot-fixture", provider: "github", isActive: true }]);
  db.getCombos.mockResolvedValue([]);
  db.getCustomModels.mockResolvedValue([]);
  db.getModelAliases.mockResolvedValue({});
  db.getDisabledModels.mockResolvedValue({});
  db.live.mockResolvedValue(null);
});

describe("Copilot fallback discovery follows explicit publisher retirements", () => {
  it("does not advertise retired fallback IDs while retaining current LTS and model rows", async () => {
    const ids = (await buildModelsList(["llm"])).map(model => model.id);
    for (const id of retired) expect(ids, id).not.toContain(`gh/${id}`);
    for (const id of ["gpt-5.3-codex", "gpt-5.6-luna", "claude-haiku-4.5", "claude-opus-4.8", "kimi-k3"]) {
      expect(ids, id).toContain(`gh/${id}`);
    }
  });

  it("keeps single-model discovery and stored explicit route identity consistent", async () => {
    const { GET } = await import("@/app/api/v1/models/[...model]/route.js");
    const response = await GET(null, { params: Promise.resolve({ model: ["gh", "gpt-5.5"] }) });
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("model_not_found");
    const { getModelInfoCore } = await import("../../open-sse/services/model.js");
    expect(await getModelInfoCore("gh/gpt-5.5")).toEqual({ provider: "github", model: "gpt-5.5" });
  });

  it("prefers fresh authenticated account discovery over a static retirement assumption", async () => {
    db.live.mockResolvedValue({ models: [
      { id: "fixture-new-account-model", name: "Fixture account model" },
      { id: "gpt-5.5", name: "Account-authorized legacy route" },
    ] });
    const ids = (await buildModelsList(["llm"])).filter(model => model.owned_by === "gh").map(model => model.id);
    expect(ids).toEqual(["gh/fixture-new-account-model", "gh/gpt-5.5"]);
    expect(ids).not.toContain("gh/gpt-5.6-luna");
  });

  it("retains explicit operator model declarations and other providers' same-named products", async () => {
    db.getProviderConnections.mockResolvedValue([
      { id: "copilot-fixture", provider: "github", isActive: true },
      { id: "native-fixture", provider: "openai", isActive: true },
    ]);
    db.getCustomModels.mockResolvedValue([{ providerAlias: "gh", id: "gpt-5.5", type: "llm" }]);
    const ids = (await buildModelsList(["llm"])).map(model => model.id);
    expect(ids).toContain("gh/gpt-5.5");
    expect(ids).toContain("openai/gpt-5.5");
  });
});
