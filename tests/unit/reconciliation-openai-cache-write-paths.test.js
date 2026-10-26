import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only persistence is replaced: exercise the actual handlers/stream translators
// without consulting a developer's database or any upstream service.
const storage = vi.hoisted(() => ({ records: [] }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest() {},
  appendRequestLog: async () => {},
  saveRequestDetail: async () => {},
  enqueueRequestUsage: async record => { storage.records.push(record); return { accepted: true, eventId: record.eventId }; },
}));
import { createSSEStream } from "../../open-sse/utils/stream.js";
import { canonicalizeUsage, normalizeUsage } from "../../open-sse/utils/usageTracking.js";
import { handleNonStreamingResponse } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const nativeDetails = {
  cached_tokens: 4000, cache_write_tokens: 7000,
  cache_write_tokens_details: { ttl_30m_tokens: 3000, ttl_12h_tokens: 4000 },
};
const nativeUsage = () => ({
  input_tokens: 12000, output_tokens: 500, total_tokens: 12500,
  input_tokens_details: structuredClone(nativeDetails),
});
const chatUsage = () => ({
  prompt_tokens: 12000, completion_tokens: 500, total_tokens: 12500,
  prompt_tokens_details: structuredClone(nativeDetails),
});
const expectedTokens = {
  prompt_tokens: 12000, completion_tokens: 500, total_tokens: 12500, cached_tokens: 4000,
  cache_write_tokens: 7000, cache_write_30m_tokens: 3000, cache_write_12h_tokens: 4000,
  cache_creation_input_tokens: 0,
};
const nativeBody = usage => ({
  id: "resp_openai_cache_writes", object: "response", model: "offline-cache-write-fixture", status: "completed",
  output: [{ id: "msg_cache", type: "message", role: "assistant", content: [{ type: "output_text", text: "Measured output" }] }],
  usage,
});
const chatBody = usage => ({
  id: "chatcmpl_openai_cache_writes", object: "chat.completion", model: "offline-cache-write-fixture",
  choices: [{ index: 0, message: { role: "assistant", content: "Measured output" }, finish_reason: "stop" }],
  usage,
});
const network = vi.fn(() => { throw new Error("Cache-write fixtures must not make live requests"); });
beforeEach(() => { storage.records.length = 0; network.mockClear(); vi.stubGlobal("fetch", network); });
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

async function stream(events, targetFormat, sourceFormat, mode) {
  let captured;
  const text = events.map(event => `${event.type ? `event: ${event.type}\n` : ""}data: ${JSON.stringify(event)}\n\n`).join("");
  const transform = createSSEStream({
    provider: "openai", model: "offline-cache-write-fixture", targetFormat, sourceFormat, mode,
    onStreamComplete(_content, usage) { captured = usage; },
  });
  const wire = await new Response(new Response(text).body.pipeThrough(transform)).text();
  const parsed = wire.split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
  return { captured, wire, parsed };
}

async function jsonCompletion(body, targetFormat, sourceFormat) {
  const result = await handleNonStreamingResponse({
    providerResponse: Response.json(body), provider: "openai", model: "offline-cache-write-fixture",
    sourceFormat, targetFormat, body: { model: "offline-cache-write-fixture", messages: [] }, stream: false,
    translatedBody: {}, finalBody: {}, requestStartTime: Date.now(), connectionId: "offline-cache-write-fixture",
    clientRawRequest: { endpoint: sourceFormat === FORMATS.OPENAI_RESPONSES ? "/v1/responses" : "/v1/chat/completions" },
    reqLogger: { logProviderResponse() {}, logConvertedResponse() {} }, trackDone() {}, appendLog() {},
  });
  expect(result.success).toBe(true);
  return result.response.json();
}

