import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("../../open-sse/executors/index.js", async () => {
  const { DefaultExecutor } = await import("../../open-sse/executors/default.js");
  return { getExecutor: (provider) => new DefaultExecutor(provider) };
});
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({
  getDeclaredModelCaps: vi.fn(async () => undefined),
}));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({
  createRequestLogger: async () => ({
    logClientRawRequest: vi.fn(), logRawRequest: vi.fn(), logTargetRequest: vi.fn(),
    logProviderResponse: vi.fn(), logConvertedResponse: vi.fn(), logError: vi.fn(),
  }),
}));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import * as modelConfig from "../../open-sse/config/providerModels.js";

const responsesReply = {
  id: "resp_fixture", object: "response", status: "completed", model: "fixture",
  output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }],
  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
};
const chatReply = {
  id: "chatcmpl-fixture", object: "chat.completion", model: "fixture",
  choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

async function dispatch(sourceFormat, { provider = "openai", model = "gpt-6.1-sol", credentials = { apiKey: "offline-fixture" }, extra = {} } = {}) {
  const body = sourceFormat === "openai-responses"
    ? { input: [{ role: "user", content: [{ type: "input_text", text: "hello transport" }] }], store: false }
    : sourceFormat === "claude"
      ? { max_tokens: 32, system: "Be brief.", messages: [{ role: "user", content: [{ type: "text", text: "hello transport" }] }] }
      : { messages: [{ role: "user", content: "hello transport" }] };
  const result = await handleChatCore({
    body: { ...body, model, stream: false, ...extra }, modelInfo: { provider, model },
    credentials, sourceFormatOverride: sourceFormat, connectionId: "target-transport-fixture",
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  });
  const [url, init] = proxyAwareFetch.mock.calls.at(-1);
  return { result, url, init, sent: JSON.parse(init.body), credentials };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  proxyAwareFetch.mockImplementation(async () => Response.json(responsesReply));
});

describe("chatCore target-format transport dispatch", () => {
  it.each(["openai", "claude"])("translates %s input for a Responses-only model and dispatches to /responses", async (sourceFormat) => {
    const { url, sent, result } = await dispatch(sourceFormat);
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(sent.model).toBe("gpt-6.1-sol");
    expect(Array.isArray(sent.input)).toBe(true);
    expect(JSON.stringify(sent.input)).toContain("hello transport");
    expect(sent).not.toHaveProperty("messages");
    expect(result.success).toBe(true);
  });

  it("clears a prior Responses transport when reused credentials switch to a default Chat model", async () => {
    const credentials = { apiKey: "offline-fixture" };
    const first = await dispatch("openai-responses", { credentials });
    expect(first.url).toBe("https://api.openai.com/v1/responses");
    proxyAwareFetch.mockImplementation(async () => Response.json(chatReply));
    const second = await dispatch("claude", { model: "gpt-5.5", credentials });
    expect(second.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(second.credentials).not.toHaveProperty("runtimeTransport");
    expect(second.sent.messages).toEqual(expect.arrayContaining([{ role: "user", content: "hello transport" }]));
    expect(second.sent).not.toHaveProperty("input");
    expect(second.result.success).toBe(true);
  });

  it("prefers a supported native Chat endpoint over a declared Responses fallback", async () => {
    // Exercise conflicting metadata without changing the shared registry.
    vi.spyOn(modelConfig, "getModelTargetFormat").mockReturnValue("openai-responses");
    vi.spyOn(modelConfig, "getModelSupportedFormats").mockReturnValue(["openai", "openai-responses"]);
    proxyAwareFetch.mockImplementation(async () => Response.json(chatReply));
    const messages = [
      { role: "assistant", content: null, tool_calls: [{ id: "call_native", type: "function", function: { name: "lookup", arguments: '{"q":"exact"}' } }] },
      { role: "tool", tool_call_id: "call_native", content: "native tool result" },
      { role: "user", content: "hello transport" },
    ];
    const { url, sent, result } = await dispatch("openai", { extra: { messages } });
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(sent.messages).toEqual(messages);
    expect(sent).not.toHaveProperty("input");
    expect(result.success).toBe(true);
  });

  it("leaves default URL resolution intact when the target has no matching provider transport", async () => {
    const credentials = { apiKey: "offline-fixture" };
    await dispatch("openai-responses", { credentials });
    vi.spyOn(modelConfig, "getModelTargetFormat").mockReturnValue("claude");
    vi.spyOn(modelConfig, "getModelSupportedFormats").mockReturnValue(["claude"]);
    proxyAwareFetch.mockImplementation(async () => Response.json({
      id: "msg_fixture", type: "message", role: "assistant", model: "fixture",
      content: [{ type: "text", text: "ok" }], stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
    const { url, sent } = await dispatch("openai", { model: "gpt-5.5", credentials });
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(credentials).not.toHaveProperty("runtimeTransport");
    expect(JSON.stringify(sent.messages)).toContain("hello transport");
    expect(sent).not.toHaveProperty("input");
  });

  it("replaces a reused native Chat transport when the next model requires Responses", async () => {
    const credentials = { apiKey: "offline-fixture" };
    proxyAwareFetch.mockImplementationOnce(async () => Response.json(chatReply));
    const first = await dispatch("openai", { model: "gpt-5.5", credentials });
    expect(first.url).toBe("https://api.openai.com/v1/chat/completions");
    const second = await dispatch("openai", { credentials });
    expect(second.url).toBe("https://api.openai.com/v1/responses");
    expect(second.sent).not.toHaveProperty("messages");
    expect(JSON.stringify(second.sent.input)).toContain("hello transport");
    expect(second.result.success).toBe(true);
  });

  it("keeps native Responses input and continuity fields on /responses", async () => {
    const { url, sent, result } = await dispatch("openai-responses", {
      extra: { previous_response_id: "resp_previous", include: ["reasoning.encrypted_content"] },
    });
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(sent).toMatchObject({ store: false, previous_response_id: "resp_previous", include: ["reasoning.encrypted_content"] });
    expect(sent.input).toEqual([{ role: "user", content: [{ type: "input_text", text: "hello transport" }] }]);
    expect(result.success).toBe(true);
  });
});
