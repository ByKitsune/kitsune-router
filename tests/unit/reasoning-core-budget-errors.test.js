import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), translate: vi.fn(), native: vi.fn() }));
vi.mock("../../open-sse/executors/index.js", () => ({ getExecutor: () => ({ noAuth: true, execute: mocks.execute }) }));
vi.mock("../../open-sse/translator/index.js", async (original) => ({ ...await original(), translateRequest: mocks.translate }));
vi.mock("../../open-sse/translator/formats/claude.js", async (original) => ({ ...await original(), normalizeClaudePassthrough: mocks.native }));
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
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";

const options = () => ({
  body: { model: "claude-sonnet-4-5", messages: [{ role: "user", content: "Reply briefly." }], max_tokens: 1000, stream: false },
  modelInfo: { provider: "claude", model: "claude-sonnet-4-5" },
  credentials: {}, sourceFormatOverride: "claude",
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
});
const invalid = (code) => Object.assign(new RangeError("Invalid request token budget; change the request cap"), { code, param: code === "invalid_thinking_budget" ? "thinking.budget_tokens" : "max_tokens" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.native.mockImplementation(body => body);
  mocks.translate.mockImplementation((_from, _to, _model, body) => ({ ...body }));
  mocks.execute.mockImplementation(async ({ body }) => ({ transformedBody: body, url: "https://fixture.invalid/messages", headers: {}, response: Response.json({
    id: "budget_valid", type: "message", role: "assistant", model: body.model,
    content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
  }) }));
});

describe("request budget validation is not upstream failure", () => {
  it.each(["invalid_output_budget", "invalid_thinking_budget"])("returns structured 400 for translated %s", async (code) => {
    mocks.translate.mockImplementationOnce(() => { throw invalid(code); });
    const result = await handleChatCore(options());
    expect(result.status).toBe(400);
    expect(await result.response.json()).toMatchObject({ error: { type: "invalid_request_error", code, param: invalid(code).param } });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("catches native passthrough thinking validation before dispatch", async () => {
    mocks.native.mockImplementationOnce(() => { throw invalid("invalid_thinking_budget"); });
    const opts = options();
    opts.clientRawRequest = { headers: { "user-agent": "claude-cli/fixture" }, body: opts.body, endpoint: "/v1/messages" };
    const result = await handleChatCore(opts);
    expect(result.status).toBe(400);
    expect(await result.response.json()).toMatchObject({ error: { code: "invalid_thinking_budget" } });
    expect(mocks.translate).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("keeps a final executor budget validation request-scoped rather than returning 502", async () => {
    mocks.execute.mockRejectedValueOnce(invalid("invalid_output_budget"));
    const result = await handleChatCore(options());
    expect(result.status).toBe(400);
    expect(await result.response.json()).toMatchObject({ error: { code: "invalid_output_budget", param: "max_tokens" } });
    expect(checkFallbackError(result.status, result.error).cooldownMs).toBe(0);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("does not mask ordinary executor failures as invalid requests", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("Upstream unavailable"));
    expect((await handleChatCore(options())).status).toBe(502);
  });

  it("still dispatches a valid request once", async () => {
    expect((await handleChatCore(options())).success).toBe(true);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
});
