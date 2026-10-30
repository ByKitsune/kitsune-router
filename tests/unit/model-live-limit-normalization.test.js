import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ body: {}, custom: [], provider: "openai", apiKey: "offline-fixture", accessToken: undefined,
  providerSpecificData: {}, requests: [], proxyOptions: null }));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: async (...args) => {
  fixture.requests.push(args);
  return Response.json(fixture.body);
} }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: async () => fixture.proxyOptions }));
vi.mock("@/lib/localDb", () => ({
  getProviderConnections: async () => [{ id: "public-catalog-fixture", provider: fixture.provider, apiKey: fixture.apiKey,
    accessToken: fixture.accessToken, providerSpecificData: fixture.providerSpecificData, isActive: true }],
  getCombos: async () => [], getCustomModels: async () => fixture.custom, getModelAliases: async () => ({}),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => ({}) }));
import { clearProviderLiveModelsCache, fetchProviderLiveModels } from "@/shared/utils/providerLiveModels.js";
import { buildModelsList } from "@/app/api/v1/models/route.js";
import { clearCodexModelsCache } from "open-sse/services/codexModels.js";
import { clearGoogleOAuthModelsCache } from "open-sse/services/googleOAuthModels.js";

beforeEach(() => {
  fixture.body = {}; fixture.custom = []; fixture.provider = "openai";
  fixture.apiKey = "offline-fixture"; fixture.accessToken = undefined;
  fixture.providerSpecificData = {}; fixture.requests = []; fixture.proxyOptions = null;
  clearProviderLiveModelsCache();
  clearCodexModelsCache();
  clearGoogleOAuthModelsCache();
});

