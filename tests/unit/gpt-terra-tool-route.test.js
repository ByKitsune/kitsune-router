import { beforeEach, describe, expect, it, vi } from "vitest";
import "../translator/registerAll.js";

const io = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: io.fetch }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
  enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
  appendProviderChunk() {}, appendConvertedChunk() {}, flush() {},
}) }));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const MODEL = "gpt-6.1-terra";
const reply = {
  id: "resp_fixture", object: "response", status: "completed", model: MODEL,
  output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "offline answer" }] }],
  usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 },
};

beforeEach(() => {
  io.fetch.mockReset();
  io.fetch.mockResolvedValue(Response.json(reply));
});

async function dispatch(body, sourceFormat) {
  const original = structuredClone(body);
  const result = await handleChatCore({
    body, modelInfo: { provider: "openai", model: MODEL }, credentials: { apiKey: "offline-fixture" },
    sourceFormatOverride: sourceFormat, connectionId: "terra-offline",
    clientRawRequest: { body, endpoint: sourceFormat === FORMATS.OPENAI ? "/v1/chat/completions" : "/v1/responses", headers: {} },
    log: { debug() {}, info() {}, warn() {}, error() {} },
  });
  expect(body).toEqual(original);
  expect(result.success).toBe(true);
  expect(io.fetch).toHaveBeenCalledTimes(1);
  const [url, init] = io.fetch.mock.calls[0];
  return { url, sent: JSON.parse(init.body), result };
}

describe("OpenAI GPT-6.1 Terra tool routing", () => {
  it("sends Chat client tools to the documented Responses endpoint without dropping them", async () => {
    const { url, sent } = await dispatch({
      model: MODEL, stream: false, messages: [{ role: "user", content: "find an answer" }],
      tools: [{ type: "function", function: { name: "lookup", description: "Look up an item", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } }],
      tool_choice: "required",
    }, FORMATS.OPENAI);
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(sent.model).toBe(MODEL);
    expect(sent.tools).toEqual(expect.arrayContaining([expect.objectContaining({ type: "function", name: "lookup", description: "Look up an item" })]));
    expect(sent.tool_choice).toBe("required");
    expect(JSON.stringify(sent.input)).toContain("find an answer");
  });

  it("keeps native Responses tools and continuity on the same endpoint", async () => {
    const body = {
      model: MODEL, stream: false, input: "find an answer", previous_response_id: "resp_previous",
      tools: [{ type: "function", name: "lookup", parameters: { type: "object", properties: {} } }],
      tool_choice: "auto",
    };
    const { url, sent } = await dispatch(body, FORMATS.OPENAI_RESPONSES);
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(sent).toMatchObject({ model: MODEL, previous_response_id: "resp_previous", tools: body.tools, tool_choice: "auto" });
  });
});
