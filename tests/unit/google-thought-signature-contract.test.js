import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { openaiToGeminiRequest, openaiToGeminiCLIRequest, openaiToAntigravityRequest } from "../../open-sse/translator/request/openai-to-gemini.js";
import { openaiToVertexRequest } from "../../open-sse/translator/request/openai-to-vertex.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { GeminiCLIExecutor } from "../../open-sse/executors/gemini-cli.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { VertexExecutor } from "../../open-sse/executors/vertex.js";
import { buildToolCallId, splitToolCallId, validateGoogleThoughtSignatures } from "../../open-sse/translator/concerns/thoughtSignature.js";
import { geminiToOpenAIResponse } from "../../open-sse/translator/response/gemini-to-openai.js";
import { translateNonStreamingResponse } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { GOOGLE_MIGRATED_HISTORY_MARKER } from "../../open-sse/config/thoughtSignatures.js";

vi.mock("@/lib/usageDb.js", () => ({ trackPendingRequest() {}, appendRequestLog: async () => {}, saveRequestDetail: async () => {}, saveRequestUsage: async () => {}, enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })) }));

const io = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: io.fetch }));
const signature = label => Buffer.from(`synthetic opaque original ${label}`).toString("base64");
const FIRST = signature("step one");
const SECOND = signature("step two");
const credentials = { accessToken: "synthetic-oauth-token", projectId: "actual-provisioned-project", connectionId: "signature-account" };
const call = (id, value) => ({ id, type: "function", function: { name: "lookup", arguments: "{}" }, ...(value !== undefined ? { extra_content: { google: { thought_signature: value } } } : {}) });
const result = id => ({ role: "tool", tool_call_id: id, content: "found" });
const history = calls => ({ messages: [{ role: "user", content: "Look up both" }, { role: "assistant", tool_calls: calls }, ...calls.map(c => result(c.id))] });
const parts = request => (request.request || request).contents.flatMap(turn => turn.parts);
const native = value => ({ contents: [{ role: "user", parts: [{ text: "Look it up" }] }, { role: "model", parts: [{ ...(value !== undefined ? { thoughtSignature: value } : {}), functionCall: { name: "lookup", args: {} } }] }, { role: "user", parts: [{ functionResponse: { name: "lookup", response: { result: "found" } } }] }] });

beforeEach(() => io.fetch.mockReset());
afterEach(() => vi.restoreAllMocks());

describe.each([
  ["Gemini API", openaiToGeminiRequest],
  ["Gemini CLI", openaiToGeminiCLIRequest],
  ["Vertex", openaiToVertexRequest],
  ["Antigravity Gemini", openaiToAntigravityRequest],
])("%s thought-signature history", (_name, translate) => {
  it("preserves the first signed call and a legitimately unsigned parallel call", () => {
    const body = history([call("one", FIRST), call("two")]);
    const before = structuredClone(body);
    const output = translate("gemini-3-pro", body, false, credentials);
    expect(parts(output).filter(p => p.functionCall).map(p => p.thoughtSignature)).toEqual([FIRST, undefined]);
    expect(body).toEqual(before);
  });

  it("requires original signatures on each current-turn sequential step", () => {
    const body = history([call("one", FIRST)]);
    body.messages.push({ role: "assistant", tool_calls: [call("two")] }, result("two"));
    expect(() => translate("gemini-3-pro", body, false, credentials)).toThrowError(expect.objectContaining({ code: "missing_thought_signature" }));
    body.messages.at(-2).tool_calls[0] = call("two", SECOND);
    expect(parts(translate("gemini-3-pro", body, false, credentials)).filter(p => p.functionCall).map(p => p.thoughtSignature)).toEqual([FIRST, SECOND]);
  });

  it("leaves supported older unsigned history unsigned and rejects supplied corruption", () => {
    expect(parts(translate("gemini-2.5-flash", history([call("one")]), false, credentials)).filter(p => p.functionCall).map(p => p.thoughtSignature)).toEqual([undefined]);
    expect(() => translate("gemini-2.5-flash", history([call("one", "corrupt*signature")]), false, credentials)).toThrowError(expect.objectContaining({ code: "invalid_thought_signature" }));
  });

  it("preserves an explicitly supplied documented migration marker and never inserts it", () => {
    expect(parts(translate("gemini-3-pro", history([call("one", GOOGLE_MIGRATED_HISTORY_MARKER)]), false, credentials)).find(p => p.functionCall).thoughtSignature).toBe(GOOGLE_MIGRATED_HISTORY_MARKER);
    expect(() => translate("gemini-3-pro", history([call("one")]), false, credentials)).toThrowError(expect.objectContaining({ code: "missing_thought_signature" }));
  });
});