describe("native live catalog fields reach effective public model metadata", () => {
  it.each([
    ["codex", "cx", "https://chatgpt.com", { models: [{ slug: "account-codex-next", context_window: 240000, max_output_tokens: 32000 }] }, "account-codex-next"],
    ["gemini-cli", "gc", "https://cloudcode-pa.googleapis.com", { models: { "account-gemini-next": { maxInputTokens: 240000, maxOutputTokens: 32000 } } }, "account-gemini-next"],
    ["antigravity", "ag", "https://daily-cloudcode-pa.googleapis.com", { models: { "account-antigravity-next": { maxInputTokens: 240000, maxOutputTokens: 32000 } } }, "account-antigravity-next"],
  ])("dispatches %s account discovery through its actual resolver and preserves the selected egress", async (provider, alias, origin, body, id) => {
    fixture.provider = provider; fixture.apiKey = undefined; fixture.accessToken = "synthetic-account-token";
    fixture.proxyOptions = { strictProxy: true, connectionProxyEnabled: true, connectionProxyUrl: "http://synthetic-relay.invalid" };
    fixture.providerSpecificData = { projectId: "synthetic-project", accountId: "synthetic-workspace" };
    fixture.body = structuredClone(body);
    const nativeRows = Array.isArray(fixture.body.models) ? fixture.body.models : Object.values(fixture.body.models);
    nativeRows[0].privateAccountProof = "private-model-metadata-must-not-leak";
    const rows = await buildModelsList(["llm"]);
    expect(rows.find(model => model.id === `${alias}/${id}`)).toBeDefined();
    expect(JSON.stringify(rows)).not.toContain("private-model-metadata-must-not-leak");
    expect(fixture.requests).toHaveLength(1);
    const [url, options, proxyOptions] = fixture.requests[0];
    expect(new URL(url).origin).toBe(origin);
    expect(options.headers.Authorization).toBe("Bearer synthetic-account-token");
    // A resolver may snapshot policy to keep a later caller mutation from
    // changing the selected egress; every actual policy field must survive.
    expect(proxyOptions).toEqual(fixture.proxyOptions);
    if (provider === "codex") {
      expect(options.headers["ChatGPT-Account-ID"]).toBe("synthetic-workspace");
      expect(options.headers["User-Agent"]).toMatch(/^codex_cli_rs\//);
      expect(rows.some(model => model.id === `cx/${id}-review`)).toBe(true);
    } else {
      expect(JSON.parse(options.body)).toEqual({ project: "synthetic-project" });
    }
  });

  it.each(["codex", "gemini-cli", "antigravity"])("never substitutes an API key for %s OAuth credentials", async provider => {
    fixture.provider = provider;
    await buildModelsList(["llm"]);
    expect(fixture.requests).toHaveLength(0);
  });

  it.each([
    ["codex", "cx", { models: [{ slug: "hidden-account-model", visibility: "hide" }] }],
    ["gemini-cli", "gc", { models: { "internal-account-model": { isInternal: true } } }],
    ["antigravity", "ag", { models: [] }],
  ])("keeps a complete empty %s catalog from resurrecting static account models", async (provider, alias, body) => {
    fixture.provider = provider; fixture.apiKey = undefined; fixture.accessToken = "synthetic-empty-account";
    fixture.body = body;
    const rows = await buildModelsList(["llm"]);
    expect(rows.filter(model => model.owned_by === alias)).toHaveLength(0);
    expect(fixture.requests).toHaveLength(1);
  });

  it.each([["codex", "cx"], ["gemini-cli", "gc"], ["antigravity", "ag"]])("retains %s static fallback when the response has no verified model-list shape", async (provider, alias) => {
    fixture.provider = provider; fixture.apiKey = undefined; fixture.accessToken = "synthetic-invalid-account";
    fixture.body = {};
    expect((await buildModelsList(["llm"])).some(model => model.owned_by === alias)).toBe(true);
  });

  it("keeps explicit Codex enabled-model choices authoritative over background account discovery", async () => {
    fixture.provider = "codex"; fixture.apiKey = undefined; fixture.accessToken = "synthetic-codex-proof";
    fixture.providerSpecificData = { enabledModels: ["gpt-6.1-sol"] };
    expect((await buildModelsList(["llm"])).some(model => model.id === "cx/gpt-6.1-sol")).toBe(true);
    expect(fixture.requests).toHaveLength(0);
  });
  it("publishes native Gemini chat and embedding IDs only under their supported service kinds", async () => {
    fixture.provider = "gemini";
    fixture.body = { models: [
      { name: "models/gemini-synthetic-next", inputTokenLimit: 900000, outputTokenLimit: 64000, supportedGenerationMethods: ["generateContent"] },
      { name: "models/opaque-synthetic-embedding", inputTokenLimit: 2048, supportedGenerationMethods: ["embedContent"] },
      { name: "models/imagen-synthetic-predict", supportedGenerationMethods: ["predict"] },
    ] };
    const chat = await buildModelsList(["llm"]);
    expect(chat.find(model => model.id === "gemini/gemini-synthetic-next")).toMatchObject({ max_input_tokens: 900000, max_completion_tokens: 64000 });
    expect(chat.some(model => /opaque-synthetic-embedding|imagen-synthetic-predict/.test(model.id))).toBe(false);
    const embeddings = await buildModelsList(["embedding"]);
    expect(embeddings.find(model => model.id === "gemini/opaque-synthetic-embedding")).toBeDefined();
    expect(embeddings.some(model => /models\/models\//.test(model.id))).toBe(false);
  });
  it("publishes the account-scoped Claude OAuth catalog through its separate credential profile", async () => {
    fixture.provider = "claude";
    fixture.apiKey = undefined;
    fixture.accessToken = "synthetic-claude-oauth-proof";
    fixture.body = { data: [{ id: "account-visible-claude-model", type: "model", max_input_tokens: 200000, max_tokens: 32000 }], has_more: false };
    const rows = await buildModelsList(["llm"]);
    expect(rows.find(model => model.id === "cc/account-visible-claude-model")).toMatchObject({ max_input_tokens: 200000, max_completion_tokens: 32000 });
    expect(rows.some(model => model.owned_by === "anthropic")).toBe(false);
  });
  it("publishes native Anthropic object records as LLMs with their actual typed limits and capabilities", async () => {
    fixture.provider = "anthropic";
    fixture.body = { data: [{ id: "opaque-anthropic-live-model", type: "model", display_name: "Live native model",
      max_input_tokens: 900000, max_tokens: 64000,
      capabilities: { image_input: { supported: false }, pdf_input: { supported: true }, thinking: { supported: true } },
    }], has_more: false };
    const row = (await buildModelsList(["llm"])).find(model => model.id === "anthropic/opaque-anthropic-live-model");
    expect(row).toMatchObject({ max_input_tokens: 900000, max_completion_tokens: 64000,
      capabilities: { maxInput: 900000, maxOutput: 64000, vision: false, pdf: true, reasoning: true } });
    expect(row).not.toHaveProperty("context_length");
  });
  it("preserves independent snake-case ceilings and explicit capability flags through the real live parser", async () => {
    fixture.body = { data: [{ id: "opaque-live-facts", context_window: 1050000, max_input_tokens: 922000, max_output_tokens: 128000,
      architecture: { input_modalities: ["text"] }, capabilities: { vision: false, reasoning: true, tools: false } }] };
    const row = (await buildModelsList(["llm"])).find(model => model.id === "openai/opaque-live-facts");
    expect(row).toMatchObject({ context_length: 1050000, max_input_tokens: 922000, max_completion_tokens: 128000,
      capabilities: { contextWindow: 1050000, maxInput: 922000, maxOutput: 128000, vision: false, reasoning: true, tools: false } });
  });

  it("does not relabel a per-request prompt ceiling as the total context window", async () => {
    fixture.body = { data: [{ id: "opaque-prompt-only", per_request_limits: { prompt_tokens: 480000, completion_tokens: 32000 } }] };
    const rows = await fetchProviderLiveModels("openai", "offline-fixture", { useCache: false });
    expect(rows[0].capabilities).toMatchObject({ maxInput: 480000, maxOutput: 32000 });
    expect(rows[0]).not.toHaveProperty("context_length");
    expect(rows[0].capabilities).not.toHaveProperty("contextWindow");
  });

  it("honors a complete text-only input declaration above a vision-looking model name", async () => {
    fixture.body = { data: [{ id: "opaque-vision-model", input_modalities: ["text"] }] };
    const row = (await buildModelsList(["llm"])).find(model => model.id === "openai/opaque-vision-model");
    expect(row.capabilities.vision).toBe(false);
    expect((await buildModelsList(["imageToText"])).some(model => model.id === row.id)).toBe(false);
  });

  it("retains explicit operator overrides above equivalent live fields", async () => {
    fixture.body = { data: [{ id: "opaque-operator-model", context_window: 1050000, max_input_tokens: 922000, max_output_tokens: 128000,
      capabilities: { vision: false } }] };
    fixture.custom = [{ providerAlias: "openai", id: "opaque-operator-model", caps: { contextWindow: 333333, maxInput: 222222, maxOutput: 11111, vision: true } }];
    const row = (await buildModelsList(["llm"])).find(model => model.id === "openai/opaque-operator-model");
    expect(row).toMatchObject({ context_length: 333333, max_input_tokens: 222222, max_completion_tokens: 11111, capabilities: { vision: true } });
  });
});
