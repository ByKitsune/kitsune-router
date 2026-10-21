import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getModelUpstreamId } from "../../open-sse/config/providerModels.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";

const db = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  getCombos: vi.fn(),
  getCustomModels: vi.fn(),
  getModelAliases: vi.fn(),
  getDisabledModels: vi.fn(),
  getProviderNodes: vi.fn(),
  getSettings: vi.fn(),
  getProxyPools: vi.fn(),
  validateApiKey: vi.fn(),
  updateProviderConnection: vi.fn(),
}));
vi.mock("@/lib/localDb", () => db);
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: db.getDisabledModels }));
vi.mock("@/sse/services/tokenRefresh", () => ({ updateProviderCredentials: vi.fn() }));
vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({})),
  pickProxyPoolId: vi.fn(),
}));

const { buildModelsList } = await import("@/app/api/v1/models/route.js");
const { getProviderCredentials } = await import("@/sse/services/auth.js");
const { getAntigravityQuotaCache } = await import("@/sse/services/antigravityQuota.js");

beforeEach(() => {
  vi.clearAllMocks();
  getAntigravityQuotaCache().clear();
  db.getProviderConnections.mockResolvedValue([{
    id: "ag-metadata-fixture", provider: "antigravity", isActive: true,
    accessToken: "synthetic-token", projectId: "synthetic-project",
  }]);
  db.getCombos.mockResolvedValue([]);
  db.getCustomModels.mockResolvedValue([]);
  db.getModelAliases.mockResolvedValue({});
  db.getDisabledModels.mockResolvedValue({});
  db.getProviderNodes.mockResolvedValue([]);
  db.getSettings.mockResolvedValue({});
  db.getProxyPools.mockResolvedValue([]);
});
afterEach(() => getAntigravityQuotaCache().clear());

// Expectations transcribed from the primary 2026-10-21 model table, not from
// registry/config constants. A missing tier overlay or a generic paid-plan
// assumption must fail at the public discovery boundary.
const planCases = [
  {
    models: ["gemini-4-argon", "gemini-4-argon-high", "gemini-4-argon-medium", "gemini-4-argon-low"],
    plans: { free: "unavailable", googleAiPlus: "unavailable", googleAiProTrial: "unavailable", googleAiProNonTrial: "available", googleAiUltra: "available", enterprise: "available" },
  },
  {
    models: ["gemini-3.8-flash-high", "gemini-3.8-flash-medium", "gemini-3.8-flash-low", "gemini-3.8-flash"],
    plans: { free: "available", googleAiPlus: "available", googleAiProTrial: "available", googleAiProNonTrial: "available", googleAiUltra: "available", enterprise: "available" },
  },
  {
    models: ["gemini-3.7-flash-high", "gemini-3.7-flash-medium", "gemini-3.7-flash-low", "gemini-3.6-flash-high", "gemini-3.6-flash-medium", "gemini-3.6-flash-low", "gemini-pro-agent", "gemini-3.1-pro-low"],
    plans: { free: "unavailable", googleAiPlus: "unavailable", googleAiProTrial: "unavailable", googleAiProNonTrial: "unavailable", googleAiUltra: "unavailable", enterprise: "available" },
  },
  {
    models: ["claude-sonnet-5-5-high", "claude-sonnet-5-5-medium", "claude-sonnet-5-5-low", "claude-sonnet-5-5", "claude-opus-5-5-high", "claude-opus-5-5-medium", "claude-opus-5-5-low", "claude-opus-5-5"],
    plans: { free: "unavailable", googleAiPlus: "unavailable", googleAiProTrial: "unavailable", googleAiProNonTrial: "available", googleAiUltra: "available", enterprise: "available" },
  },
  {
    models: ["claude-sonnet-4-6", "claude-opus-4-6-thinking"],
    plans: { free: "available", googleAiPlus: "available", googleAiProTrial: "available", googleAiProNonTrial: "available", googleAiUltra: "unavailable", enterprise: "unavailable" },
  },
  {
    models: ["gpt-oss-120b-medium"],
    plans: { free: "available", googleAiPlus: "available", googleAiProTrial: "available", googleAiProNonTrial: "available", googleAiUltra: "available", enterprise: "unavailable" },
  },
];