describe("opaque signature ownership and native dispatch", () => {
  it("round-trips the documented caller marker through a serialized tool ID", () => {
    const id = buildToolCallId("lookup", 0, GOOGLE_MIGRATED_HISTORY_MARKER, "one");
    expect(splitToolCallId(id, null, { strict: true })).toEqual({ rawId: "one", thoughtSignature: GOOGLE_MIGRATED_HISTORY_MARKER });
  });

  it("keeps earlier unsigned turns outside the current Gemini 3 turn, without guessing Gemini 4 requirements", () => {
    const contents = native().contents;
    contents.push({ role: "user", parts: [{ text: "Start a new turn" }] });
    expect(() => validateGoogleThoughtSignatures(contents, "gemini-3-pro")).not.toThrow();
    expect(() => validateGoogleThoughtSignatures(native().contents, "gemini-4-argon")).not.toThrow();
  });

  it("does not attach an invented signature to OpenAI reasoning", () => {
    const output = openaiToGeminiRequest("gemini-2.5-pro", { messages: [{ role: "assistant", reasoning_content: "A caller's prior reasoning", content: "answer" }, { role: "user", content: "Continue" }] }, false);
    expect(parts(output).filter(p => p.thought)).toEqual([{ thought: true, text: "A caller's prior reasoning" }]);
    expect(parts(output).some(p => p.thoughtSignature)).toBe(false);
  });

  it("preserves original signed thought and text parts on Antigravity", () => {
    const body = { request: { contents: [{ role: "model", parts: [{ thought: true, text: "original thought", thoughtSignature: FIRST }, { text: "", thoughtSignature: SECOND }] }, { role: "user", parts: [{ text: "next turn" }] }] } };
    const before = structuredClone(body);
    const output = new AntigravityExecutor().transformRequest("gemini-2.5-pro", body, false, credentials);
    expect(output.request.contents[0].parts).toEqual(body.request.contents[0].parts);
    expect(body).toEqual(before);
  });

  it("preserves image-edit signatures and thought metadata instead of dropping account context", () => {
    const request = { contents: [
      { role: "model", parts: [{ thought: true, text: "edit reasoning", thoughtSignature: FIRST }, { inline_data: { mime_type: "image/png", data: "synthetic-image" }, thought_signature: SECOND }] },
      { role: "user", parts: [{ text: "Edit the previous image" }] },
    ] };
    const before = structuredClone(request);
    const output = new AntigravityExecutor().transformRequest("gemini-3-pro-image-preview", { request }, false, credentials);
    expect(output.request.contents[0].parts).toEqual([
      { thought: true, text: "edit reasoning", thoughtSignature: FIRST },
      { inlineData: { mimeType: "image/png", data: "synthetic-image" }, thoughtSignature: SECOND },
    ]);
    expect(request).toEqual(before);
  });

  it("preserves each call's actual signature through the Antigravity Claude bridge", () => {
    const output = openaiToAntigravityRequest("claude-sonnet-4-6", history([call(buildToolCallId("lookup", 0, FIRST, "one")), call("two", SECOND)]), false, credentials);
    expect(parts(output).filter(p => p.functionCall).map(p => p.thoughtSignature)).toEqual([FIRST, SECOND]);
  });

  it("rejects conflicting explicit and encoded signatures", () => {
    const body = history([call(buildToolCallId("lookup", 0, FIRST, "one"), SECOND)]);
    expect(() => openaiToGeminiRequest("gemini-3-pro", body, false)).toThrowError(expect.objectContaining({ code: "invalid_thought_signature" }));
  });

  it.each([
    ["Gemini API", () => new DefaultExecutor("gemini"), value => native(value)],
    ["Vertex", () => new VertexExecutor(), value => native(value)],
    ["Gemini CLI", () => new GeminiCLIExecutor(), value => ({ project: "caller-project", model: "gemini-3-pro", request: native(value) })],
    ["Antigravity", () => new AntigravityExecutor(), value => ({ request: native(value) })],
  ])("%s refuses missing/corrupt native history before any HTTP request", async (_name, makeExecutor, body) => {
    for (const [value, code] of [[undefined, "missing_thought_signature"], ["not*base64", "invalid_thought_signature"]]) {
      await expect(makeExecutor().execute({ model: "gemini-3-pro", body: body(value), stream: false, credentials })).rejects.toMatchObject({ code });
    }
    expect(io.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["Gemini API", () => new DefaultExecutor("gemini"), request => request],
    ["Gemini CLI", () => new GeminiCLIExecutor(), request => ({ project: "ignored-caller-project", model: "gemini-3-pro", request })],
    ["Vertex", () => new VertexExecutor(), request => request],
    ["Antigravity", () => new AntigravityExecutor(), request => ({ request })],
  ])("%s serializes native nested/snake signatures on the correct Part without mutating borrowed input", async (_name, makeExecutor, wrap) => {
    for (const spelling of ["nested", "snake"]) {
      io.fetch.mockReset().mockImplementation(async () => Response.json({ candidates: [] }));
      const request = native(FIRST);
      const callPart = request.contents[1].parts[0];
      callPart.thought = true;
      delete callPart.thoughtSignature;
      if (spelling === "nested") callPart.functionCall.thoughtSignature = FIRST;
      else callPart.thought_signature = FIRST;
      const body = wrap(request);
      const before = structuredClone(body);
      await makeExecutor().execute({ model: "gemini-3-pro", body, stream: false,
        credentials: { ...credentials, providerSpecificData: { projectId: "actual-provisioned-project", location: "global" } } });
      expect(io.fetch).toHaveBeenCalledTimes(1);
      const wire = JSON.parse(io.fetch.mock.calls[0][1].body);
      expect((wire.request || wire).contents[1].parts[0]).toEqual({ thought: true, thoughtSignature: FIRST, functionCall: { name: "lookup", args: {} } });
      expect(body).toEqual(before);
    }
  });

  it("normalizes signature ownership with copy-on-write and keeps canonical history by reference", () => {
    const request = native(FIRST);
    expect(validateGoogleThoughtSignatures(request.contents, "gemini-3-pro")).toBe(request.contents);
    request.contents[1].parts[0].functionCall.thoughtSignature = FIRST;
    delete request.contents[1].parts[0].thoughtSignature;
    const normalized = validateGoogleThoughtSignatures(request.contents, "gemini-3-pro");
    expect(normalized).not.toBe(request.contents);
    expect(normalized[0]).toBe(request.contents[0]);
    expect(normalized[1]).not.toBe(request.contents[1]);
    expect(normalized[1].parts[0].thoughtSignature).toBe(FIRST);
    expect(normalized[1].parts[0].functionCall).toEqual({ name: "lookup", args: {} });
    expect(request.contents[1].parts[0].functionCall.thoughtSignature).toBe(FIRST);
    expect(request.contents[1].parts[0]).not.toHaveProperty("thoughtSignature");
  });

  it.each([400, 401, 403, 409, 422])("does not retry or change Antigravity endpoints after a %s denial with misleading retry hints", async status => {
    io.fetch.mockImplementation(async () => Response.json({ error: { message: "capacity policy denied; retry after 1s", status: "PERMISSION_DENIED" } }, { status, headers: { "Retry-After": "1" } }));
    const output = await new AntigravityExecutor().execute({ model: "gemini-2.5-flash", body: { request: native(FIRST) }, stream: false, credentials });
    expect(output.response.status).toBe(status);
    expect(io.fetch).toHaveBeenCalledTimes(1);
    expect(await new AntigravityExecutor().computeRetryDelay(Response.json({ error: { message: "capacity" } }, { status, headers: { "Retry-After": "1" } }), 1)).toBe(false);
  });
});


describe("Google response signature ownership", () => {
  const thought = { thought: true, text: "Original provider reasoning", thoughtSignature: FIRST };
  const signed = { thoughtSignature: SECOND, functionCall: { id: "signed", name: "lookup", args: { key: "signed" } } };
  const unsigned = { functionCall: { id: "unsigned", name: "lookup", args: { key: "parallel" } } };
  const response = parts => ({ candidates: [{ content: { role: "model", parts } }] });

  it("nonstreaming does not transfer a thought/text signature to an unsigned call", () => {
    const json = translateNonStreamingResponse(response([thought, unsigned, signed]), FORMATS.GEMINI, FORMATS.OPENAI);
    expect(json.choices[0].message.reasoning_content).toBe(thought.text);
    expect(json.choices[0].message.tool_calls.map(call => splitToolCallId(call.id))).toEqual([
      { rawId: "unsigned", thoughtSignature: "" }, { rawId: "signed", thoughtSignature: SECOND },
    ]);
  });

  it("streaming preserves exact call ownership across separate chunks and response states", () => {
    const state = {};
    geminiToOpenAIResponse(response([thought]), state);
    const chunks = geminiToOpenAIResponse(response([unsigned, signed]), state);
    const calls = chunks.flatMap(chunk => chunk.choices[0].delta.tool_calls || []);
    expect(calls.map(call => splitToolCallId(call.id))).toEqual([
      { rawId: "unsigned", thoughtSignature: "" }, { rawId: "signed", thoughtSignature: SECOND },
    ]);
    const separate = geminiToOpenAIResponse(response([unsigned]), {});
    expect(separate.flatMap(chunk => chunk.choices[0].delta.tool_calls || []).map(call => splitToolCallId(call.id).thoughtSignature)).toEqual([""]);
  });
});
