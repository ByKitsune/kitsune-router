import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../open-sse/executors/index.js", () => ({ getExecutor: () => ({ noAuth: true, execute: mocks.execute }) }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: vi.fn(async () => undefined) }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest: vi.fn(), logRawRequest: vi.fn(), logTargetRequest: vi.fn(),
  logProviderResponse: vi.fn(), logConvertedResponse: vi.fn(), logError: vi.fn(),
}) }));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
const reply = {
  id: "budget_precedence", object: "chat.completion", model: "gpt-5.4",
  choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};
const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

async function dispatch(body, providerThinking) {
  const result = await handleChatCore({
    body: { model: "gpt-5.4", messages: [{ role: "user", content: "Reply briefly." }], stream: false, ...body },
    modelInfo: { provider: "openai", model: "gpt-5.4" },
    sourceFormatOverride: "openai", credentials: {}, providerThinking, log,
  });
  expect(result.success).toBe(true);
  return mocks.execute.mock.calls.at(-1)[0].body;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockImplementation(async ({ body }) => ({ response: Response.json(reply), transformedBody: body, headers: {}, url: "https://fixture.invalid/chat" }));
});

describe("explicit reasoning intent before provider defaults", () => {
  it.each([
    [{ reasoning: { effort: "low" } }, "low"],
    [{ output_config: { effort: "low" } }, "low"],
    [{ thinking: { type: "disabled" } }, "none"],
    [{ generationConfig: { thinkingConfig: { thinkingBudget: 1024 } } }, "low"],
  ])("does not replace the client's existing dialect: %j", async (body, effort) => {
    const sent = await dispatch({ ...body, max_completion_tokens: 1000 }, { mode: "high" });
    expect(sent.reasoning_effort).toBe(effort);
    expect(sent.max_completion_tokens).toBe(1000);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("still supplies the provider's default when the caller has no reasoning control", async () => {
    const sent = await dispatch({ max_completion_tokens: 1000 }, { mode: "high" });
    expect(sent.reasoning_effort).toBe("high");
    expect(sent.max_completion_tokens).toBe(1000);
  });
});