describe("reviewed Antigravity plan and surface facts", () => {
  it.each(planCases.flatMap(({ models, plans }) => models.map(model => ({ model, plans }))))(
    "publishes the documented plan restrictions for $model without deciding account eligibility",
    async ({ model, plans }) => {
      const row = (await buildModelsList(["llm"])).find(entry => entry.id === `ag/${model}`);
      expect(row?.metadata?.limits?.availability?.plans).toEqual(plans);
      expect(row.metadata.limits.availability).toMatchObject({
        asOf: "2026-10-21", enforcement: "metadata-only", accountEligibility: "unknown",
        missingPlan: "unknown", inferPlanFromQuota: false, role: "core-reasoning", coreChatSelectable: true,
      });
    },
  );

  it("keeps Argon's App, CLI and extensions distinct from standalone IDE availability", async () => {
    const row = (await buildModelsList(["llm"])).find(entry => entry.id === "ag/gemini-4-argon");
    expect(row?.metadata?.limits?.availability?.surfaces).toEqual({
      app: "available", cli: "available", ideExtensions: "available", standaloneIde: "unavailable",
    });
    // The table does not promise every other model on the standalone IDE.
    expect(getReviewedModelMetadata("ag", "gemini-3.8-flash")?.limits?.availability?.surfaces?.standaloneIde).toBe("unknown");
    expect(row.capabilities).toMatchObject({ contextWindow: 1048576, maxInput: null, maxOutput: 65536, vision: true, tools: true });
  });

  it.each([
    ["gemini-3.7-flash-low", "gemini-3.7-flash"],
    ["gemini-3.6-flash-high", "gemini-3.6-flash"],
    ["gemini-pro-agent", "gemini-3.1-pro-preview"],
    ["gemini-3.1-pro-low", "gemini-3.1-pro-preview"],
  ])("documents %s Enterprise IDs and licensing without implementing the Enterprise route", (model, apiModelId) => {
    expect(getReviewedModelMetadata("ag", model)?.limits?.availability?.enterprise).toMatchObject({
      apiModelId, apiModelIdKind: "literal", gatewayImplemented: false,
      accessModes: ["gemini-enterprise-standard-seat", "gemini-enterprise-plus-seat", "cloud-project-api"],
      requiresCloudProject: true, requiredIamRole: "roles/discoveryengine.agentspaceUser",
      aiDeveloperToolsAdminEnablement: "may-be-required", requiresThirdPartyModelOptIn: false,
      surfaces: { app: "available", cli: "available", ideExtensions: "available", standaloneIde: "unavailable" },
    });
  });

  it.each(["gemini-3.7-flash-low", "gemini-3.6-flash-high", "gemini-pro-agent"])(
    "does not imply standalone IDE support for Enterprise-only %s", model => {
      expect(getReviewedModelMetadata("ag", model)?.limits?.availability?.surfaces).toEqual({
        app: "available", cli: "available", ideExtensions: "available", standaloneIde: "unavailable",
      });
    },
  );

  it.each([
    ["claude-sonnet-5-5", "claude-sonnet-5-5-<level>", "claude-sonnet-5-5-high(high)"],
    ["claude-opus-5-5", "claude-opus-5-5-<level>", "claude-opus-5-5-high(high)"],
  ])("keeps %s administrator opt-in and Enterprise thinking IDs separate from the consumer wire", (model, apiModelId, consumerWire) => {
    expect(getReviewedModelMetadata("antigravity", model)?.limits?.availability?.enterprise).toMatchObject({
      apiModelId, apiModelIdKind: "thinking-level-template", gatewayImplemented: false,
      requiresThirdPartyModelOptIn: true, thinkingLevels: ["low", "medium", "high", "max"], defaultThinkingLevel: "medium",
    });
    expect(getModelUpstreamId("ag", model)).toBe(consumerWire);
  });

  it("does not replace a consumer bridge alias with the documented Enterprise identifier", () => {
    expect(getModelUpstreamId("ag", "gemini-3.7-flash-high")).toBe("gemini-3.7-flash-tiered(high)");
    expect(getModelUpstreamId("ag", "gemini-pro-agent")).toBe("gemini-pro-agent");
  });

  it.each(["claude-sonnet-4-6", "claude-opus-4-6-thinking", "gpt-oss-120b-medium"])(
    "exposes %s as scheduled for November 2, not already retired", async model => {
      const row = (await buildModelsList(["llm"])).find(entry => entry.id === `ag/${model}`);
      expect(row?.metadata?.limits?.lifecycle).toMatchObject({
        status: "scheduled-retirement", retirementDate: "2026-11-02", dateMeaning: "scheduled-shutdown",
        asOf: "2026-10-21", source: "https://antigravity.google/docs/models.md",
      });
      expect(row.metadata.limits.availability.gatewayObservation).toMatchObject({ httpStatus: 200, accountPlan: "unknown" });
    },
  );

  it.each([
    "gemini-4-argon", "gemini-4-argon-high", "gemini-4-argon-medium", "gemini-4-argon-low",
    "gemini-3.7-flash-high", "gemini-3.7-flash-medium", "gemini-3.7-flash-low",
    "gemini-3.6-flash-high", "gemini-3.6-flash-medium", "gemini-3.6-flash-low", "gemini-pro-agent", "gemini-3.1-pro-low",
    "claude-sonnet-5-5-high", "claude-sonnet-5-5-medium", "claude-sonnet-5-5-low", "claude-sonnet-5-5",
    "claude-opus-5-5-high", "claude-opus-5-5-medium", "claude-opus-5-5-low", "claude-opus-5-5",
  ])("does not turn a sampled upstream 404 for %s into retirement or a universal denial", model => {
    const limits = getReviewedModelMetadata("ag", model)?.limits;
    expect(limits?.availability?.gatewayObservation).toMatchObject({
      httpStatus: 404, accountPlan: "unknown", cause: "unresolved", provesRetirement: false,
      sourceRevision: "04c0bf77c3d0b287a438566e504d72b81e6e081b",
      evidenceSha256: "3fed9fed9601550b7ff0b1628e4c698d0d06b4b4ebf1bb0637346661bb87b154",
    });
    expect(limits.lifecycle.status).toBe("listed");
    expect(limits.routeAvailable).not.toBe(false);
  });

  it("preserves unknown plan facts for a working legacy model omitted from the plan table", async () => {
    const row = (await buildModelsList(["llm"])).find(entry => entry.id === "ag/gemini-3-flash");
    expect(row?.metadata?.limits?.availability?.plans).toEqual({
      free: "unknown", googleAiPlus: "unknown", googleAiProTrial: "unknown", googleAiProNonTrial: "unknown", googleAiUltra: "unknown", enterprise: "unknown",
    });
    expect(row.metadata.limits.lifecycle.status).toBe("unknown");
    expect(row.metadata.limits.availability).toMatchObject({ role: "legacy-chat", coreChatSelectable: null });
    expect(row.metadata.limits.availability.gatewayObservation).toMatchObject({ httpStatus: 200, accountPlan: "unknown" });
    expect(getCapabilitiesForModel("ag", "gemini-3-flash")).toMatchObject({ vision: true, tools: true });
    expect(getReviewedModelMetadata("ag", "some-future-model")).toBeNull();
    expect(getReviewedModelMetadata("gemini", "gemini-pro-agent")).toBeNull();
  });

  it("carries fresh hashed primary provenance to public model metadata", async () => {
    const row = (await buildModelsList(["llm"])).find(entry => entry.id === "ag/gemini-4-argon");
    expect(row?.metadata?.limits?.availability?.sourceEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: "https://antigravity.google/docs/models.md", status: 200, sha256: "e99908d9be1aeff50e5ad9fa37ce01633e147adad8b56fbbb83632de5f8bcf3a", retrievedAt: "2026-10-21T10:48:03.178598+00:00" }),
      expect.objectContaining({ url: "https://antigravity.google/docs/plans.md", status: 200, sha256: "b3962a073ffe885bfb11639013c6f11c339b247b105ebeff1f72ad2bf6ae8a2c", retrievedAt: "2026-10-21T10:48:03.404421+00:00" }),
      expect.objectContaining({ url: "https://antigravity.google/docs/enterprise.md", status: 200, sha256: "4f1c3bafe8d8e2ed842ab5a02a3aef00fdb7a2672653da649803d7b6e9ac5b41", retrievedAt: "2026-10-21T10:48:03.444071+00:00" }),
    ]));
  });

  it("exposes Nano Banana 2 as an image tool rather than a selectable reasoning model", async () => {
    const image = (await buildModelsList(["image"])).find(row => row.id === "ag/gemini-3.1-flash-image");
    expect(image?.metadata?.limits).toMatchObject({
      kind: "image", availability: { role: "generative-image-tool", coreChatSelectable: false, customizable: false, displayName: "Nano Banana 2", accountEligibility: "unknown" },
    });
    expect(image.capabilities).toMatchObject({ imageOutput: true, tools: false, reasoning: false });
    expect((await buildModelsList(["llm"])).some(row => row.id === "ag/gemini-3.1-flash-image")).toBe(false);
    expect(image.metadata.limits.availability.plans.free).toBe("unknown");
  });

  it.each(["gemini-4-argon", "gemini-pro-agent", "claude-opus-5-5"])(
    "does not skip a healthy %s account when the plan is missing, even with positive quota", async model => {
      getAntigravityQuotaCache().set("ag-metadata-fixture", { [model]: { remainingPercentage: 90 } });
      const selected = await getProviderCredentials("antigravity", null, model);
      expect(selected).toMatchObject({ connectionId: "ag-metadata-fixture", accessToken: "synthetic-token" });
      expect(getReviewedModelMetadata("ag", model)?.limits?.availability?.accountEligibility).toBe("unknown");
      expect(selected.providerSpecificData).not.toHaveProperty("plan");
      expect(selected._connection).not.toHaveProperty("plan");
    },
  );
});
