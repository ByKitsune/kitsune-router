import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: (...args) => state.fetch(...args) }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}), saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { getDefaultModel, isValidModel } from "../../open-sse/config/providerModels.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { getPricingForModel } from "../../open-sse/providers/pricing.js";

// Official v1.19.5 English endpoint tables, pinned to810c0eba. These fixtures
// verify declared transport behavior without contacting the hosted service.
const free = ["cat-jam-free", "step-5-preview-free", "exo-free", "mimo-v2.5-free", "ling-3.0-flash-fin-free", "nemotron-3-ultra-free", "nemotron-3.5-lightning-free"];
const go = [
  ["grok-4.6", "responses"], ["gpt-5.6-luna", "responses"],
  ["claude-haiku-5-5", "messages"], ["longcat-2.0", "chat/completions"],
  ["step-5-preview-free", "chat/completions"],
  ["muse-spark-1.3-contributor", "responses"], ["muse-spark-1.2-contributor", "responses"],
  ["hy4-preview", "chat/completions"], ["hy3", "chat/completions"], ["space-bunny", "chat/completions"],
];
const rows = [...free.map(model => ["opencode", "oc", model, "chat/completions"]), ...go.map(([model, path]) => ["opencode-go", "opencode-go", model, path])];

beforeEach(() => {
  state.fetch.mockReset();
  state.fetch.mockImplementation(async (url) => {
    const data = String(url).endsWith("/messages")
      ? { id: "msg_fixture", type: "message", role: "assistant", model: "fixture", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }
      : String(url).endsWith("/responses")
        ? { id: "resp_fixture", object: "response", status: "completed", model: "fixture", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
        : { id: "chatcmpl_fixture", object: "chat.completion", model: "fixture", choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
    return Response.json(data);
  });
});

describe("documented OpenCode routes through real request preparation and executors", () => {
  it.each(rows)("serializes %s/%s %s to its exact %s lane", async (provider, alias, model, path) => {
    expect(isValidModel(alias, model)).toBe(true);
    const result = await handleChatCore({
      body: { model: `${alias}/${model}`, messages: [{ role: "user", content: "fixture" }], max_tokens: 16, stream: false },
      modelInfo: { provider, model }, credentials: provider === "opencode" ? {} : { apiKey: "synthetic-key" },
      sourceFormatOverride: "openai", connectionId: "synthetic-opencode-route", log: { debug() {}, info() {}, warn() {} },
    });
    expect(result.success).toBe(true);
    expect(state.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = state.fetch.mock.calls[0];
    const base = provider === "opencode" ? "https://opencode.ai/zen/v1" : "https://opencode.ai/zen/go/v1";
    expect(url).toBe(`${base}/${path}`);
    const body = JSON.parse(options.body);
    expect(body.model).toBe(model);
    expect(body.max_tokens ?? body.max_output_tokens).toBe(16);
    expect(body).not.toHaveProperty("allow_training");
    const headers = new Headers(options.headers);
    if (provider === "opencode-go") {
      expect(headers.get(path === "messages" ? "x-api-key" : "authorization")).toBe(path === "messages" ? "synthetic-key" : "Bearer synthetic-key");
    }
    const metadata = getReviewedModelMetadata(provider, model);
    expect(metadata.limits).toMatchObject({ scope: "publisher-documented-hosted-route", authenticatedRouteVerified: false });
    expect(metadata.capabilities).toMatchObject({ contextWindow: null, maxInput: null, maxOutput: null });
    const quote = getPricingForModel(provider, model);
    expect(quote?.input ?? null).toBe(provider === "opencode" ? 0 : null);
    expect(quote?.output ?? null).toBe(provider === "opencode" ? 0 : null);
  });

  it("retains existing hosted IDs absent from one doc table and does not invent SystemOne support", () => {
    expect(getDefaultModel("oc")).toBe("muse-spark-1.2-contributor-free");
    expect(getDefaultModel("opencode-go")).toBe("glm-5.3-flash");
    expect(isValidModel("oc", "fledge-alpha-free")).toBe(true);
    expect(isValidModel("opencode-go", "kimi-k3.1-pro")).toBe(true);
    expect(isValidModel("oc", "jev-1.13-free")).toBe(false);
  });
});
