import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCapabilitiesForModel, setCatalogSource } from "../../open-sse/providers/capabilities.js";
import { PROVIDER_MODELS } from "../../open-sse/providers/index.js";

const fixture = vi.hoisted(() => ({ customModels: [] }));
vi.mock("@/lib/localDb", () => ({
  getProviderConnections: async () => [],
  getCombos: async () => [],
  getCustomModels: async () => fixture.customModels,
  getModelAliases: async () => ({}),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => ({}) }));
const { buildModelsList } = await import("@/app/api/v1/models/route.js");

beforeEach(() => { fixture.customModels = []; setCatalogSource(null); });
afterEach(() => setCatalogSource(null));

// Literal expectations from the complete 2026-10-17 models.dev snapshot,
// except endpoint-specific Google/Anthropic facts cited in the cases below.
// Different providers deliberately publish different limits for the same weights.
describe("October registry metadata reaches effective consumers", () => {
  it("advertises native Argon with the REST single-request ceiling, not long-decode capacity", async () => {
    // https://ai.google.dev/gemini-api/docs/generate-content/long-decode
    // REST generateContent: 32,768; streamGenerateContent: 65,536; further
    // output requires continuation hops that this gateway does not implement.
    const model = (await buildModelsList(["llm"])).find(m => m.id === "gemini/gemini-4-argon");
    expect(model).toMatchObject({
      context_length: 1048576,
      max_completion_tokens: 32768,
      capabilities: { vision: true, reasoning: true, tools: true, pdf: true, audioInput: true, videoInput: true },
      metadata: { limits: { streamMaxOutput: 65536, longDecodeMaxOutput: 1048576, continuationImplemented: false } },
    });
    expect(model).not.toHaveProperty("max_input_tokens");
    expect(PROVIDER_MODELS.gc.some(m => m.id === "gemini-4-argon")).toBe(false);
    expect(PROVIDER_MODELS.ag.some(m => m.id === "gemini-4-argon")).toBe(false);
  });

  it("advertises native Haiku 5.5 with adaptive thinking and independent unknown input", async () => {
    // https://platform.claude.com/docs/en/models/haiku-5-5/overview.md
    const model = (await buildModelsList(["llm"])).find(m => m.id === "anthropic/claude-haiku-5-5");
    expect(model).toMatchObject({
      context_length: 1000000, max_completion_tokens: 128000,
      capabilities: { vision: true, tools: true, reasoning: true, thinkingFormat: "claude-adaptive" },
      metadata: { limits: { maxOutputScope: "Synchronous Messages API", batchMaxOutput: 300000 } },
    });
    expect(model).not.toHaveProperty("max_input_tokens");
    expect(PROVIDER_MODELS.cc.some(m => m.id === "claude-haiku-5-5")).toBe(false);
  });

  it("keeps GPT-6.1 Sol context, input and output separate while surfacing sourced description", async () => {
    const model = (await buildModelsList(["llm"])).find(m => m.id === "openai/gpt-6.1-sol");
    expect(model).toMatchObject({
      context_length: 1050000, max_input_tokens: 922000, max_completion_tokens: 128000,
      metadata: { description: expect.stringContaining("complex coding") },
    });
  });

  it.each([
    ["cerebras", "qwen-3.8-27b", { contextWindow: 131072, maxOutput: 40960, vision: true }],
    ["chutes", "Qwen/Qwen3-32B-TEE", { contextWindow: 40960, maxOutput: 40960 }],
    ["cloudflare-ai", "@cf/meta/llama-3.2-1b-instruct", { contextWindow: 60000, maxOutput: 60000, tools: false }],
    ["cohere", "command-a-vision-07-2025", { vision: true, tools: false }],
    ["groq", "qwen/qwen3.8-27b", { contextWindow: 131042, maxOutput: 16384, videoInput: false }],
    ["github", "gpt-5-mini", { contextWindow: 264000, maxInput: 128000, maxOutput: 64000 }],
    ["kimi", "k3", { contextWindow: 1048576, maxOutput: null }],
    ["morph", "morph-v3-fast", { contextWindow: 16000, maxOutput: 16000, tools: false }],
    ["sambanova", "DeepSeek-V3.2", { contextWindow: 32768, maxOutput: 7168 }],
    ["siliconflow", "openai/gpt-oss-120b", { contextWindow: 131000, maxOutput: 8000 }],
    ["together", "MiniMaxAI/MiniMax-M3", { contextWindow: 524288, maxOutput: 250000 }],
    ["venice", "hermes-3-llama-3.1-405b", { tools: false, maxOutput: 16384 }],
    ["alicode-intl", "glm-5", { contextWindow: 202752, maxOutput: 16384 }],
  ])("uses exact %s/%s route facts instead of generic family guesses", (provider, model, expected) => {
    expect(getCapabilitiesForModel(provider, model)).toMatchObject(expected);
  });

  it("does not turn embedding dimensions into context or completion tokens", async () => {
    // https://ai.google.dev/gemini-api/docs/models/gemini-embedding-001
    const model = (await buildModelsList(["embedding"])).find(m => m.id === "gemini/gemini-embedding-001");
    expect(model).toMatchObject({
      capabilities: { maxInput: 2048, contextWindow: null, maxOutput: null, tools: false, reasoning: false },
      metadata: { limits: { outputDimensions: { min: 128, max: 3072, recommended: [768, 1536, 3072] } } },
    });
    expect(model).not.toHaveProperty("context_length");
    expect(model).not.toHaveProperty("max_completion_tokens");
  });

  it("removes confirmed Anthropic API retirements while retaining scheduled OpenAI rows", async () => {
    // Claude API retirement is not proof of retirement on Claude Code or a reseller.
    // OpenAI's 2026-10-23 schedule is still in the future on this snapshot date.
    const models = (await buildModelsList(["llm"])).map(m => m.id);
    for (const id of ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-3-5-sonnet-20241022"]) {
      expect(models).not.toContain(`anthropic/${id}`);
    }
    for (const id of ["gpt-4-turbo", "gpt-4.1-nano", "o3-mini", "o4-mini", "o1", "o1-pro"]) {
      expect(models).toContain(`openai/${id}`);
    }
    expect(models).not.toContain("openai/o1-mini");
    expect(models).toContain("gemini/gemini-2.5-pro");
  });

  it("does not advertise coding-plan IDs excluded by the provider's exhaustive allowlist", async () => {
    // Both exact Coding Plan routes list six supported model versions, not
    // the broader pay-as-you-go vendor catalog.
    const models = (await buildModelsList(["llm"])).map(m => m.id);
    for (const provider of ["alicode", "alicode-intl"]) {
      for (const id of ["qwen3-max-2026-01-23", "qwen3-coder-next", "qwen3-coder-plus", "glm-4.7"]) {
        expect(models).not.toContain(`${provider}/${id}`);
      }
      for (const id of ["qwen3.7-plus", "qwen3.6-plus", "kimi-k2.5", "glm-5", "MiniMax-M2.5", "qwen3.5-plus"]) {
        expect(models).toContain(`${provider}/${id}`);
      }
    }
  });

  it.each([
    ["minimax", "MiniMax-M3", { contextWindow: 1000000, maxOutput: null }],
    ["minimax-cn", "MiniMax-M2.5", { contextWindow: 204800, maxOutput: null }],
    ["alitp-intl", "qwen3.8-max", { maxInput: null, maxOutput: null }],
    ["alims-intl", "qwen3.8-max", { maxOutput: null }],
    ["poolside", "poolside/laguna-xs-2.1", { contextWindow: null, maxOutput: null }],
  ])("preserves primary-documented unknown limits for %s/%s", (provider, model, expected) => {
    expect(getCapabilitiesForModel(provider, model)).toMatchObject(expected);
  });

  it("uses primary Ministral 3B vision and 256K context over the stale catalog value", () => {
    // https://docs.mistral.ai/models/ministral-3-3b-25-12.md
    // Official weights' config corroborates 262144 max_position_embeddings.
    expect(getCapabilitiesForModel("mistral", "ministral-3b-2512")).toMatchObject({ contextWindow: 262144, vision: true });
  });

  it.each([
    ["deepseek", "deepseek-flash", { maxOutput: 393216 }],
    ["deepseek", "deepseek-v4-pro", { maxOutput: 393216 }],
    ["deepseek", "deepseek-v4-pro-max", { maxOutput: 393216 }],
    ["deepseek", "deepseek-v4-pro-none", { maxOutput: 393216 }],
    ["deepseek", "deepseek-v4-flash", { maxOutput: 393216 }],
    ["nvidia", "minimaxai/minimax-m2.7", { contextWindow: 204800, maxOutput: 131072, thinkingFormat: "openai" }],
    ["nvidia", "z-ai/glm-5.2", { contextWindow: 1000000, maxOutput: 32768, thinkingFormat: "openai" }],
    ["nvidia", "deepseek-ai/deepseek-v4-pro", { contextWindow: 1048576, maxOutput: 16384, thinkingFormat: "openai" }],
    ["nvidia", "deepseek-ai/deepseek-v4-flash", { contextWindow: 1048576, maxOutput: 16384, thinkingFormat: "openai" }],
    ["vertex-partner", "deepseek-ai/deepseek-v3.2-maas", { contextWindow: 163840, maxOutput: 65536, reasoning: false, structuredOutput: true }],
    ["vertex-partner", "zai-org/glm-5-maas", { contextWindow: 200000, maxOutput: 128000, reasoning: false, structuredOutput: true }],
    ["poolside", "poolside/laguna-s-2.1", { contextWindow: 1048576, maxOutput: null }],
  ])("uses reviewed endpoint ceilings for %s/%s without decimal rounding", (provider, model, expected) => {
    // DeepSeek /api/create-chat-completion: 384K means exactly 393216.
    // NVIDIA /nim/reference/*-infer schemas: route max_tokens, not vendor output.
    // Google /models/maas pages: exact global quotas and unsupported thinking.
    // Poolside official Laguna-S-2.1 config.json: 1048576 positions; output unknown.
    expect(getCapabilitiesForModel(provider, model)).toMatchObject(expected);
  });

  it("keeps explicit operator overrides above newly reviewed static facts", async () => {
    fixture.customModels = [{ providerAlias: "gemini", id: "gemini-4-argon", type: "llm", caps: { vision: false, maxOutput: 12000 } }];
    const model = (await buildModelsList(["llm"])).find(m => m.id === "gemini/gemini-4-argon");
    expect(model).toMatchObject({ max_completion_tokens: 12000, capabilities: { vision: false } });
  });

  it("does not overwrite route-specific negatives and limits with vendor catalog values", () => {
    expect(getCapabilitiesForModel("antigravity", "claude-sonnet-4-6")).toMatchObject({ contextWindow: 250000, maxOutput: 64000, pdf: false });
    // NVIDIA's exact M3 inference schema caps max_tokens at 16384.
    expect(getCapabilitiesForModel("nvidia", "minimaxai/minimax-m3")).toMatchObject({ contextWindow: 1000000, maxOutput: 16384, thinkingFormat: "openai" });
    expect(getCapabilitiesForModel("gemini", "gemini-embedding-2")).toMatchObject({ vision: false, pdf: false, contextWindow: null, maxInput: 8192, maxOutput: null });
    expect(getCapabilitiesForModel("xai", "grok-4.7").maxOutput).toBeNull();
  });
});
