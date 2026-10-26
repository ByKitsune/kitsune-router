import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../open-sse/executors/index.js", () => ({
  getExecutor: () => ({ noAuth: true, execute }),
}));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({
  getDeclaredModelCaps: vi.fn(async () => undefined),
}));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";
import { handleComboChat } from "../../open-sse/services/combo.js";

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
const model = "claude-sonnet-5-5";
const message = {
  id: "msg_budget", type: "message", role: "assistant", model,
  content: [{ type: "thinking", thinking: "Still calculating." }],
  stop_reason: "max_tokens", stop_sequence: null,
  usage: { input_tokens: 12, output_tokens: 16 },
};

async function completion(content = message.content) {
  execute.mockResolvedValueOnce({
    response: Response.json({ ...message, content }),
    url: "https://api.anthropic.com/v1/messages",
    headers: {}, transformedBody: null,
  });
  return handleChatCore({
    body: { model, max_tokens: 16, stream: false, messages: [{ role: "user", content: "Calculate." }] },
    modelInfo: { provider: "claude", model },
    credentials: { apiKey: "test-key", providerSpecificData: {} },
    sourceFormatOverride: "claude", connectionId: "budget-test", log,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("request-scoped output budget exhaustion", () => {
  it.each(["openai", "claude"])("rejects an impossible %s thinking budget before contacting upstream", async (sourceFormat) => {
    const result = await handleChatCore({
      body: {
        model: "claude-sonnet-4.5", stream: false,
        messages: [{ role: "user", content: "Calculate." }],
        ...(sourceFormat === "openai" ? { max_completion_tokens: 1 } : { max_tokens: 1024 }),
        thinking: { type: "enabled", budget_tokens: 2048 },
      },
      modelInfo: { provider: "claude", model: "claude-sonnet-4.5" },
      credentials: { apiKey: "test-key", providerSpecificData: {} },
      sourceFormatOverride: sourceFormat, log,
    });
    expect(result.status).toBe(400);
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toMatchObject({ error: { type: "invalid_request_error" } });
    expect(execute).not.toHaveBeenCalled();
  });

  it("reports the exhausted budget instead of provider unavailability", async () => {
    const result = await completion();
    expect(result.status).toBe(400);
    expect(await result.response.json()).toMatchObject({ error: {
      type: "invalid_request_error", code: "output_budget_exhausted", param: "max_tokens",
    } });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(checkFallbackError(result.status, result.error)).toMatchObject({ shouldFallback: true, cooldownMs: 0 });
  });

  it("lets a combo try another model without a quota cooldown", async () => {
    const exhausted = await completion();
    const answer = Response.json({ ...message, content: [{ type: "text", text: "The answer." }], stop_reason: "end_turn" });
    const handleSingleModel = vi.fn().mockResolvedValueOnce(exhausted.response).mockResolvedValueOnce(answer);
    const result = await handleComboChat({
      body: { messages: [{ role: "user", content: "Calculate." }] },
      models: ["cc/claude-sonnet-5-5", "cc/claude-opus-5-5"], handleSingleModel,
      log, comboName: "budget-combo", comboStrategy: "fallback",
    });
    expect(result.status).toBe(200);
    expect((await result.json()).content).toEqual([{ type: "text", text: "The answer." }]);
    expect(handleSingleModel).toHaveBeenCalledTimes(2);
  });

  it("returns partial text with the original max_tokens stop reason", async () => {
    const result = await completion([{ type: "text", text: "Partial answer" }]);
    expect(result.success).toBe(true);
    expect(await result.response.json()).toMatchObject({ content: [{ type: "text", text: "Partial answer" }], stop_reason: "max_tokens" });
  });
});