describe("OpenAI cache writes on consumed JSON handler paths", () => {
  it.each([
    ["native Responses", FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI_RESPONSES],
    ["Responses forwarded as Chat", FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI],
    ["native Chat", FORMATS.OPENAI, FORMATS.OPENAI],
  ])("persists %s writes after the handler's repeated canonicalization", async (_name, upstream, client) => {
    const body = upstream === FORMATS.OPENAI ? chatBody(chatUsage()) : nativeBody(nativeUsage());
    const delivered = await jsonCompletion(body, upstream, client);
    const details = client === FORMATS.OPENAI_RESPONSES ? delivered.usage.input_tokens_details : delivered.usage.prompt_tokens_details;
    expect(details).toEqual(nativeDetails);
    expect(storage.records).toHaveLength(1);
    expect(storage.records[0].tokens).toMatchObject(expectedTokens);
    expect(canonicalizeUsage(normalizeUsage(storage.records[0].tokens))).toMatchObject(expectedTokens);
    expect(storage.records[0].tokens).not.toHaveProperty("cache_creation_1h_tokens");
  });

  it("persists aggregate-only writes without fabricating a thirty-minute or twelve-hour split", async () => {
    await jsonCompletion(nativeBody({ input_tokens: 12000, output_tokens: 500,
      input_tokens_details: { cache_write_tokens: 7000 } }), FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI_RESPONSES);
    expect(storage.records[0].tokens).toMatchObject({ prompt_tokens: 12000, cache_write_tokens: 7000 });
    expect(storage.records[0].tokens).not.toHaveProperty("cache_write_30m_tokens");
    expect(storage.records[0].tokens).not.toHaveProperty("cache_write_12h_tokens");
  });

  it("persists unexplained native writes as invalid rather than inventing the missing TTL", async () => {
    const usage = nativeUsage();
    delete usage.input_tokens_details.cache_write_tokens_details.ttl_12h_tokens;
    await jsonCompletion(nativeBody(usage), FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI_RESPONSES);
    expect(storage.records[0].tokens).toMatchObject({
      prompt_tokens: 12000, cache_write_tokens: 7000, cache_write_30m_tokens: 3000, cache_write_invalid: true,
    });
    expect(storage.records[0].tokens).not.toHaveProperty("cache_write_12h_tokens");
  });
});

describe("OpenAI cache writes on consumed SSE accounting/forwarding paths", () => {
  it.each(["passthrough", "translate"])("preserves native Responses wire and accounting in %s mode", async mode => {
    const terminal = { type: "response.completed", response: nativeBody(nativeUsage()) };
    const result = await stream([terminal], FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI_RESPONSES, mode);
    expect(result.parsed.find(event => event.type === "response.completed").response.usage).toEqual(nativeUsage());
    expect(canonicalizeUsage(result.captured)).toMatchObject(expectedTokens);
    expect(result.wire).not.toContain("stream_disconnected");
  });

  it.each(["passthrough", "translate"])("preserves Chat wire and canonical accounting in %s mode", async mode => {
    const result = await stream([
      { id: "chatcmpl_cache", choices: [{ index: 0, delta: { content: "Measured output" }, finish_reason: "stop" }] },
      { id: "chatcmpl_cache", choices: [], usage: chatUsage() },
    ], FORMATS.OPENAI, FORMATS.OPENAI, mode);
    expect(result.parsed.find(event => event.usage).usage.prompt_tokens_details).toEqual(nativeDetails);
    expect(canonicalizeUsage(result.captured)).toMatchObject(expectedTokens);
  });

  it("retains Responses accounting even when the client format is translated to Chat", async () => {
    const result = await stream([{ type: "response.completed", response: nativeBody(nativeUsage()) }],
      FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, "translate");
    expect(result.parsed.some(event => event.choices?.[0]?.finish_reason === "stop")).toBe(true);
    expect(canonicalizeUsage(result.captured)).toMatchObject(expectedTokens);
  });

  it("replaces prior write counters with an explicit all-zero terminal snapshot", async () => {
    const result = await stream([
      { choices: [{ delta: { content: "Measured output" }, finish_reason: null }], usage: chatUsage() },
      { choices: [{ delta: {}, finish_reason: "stop" }], usage: {
        prompt_tokens: 12000, completion_tokens: 500,
        prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0,
          cache_write_tokens_details: { ttl_30m_tokens: 0, ttl_12h_tokens: 0 } },
      } },
    ], FORMATS.OPENAI, FORMATS.OPENAI, "passthrough");
    expect(canonicalizeUsage(result.captured)).toMatchObject({
      prompt_tokens: 12000, cache_write_tokens: 0, cache_write_30m_tokens: 0, cache_write_12h_tokens: 0,
    });
  });
});
