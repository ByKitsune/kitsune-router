import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http2";
import { gzipSync } from "node:zlib";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { openaiToCursorRequest } from "../../open-sse/translator/request/openai-to-cursor.js";
import { CursorExecutor } from "../../open-sse/executors/cursor.js";
import { compressMessages } from "../../open-sse/rtk/index.js";

// Independent wire reader, not cursorProtobuf.decodeMessage or an encoder round-trip.
// Primary schema: official Cursor CLI 2026.10.16-e3cb207, dist-package/index.js,
// downloaded from https://downloads.cursor.com/lab/2026.10.16-e3cb207/linux/x64/agent-cli-package.tar.gz
// Archive SHA-256: 3aa3f48cd7a3909a98c9b3f2a4085f0c021088bf826690b22c61f424c843e552.
// Its generated static $() descriptors declare:
// UserMessageAction: user_message=1, conversation_history=7, trailing_conversation_history=8.
// UserMessage.selected_context=3 -> SelectedContext.selected_images=1 (repeated).
// SelectedImage: uuid=2(string), dimension=4, mime_type=7(string), data=8(BYTES).
// ConversationHistory.messages=1 -> ConversationHistoryMessage: user=1, assistant=2, tool=3.
// User.content=1 -> UserContent: text=1, image=2.
// Assistant.content=1 -> AssistantContent: text=1, tool_call=4.
// Tool: tool_call_id=1, tool_name=2, content=3 -> ToolResultContent: text=1, image=2.
// HistoryTextContent.text=1; HistoryToolCall: tool_call_id=1, tool_name=2, args_json=3.
// IMPORTANT: ConversationHistoryImageContent.data=1 is STRING (native base64),
// mime_type=2 is optional STRING. It is not prose, and is not SelectedImage.data.
// @cursor/sdk@1.0.7 independently confirms current SelectedImage.data=8 bytes and
// McpImageContent.data=1 bytes + mime_type=2, but predates conversation_history.
// https://registry.npmjs.org/@cursor/sdk/1.0.7 (tarball SHA-1 7e0f970a8ee8e3703310a6e789c5f1d876a1c0f4).
function readProto(input) {
  const data = Buffer.from(input);
  const fields = new Map();
  let offset = 0;
  const varint = () => {
    let value = 0;
    let factor = 1;
    for (let count = 0; count < 10; count++) {
      if (offset >= data.length) throw new Error("Truncated protobuf varint");
      const byte = data[offset++];
      value += (byte & 0x7f) * factor;
      if (!(byte & 0x80)) return value;
      factor *= 128;
    }
    throw new Error("Oversized protobuf varint");
  };
  while (offset < data.length) {
    const tag = varint();
    const field = Math.floor(tag / 8);
    const wireType = tag % 8;
    if (!field) throw new Error("Invalid protobuf field zero");
    let value;
    if (wireType === 0) {
      value = varint();
    } else {
      const length = wireType === 2 ? varint() : wireType === 1 ? 8 : wireType === 5 ? 4 : -1;
      if (length < 0 || offset + length > data.length) throw new Error("Invalid protobuf field bounds");
      value = data.subarray(offset, offset + length);
      offset += length;
    }
    const values = fields.get(field) || [];
    values.push(value);
    fields.set(field, values);
  }
  return fields;
}

const fieldBytes = (message, field) => message.get(field)?.[0] || Buffer.alloc(0);
const child = (message, field) => readProto(fieldBytes(message, field));
const fieldText = (message, field) => fieldBytes(message, field).toString("utf8");
const repeated = (message, field) => (message.get(field) || []).map(readProto);

function readContent(parts) {
  return parts.map((part) => {
    if (part.has(1)) return { type: "text", text: fieldText(child(part, 1), 1) };
    if (part.has(2)) {
      const image = child(part, 2);
      return { type: "image", data: fieldText(image, 1), mimeType: fieldText(image, 2) };
    }
    if (part.has(4)) {
      const call = child(part, 4);
      return { type: "tool_call", id: fieldText(call, 1), name: fieldText(call, 2), arguments: fieldText(call, 3) };
    }
    return { type: "unknown", fields: [...part.keys()] };
  });
}

function readHistory(message) {
  return repeated(message, 1).map((entry) => {
    if (entry.has(1)) return { role: "user", content: readContent(repeated(child(entry, 1), 1)) };
    if (entry.has(2)) return { role: "assistant", content: readContent(repeated(child(entry, 2), 1)) };
    const tool = child(entry, 3);
    return { role: "tool", id: fieldText(tool, 1), name: fieldText(tool, 2), content: readContent(repeated(tool, 3)) };
  });
}

function readAgentRun(frame) {
  const data = Buffer.from(frame);
  expect(data[0], "fixture expects an uncompressed Connect request frame").toBe(0);
  expect(data.readUInt32BE(1)).toBe(data.length - 5);
  const client = readProto(data.subarray(5));
  const run = child(client, 1);
  const action = child(child(run, 2), 1);
  const current = child(action, 1);
  const images = repeated(child(current, 3), 1).map((image) => ({
    data: Buffer.from(fieldBytes(image, 8)),
    mimeType: fieldText(image, 7),
    id: fieldText(image, 2),
  }));
  return {
    current: { text: fieldText(current, 1), images },
    history: readHistory(child(action, 7)),
    trailing: readHistory(child(action, 8)),
  };
}

// Complete, distinct RGBA PNGs, not just magic bytes: 1x1 red and 1x2 blue.
const RED_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
const BLUE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAYAAACZgbYnAAAAEElEQVR4nGNgYPj/nwFEAAAP+gP9jN1qlAAAAABJRU5ErkJggg==";
const openaiImage = (data) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${data}`, detail: "high" } });
const claudeImage = (data) => ({ type: "image", source: { type: "base64", media_type: "image/png", data } });
const toolCall = () => ({ id: "capture-1", type: "function", function: { name: "capture_screen", arguments: '{"screen":1}' } });
const tools = () => [{ type: "function", function: {
  name: "capture_screen", description: "Capture a screenshot", parameters: { type: "object", properties: { screen: { type: "integer" } } },
} }];
const credentials = { accessToken: "offline-cursor-vision-fixture", providerSpecificData: { machineId: "a".repeat(64) } };
const MODEL = "claude-sonnet-4.6";

// Network is the only replaced boundary. These hand-written response frames
// mean interaction_update.text_delta.text="ok" and ChatService.response.text="ok".
const AGENT_OK = Buffer.from("00000000080a060a040a026f6b", "hex");
// Connect requires a JSON EndStreamResponse on the final frame (flag 0x02).
// https://connectrpc.com/docs/protocol/#error-end-stream
const END_SUCCESS = Buffer.from("02000000027b7d", "hex");
const TURN_ENDED = Buffer.from("00000000040a027200", "hex");
const AGENT_SUCCESS = Buffer.concat([AGENT_OK, TURN_ENDED, END_SUCCESS]);
function connectTerminal(json, compressed = false) {
  const payload = compressed ? gzipSync(Buffer.from(json)) : Buffer.from(json);
  const header = Buffer.alloc(5);
  header[0] = compressed ? 3 : 2;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}
const LEGACY_OK = Buffer.from("000000000612040a026f6b", "hex");
async function dispatch(body, { integrated = false } = {}) {
  const executor = new CursorExecutor();
  const sent = [];
  executor.openAgentHttp2Stream = (url) => {
    let read = false;
    return {
      responseHeaders: Promise.resolve({ ":status": 200 }),
      write(frame) { sent.push({ url, frame: Buffer.from(frame) }); },
      end() {},
      close() {},
      async read() {
        if (read) return { done: true, value: undefined };
        read = true;
        return { done: false, value: AGENT_SUCCESS };
      },
    };
  };
  const legacy = async (url, _headers, frame) => {
    sent.push({ url, frame: Buffer.from(frame) });
    return { status: 200, headers: {}, body: LEGACY_OK };
  };
  executor.makeHttp2Request = legacy;
  executor.makeFetchRequest = legacy;
  const translated = integrated
    ? await translateRequest(FORMATS.OPENAI, FORMATS.CURSOR, MODEL, body, false, credentials, "cursor")
    : await openaiToCursorRequest(MODEL, body, false, credentials);
  const result = await executor.execute({ model: MODEL, body: translated, stream: false, credentials });
  expect(result.response.status).toBe(200);
  const response = await result.response.json();
  expect(response.choices[0].message.content).toBe("ok");
  expect(sent.length, "the real executor must emit an upstream request").toBeGreaterThan(0);
  expect(new URL(sent[0].url).pathname, "media must not force real tool history back onto retired ChatService").toBe("/agent.v1.AgentService/Run");
  return readAgentRun(sent[0].frame);
}

function expectNoImageProse(wire) {
  const prose = [wire.current.text, ...[...wire.history, ...wire.trailing].flatMap((message) => message.content.filter((part) => part.type === "text").map((part) => part.text))].join("\n");
  expect(prose).not.toContain(RED_PNG);
  expect(prose).not.toContain(BLUE_PNG);
  expect(prose).not.toContain("data:image/");
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Primary CLI descriptors: ExecServerMessage.mcp_args=11; McpArgs fields
// name=1, args=2(map<string,Value>), tool_call_id=3, tool_name=5.
// InteractionUpdate.tool_requests_listed=27 -> ToolRequestsListedUpdate.call_count=1.
// Literal fixtures are independent of the production protobuf encoders.
const MCP_FIRST = Buffer.from("000000005e125c08177a0d657865632d6f726967696e616c5a490a0e636170747572655f73637265656e12130a0673637265656e120911000000000000f03f1a1263616c6c5f4f726967696e616c5f49442d372a0e636170747572655f73637265656e", "hex");
const MCP_SECOND = Buffer.from("000000005e125c08177a0d657865632d6f726967696e616c5a490a0e636170747572655f73637265656e12130a0673637265656e12091100000000000000401a1263616c6c5f4f726967696e616c5f49442d382a0e636170747572655f73637265656e", "hex");
const TWO_CALLS = Buffer.from("00000000070a05da01020802", "hex");

beforeEach(() => {
  for (const key of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"]) vi.stubEnv(key, "");
});
afterEach(() => vi.unstubAllEnvs());

function stubNativeFrames(executor, frames) {
  const sent = [];
  const queue = [...frames];
  executor.openAgentHttp2Stream = (url) => {
    sent.push({ url, frames: [] });
    return {
      responseHeaders: Promise.resolve({ ":status": 200 }),
      write(frame) { sent.at(-1).frames.push(Buffer.from(frame)); },
      end() {}, close() {},
      async read() { return queue.length ? { done: false, value: queue.shift() } : { done: true }; },
    };
  };
  return sent;
}

function parseNativeSse(text) {
  return text.split("\n\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).filter((line) => line !== "[DONE]").map(JSON.parse);
}

describe("Cursor security regression boundaries", () => {
  it.each([false, true])("propagates Connect terminal errors instead of a successful stop (stream=%s)", async (stream) => {
    const executor = new CursorExecutor();
    const failure = connectTerminal('{"error":{"code":"unavailable","message":"synthetic Cursor terminal failure"}}');
    stubNativeFrames(executor, [AGENT_OK, TURN_ENDED, failure]);
    const result = await executor.execute({ model: MODEL, body: { messages: [{ role: "user", content: "hi" }] }, stream, credentials });
    if (stream) {
      const events = parseNativeSse(await result.response.text());
      expect(events.find((event) => event.error)?.error).toMatchObject({ code: "unavailable", message: expect.stringContaining("synthetic Cursor terminal failure") });
      expect(events.some((event) => event.choices?.[0]?.finish_reason === "stop")).toBe(false);
    } else {
      expect(result.response.status).not.toBe(200);
      expect((await result.response.json()).error).toMatchObject({ code: "unavailable", message: expect.stringContaining("synthetic Cursor terminal failure") });
    }
  });

  it("propagates a compressed Connect terminal error batched with text", async () => {
    const executor = new CursorExecutor();
    stubNativeFrames(executor, [Buffer.concat([AGENT_OK, connectTerminal('{"error":{"code":"resource_exhausted","message":"synthetic terminal quota"}}', true)])]);
    const result = await executor.execute({ model: MODEL, body: { messages: [{ role: "user", content: "hi" }] }, stream: false, credentials });
    expect(result.response.status).not.toBe(200);
    expect((await result.response.json()).error).toMatchObject({ code: "resource_exhausted", message: expect.stringContaining("synthetic terminal quota") });
  });

  it.each([false, true])("rejects EOF without EndStreamResponse after turn-ended (stream=%s)", async (stream) => {
    const executor = new CursorExecutor();
    stubNativeFrames(executor, [AGENT_OK, TURN_ENDED]);
    const result = await executor.execute({ model: MODEL, body: { messages: [{ role: "user", content: "hi" }] }, stream, credentials });
    if (stream) {
      const events = parseNativeSse(await result.response.text());
      expect(events.find((event) => event.error)?.error).toMatchObject({ code: "protocol_error", message: expect.stringMatching(/missing EndStreamResponse|unexpected EOF/i) });
      expect(events.some((event) => event.choices?.[0]?.finish_reason === "stop")).toBe(false);
    } else {
      expect(result.response.status).not.toBe(200);
      expect((await result.response.json()).error).toMatchObject({ code: "protocol_error", message: expect.stringMatching(/missing EndStreamResponse|unexpected EOF/i) });
    }
  });

  it.each([false, true])("honors tool_choice none at native declaration and precheck boundaries (stream=%s)", async (stream) => {
    const executor = new CursorExecutor();
    const precheck = Buffer.from("00000000371235084d7a0f707265636865636b2d6e6174697665d2021f0a0d6b697473756e65726f75746572120e636170747572655f73637265656e", "hex");
    const sent = stubNativeFrames(executor, [precheck, AGENT_SUCCESS]);
    const body = translateRequest(FORMATS.OPENAI, FORMATS.CURSOR, MODEL, { tool_choice: "none", tools: tools(), messages: [{ role: "user", content: "Do not use tools." }] }, stream, credentials, "cursor");
    const result = await executor.execute({ model: MODEL, body, stream, credentials });
    expect(result.response.status).toBe(200);
    if (stream) expect(parseNativeSse(await result.response.text()).some((event) => event.error)).toBe(false);
    else expect((await result.response.json()).choices[0].finish_reason).toBe("stop");
    const frames = sent[0].frames;
    const run = child(readProto(frames[0].subarray(5)), 1);
    expect(run.has(4), "none must not advertise MCP tools").toBe(false);
    const reply = child(readProto(frames[1].subarray(5)), 2);
    expect(child(reply, 42).get(1), "none must never authorize a declared tool").toEqual([0]);
  });

  it("does not hand off a native execution request when tool_choice is none", async () => {
    const executor = new CursorExecutor();
    stubNativeFrames(executor, [MCP_FIRST]);
    const body = translateRequest(FORMATS.OPENAI, FORMATS.CURSOR, MODEL, { tool_choice: "none", tools: tools(), messages: [{ role: "user", content: "Do not use tools." }] }, false, credentials, "cursor");
    const result = await executor.execute({ model: MODEL, body, stream: false, credentials });
    expect(result.response.status).not.toBe(200);
    const payload = await result.response.json();
    expect(payload.error?.message).toMatch(/unsupported|tool/i);
    expect(payload.choices).toBeUndefined();
  });

  it.each(["required", { type: "function", function: { name: "capture_screen" } }])("rejects unsupported forced tool_choice before native dialing (%j)", async (tool_choice) => {
    const executor = new CursorExecutor();
    const sent = stubNativeFrames(executor, [AGENT_SUCCESS]);
    let observed;
    try {
      const body = translateRequest(FORMATS.OPENAI, FORMATS.CURSOR, MODEL, { tool_choice, tools: tools(), messages: [{ role: "user", content: "hi" }] }, false, credentials, "cursor");
      await executor.execute({ model: MODEL, body, stream: false, credentials });
    } catch (error) { observed = error; }
    expect(observed).toMatchObject({ code: "unsupported_parameter", param: "tool_choice" });
    expect(sent).toHaveLength(0);
  });

  it.each([
    ["max_tokens", 64000], ["max_completion_tokens", 64000], ["max_output_tokens", 64000],
    ["temperature", 0], ["top_p", 0.8], ["top_k", 20],
    ["frequency_penalty", 0.5], ["presence_penalty", 0.5], ["repetition_penalty", 1.1],
    ["seed", 42], ["stop", ["END"]], ["stop_sequences", ["END"]], ["n", 2],
  ])("rejects an explicit unrepresentable native generation control before dialing (%s)", async (param, value) => {
    const executor = new CursorExecutor();
    const sent = stubNativeFrames(executor, [AGENT_SUCCESS]);
    let observed;
    try {
      const body = translateRequest(FORMATS.OPENAI, FORMATS.CURSOR, MODEL, { [param]: value, messages: [{ role: "user", content: "hi" }] }, false, credentials, "cursor");
      await executor.execute({ model: MODEL, body, stream: false, credentials });
    } catch (error) { observed = error; }
    expect(observed).toMatchObject({ code: "unsupported_parameter", param });
    expect(sent).toHaveLength(0);
  });

  it("preserves distinct original punctuated call IDs through translateRequest and native continuation", async () => {
    const body = { tools: tools(), messages: [
      { role: "user", content: "Capture both screens." },
      { role: "assistant", content: null, tool_calls: [
        { id: "call:1", type: "function", function: { name: "capture_screen", arguments: '{"screen":1}' } },
        { id: "call/1", type: "function", function: { name: "capture_screen", arguments: '{"screen":2}' } },
      ] },
      { role: "tool", tool_call_id: "call:1", content: [openaiImage(RED_PNG)] },
      { role: "tool", tool_call_id: "call/1", content: [openaiImage(BLUE_PNG)] },
    ] };
    const before = structuredClone(body);
    const wire = await dispatch(body, { integrated: true });
    expect(wire.trailing[0].content.map((call) => call.id)).toEqual(["call:1", "call/1"]);
    expect(wire.trailing.filter((message) => message.role === "tool").map(({ id, content }) => ({ id, content }))).toEqual([
      { id: "call:1", content: [{ type: "image", data: RED_PNG, mimeType: "image/png" }] },
      { id: "call/1", content: [{ type: "image", data: BLUE_PNG, mimeType: "image/png" }] },
    ]);
    expect(body).toEqual(before);
  });

  it("does not fabricate native execution results for an interrupted tool call through translateRequest", async () => {
    const wire = await dispatch({ tools: tools(), messages: [
      { role: "user", content: "Capture the screen." },
      { role: "assistant", content: null, tool_calls: [toolCall()] },
      { role: "user", content: "Cancel that request; describe the previous image instead." },
    ] }, { integrated: true });
    expect(wire.history.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(wire.history[1].content).toEqual([{ type: "tool_call", id: "capture-1", name: "capture_screen", arguments: '{"screen":1}' }]);
    expect(wire.current.text).toBe("Cancel that request; describe the previous image instead.");
  });
});

describe("Cursor native MCP handoff and transport policy", () => {
  it.each([false, true])("hands native parallel MCP calls to the client with original IDs (stream=%s)", async (stream) => {
    const executor = new CursorExecutor();
    const written = [];
    const frames = [TWO_CALLS, MCP_FIRST, MCP_SECOND];
    executor.openAgentHttp2Stream = () => ({
      responseHeaders: Promise.resolve({ ":status": 200 }),
      write(frame) { written.push(Buffer.from(frame)); },
      end() {},
      close() {},
      async read() { return frames.length ? { done: false, value: frames.shift() } : { done: true }; },
    });
    const result = await executor.executeAgent({ model: MODEL, body: { tools: tools(), messages: [{ role: "user", content: "Capture both screens." }] }, stream, credentials });
    const expected = [
      { id: "call_Original_ID-7", type: "function", function: { name: "capture_screen", arguments: '{"screen":1}' } },
      { id: "call_Original_ID-8", type: "function", function: { name: "capture_screen", arguments: '{"screen":2}' } },
    ];
    expect(result.response.status).toBe(200);
    if (stream) {
      const events = (await result.response.text()).split("\n\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).filter((line) => line !== "[DONE]").map(JSON.parse);
      expect(events.some((event) => event.error)).toBe(false);
      expect(events.flatMap((event) => event.choices?.[0]?.delta?.tool_calls || []).map(({ index, ...call }) => call)).toEqual(expected);
      expect(events.find((event) => event.choices?.[0]?.finish_reason)?.choices[0].finish_reason).toBe("tool_calls");
    } else {
      const payload = await result.response.json();
      expect(payload.choices[0].message.tool_calls).toEqual(expected);
      expect(payload.choices[0].finish_reason).toBe("tool_calls");
    }
    expect(written).toHaveLength(1); // No fabricated upstream MCP success/error reply.
    const run = child(readProto(written[0].subarray(5)), 1);
    const declared = repeated(child(run, 4), 1);
    expect(declared.map((tool) => fieldText(tool, 1))).toEqual(["capture_screen"]);
    expect(declared.map((tool) => fieldText(tool, 4))).toEqual(["kitsunerouter"]);

    // The next API request carries actual client execution results, not a fake
    // result on the closed run. Its images must remain attached to these IDs.
    const followup = await dispatch({ tools: tools(), messages: [
      { role: "user", content: "Capture both screens." },
      { role: "assistant", content: null, tool_calls: expected },
      { role: "tool", tool_call_id: expected[0].id, content: [openaiImage(RED_PNG)] },
      { role: "tool", tool_call_id: expected[1].id, content: [openaiImage(BLUE_PNG)] },
    ] });
    expect(followup.trailing.filter((message) => message.role === "tool").map(({ id, content }) => ({ id, content }))).toEqual([
      { id: "call_Original_ID-7", content: [{ type: "image", data: RED_PNG, mimeType: "image/png" }] },
      { id: "call_Original_ID-8", content: [{ type: "image", data: BLUE_PNG, mimeType: "image/png" }] },
    ]);
  });

  it.each([
    ["kitsunerouter", "capture_screen", "00000000371235084d7a0f707265636865636b2d6e6174697665d2021f0a0d6b697473756e65726f75746572120e636170747572655f73637265656e", true],
    ["kitsunerouter", "not_declared", "00000000351233084d7a0f707265636865636b2d6e6174697665d2021d0a0d6b697473756e65726f75746572120c6e6f745f6465636c61726564", false],
    ["zenrouter", "capture_screen", "00000000331231084d7a0f707265636865636b2d6e6174697665d2021b0a097a656e726f75746572120e636170747572655f73637265656e", false],
  ])("answers native MCP allowlist precheck only for a client-declared tool (%s/%s)", async (_provider, _name, hex, allowed) => {
    // ExecServerMessage.mcp_allowlist_precheck_args=42 -> provider_identifier=1,
    // tool_name=2. ExecClientMessage.mcp_allowlist_precheck_result=42 -> allowlisted=1.
    // The local provider identity must match the advertised tool definition;
    // knowing a declared tool's name under another provider is not permission.
    const executor = new CursorExecutor();
    const written = [];
    const queue = [Buffer.from("00000000161214085a7a0e636f6e746578742d6e61746976655200", "hex"), Buffer.from(hex, "hex"), AGENT_SUCCESS];
    executor.openAgentHttp2Stream = () => ({
      responseHeaders: Promise.resolve({ ":status": 200 }),
      write(frame) { written.push(Buffer.from(frame)); },
      end() {}, close() {},
      async read() { return queue.length ? { done: false, value: queue.shift() } : { done: true }; },
    });
    const result = await executor.executeAgent({ model: MODEL, body: { tools: tools(), messages: [{ role: "user", content: "hi" }] }, stream: false, credentials });
    expect(result.response.status).toBe(200);
    expect((await result.response.json()).choices[0].message.content).toBe("ok");
    expect(written).toHaveLength(3);
    const contextReply = child(readProto(written[1].subarray(5)), 2);
    expect(contextReply.get(1)).toEqual([90]);
    expect(fieldText(contextReply, 15)).toBe("context-native");
    const precheckReply = child(readProto(written[2].subarray(5)), 2);
    expect(precheckReply.get(1)).toEqual([77]);
    expect(fieldText(precheckReply, 15)).toBe("precheck-native");
    expect(child(precheckReply, 42).get(1)).toEqual([allowed ? 1 : 0]);
    expect(precheckReply.has(11), "a precheck is not an invented MCP execution result").toBe(false);
  });

  it.each([
    { strictProxy: true },
    { enabled: true, url: "http://proxy.example.invalid:8080", strictProxy: true },
    { connectionProxyEnabled: true, connectionProxyUrl: "socks5://proxy.example.invalid:1080" },
    { vercelRelayUrl: "https://relay.example.invalid" },
  ])("rejects an unsupported required proxy/relay before opening a direct native session (%j)", async (proxyOptions) => {
    vi.stubEnv("HTTPS_PROXY", "");
    vi.stubEnv("https_proxy", "");
    vi.stubEnv("HTTP_PROXY", "");
    vi.stubEnv("http_proxy", "");
    vi.stubEnv("ALL_PROXY", "");
    vi.stubEnv("all_proxy", "");
    const executor = new CursorExecutor();
    let directDials = 0;
    executor.openAgentHttp2Stream = () => {
      directDials++;
      return { responseHeaders: Promise.resolve({ ":status": 200 }), write() {}, end() {}, close() {}, async read() { return { done: true }; } };
    };
    await expect(executor.executeAgent({ model: MODEL, body: { messages: [{ role: "user", content: "hi" }] }, stream: false, credentials, proxyOptions })).rejects.toThrow(/proxy|relay/i);
    expect(directDials).toBe(0);
  });

  it.each(["connection", "environment"])("honors an effective %s NO_PROXY bypass", async (kind) => {
    const executor = new CursorExecutor();
    executor.buildUrl = () => "https://agent.example.invalid/agent.v1.AgentService/Run";
    let directDials = 0;
    let read = false;
    executor.openAgentHttp2Stream = () => {
      directDials++;
      return { responseHeaders: Promise.resolve({ ":status": 200 }), write() {}, end() {}, close() {}, async read() {
        if (read) return { done: true };
        read = true;
        return { done: false, value: END_SUCCESS };
      } };
    };
    if (kind === "environment") {
      vi.stubEnv("HTTPS_PROXY", "http://proxy.example.invalid:8080");
      vi.stubEnv("NO_PROXY", ".example.invalid");
    }
    const proxyOptions = kind === "connection" ? { enabled: true, url: "http://proxy.example.invalid:8080", noProxy: ".example.invalid" } : null;
    const result = await executor.executeAgent({ model: MODEL, body: { messages: [{ role: "user", content: "hi" }] }, stream: false, credentials, proxyOptions });
    expect(result.response.status).toBe(200);
    expect(directDials).toBe(1);
  });
});

describe("Cursor native HTTP/2 loopback contract", () => {
  it("sends typed media on a real native stream and decodes fragmented responses", async () => {
    const server = createServer();
    const sessions = new Set();
    const requests = [];
    server.on("session", (session) => {
      sessions.add(session);
      session.on("close", () => sessions.delete(session));
    });
    server.on("stream", (stream, headers) => {
      const chunks = [];
      let size = 0;
      let replied = false;
      stream.on("data", (chunk) => {
        chunks.push(chunk);
        size += chunk.length;
        if (replied || size < 5) return;
        const frame = Buffer.concat(chunks);
        if (frame.length < frame.readUInt32BE(1) + 5) return;
        replied = true;
        requests.push({ headers, frame });
        stream.respond({ ":status": 200, "content-type": "application/connect+proto" });
        stream.write(AGENT_SUCCESS.subarray(0, 3));
        stream.end(AGENT_SUCCESS.subarray(3));
      });
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const executor = new CursorExecutor();
      executor.buildUrl = () => `http://127.0.0.1:${server.address().port}/agent.v1.AgentService/Run`;
      const body = { messages: [
        { role: "user", content: [{ type: "text", text: "Remember the red panel." }, openaiImage(RED_PNG)] },
        { role: "assistant", content: "Remembered." },
        { role: "user", content: [{ type: "text", text: "Compare the blue panel." }, openaiImage(BLUE_PNG)] },
      ] };
      const translated = openaiToCursorRequest(MODEL, body, false, credentials);
      const result = await executor.execute({ model: MODEL, body: translated, stream: false, credentials,
        proxyOptions: { enabled: true, url: "http://unused.example.invalid:8080" } });
      expect(result.response.status).toBe(200);
      expect((await result.response.json()).choices[0].message.content).toBe("ok");
      expect(requests).toHaveLength(1);
      expect(requests[0].headers[":path"]).toBe("/agent.v1.AgentService/Run");
      const wire = readAgentRun(requests[0].frame);
      expect(wire.current.images[0].data).toEqual(Buffer.from(BLUE_PNG, "base64"));
      expect(wire.history[0].content).toContainEqual({ type: "image", data: RED_PNG, mimeType: "image/png" });
      expectNoImageProse(wire);
    } finally {
      for (const session of sessions) session.destroy();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("Cursor vision at the actual upstream protobuf boundary", () => {
  it("sends text and multiple PNGs as SelectedImage raw bytes rather than dropping them", async () => {
    const body = { messages: [{ role: "user", content: [{ type: "text", text: "Compare the screenshots." }, openaiImage(RED_PNG), openaiImage(BLUE_PNG)] }] };
    const wire = await dispatch(body);
    expect(wire.current.text).toBe("Compare the screenshots.");
    expect(wire.current.images.map(({ data, mimeType }) => ({ data, mimeType }))).toEqual([
      { data: Buffer.from(RED_PNG, "base64"), mimeType: "image/png" },
      { data: Buffer.from(BLUE_PNG, "base64"), mimeType: "image/png" },
    ]);
    expect(wire.current.images[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(wire.current.images[1].id).not.toBe(wire.current.images[0].id);
    expectNoImageProse(wire);
  });

  it("keeps an image-only user turn instead of replacing it with Continue", async () => {
    const wire = await dispatch({ messages: [{ role: "user", content: [openaiImage(RED_PNG)] }] });
    expect(wire.current.images.map((image) => image.data)).toEqual([Buffer.from(RED_PNG, "base64")]);
    expect(wire.current.text).toBe("");
    expectNoImageProse(wire);
  });

  it("preserves user images in native typed history across later turns", async () => {
    const wire = await dispatch({ messages: [
      { role: "user", content: [{ type: "text", text: "Read both panels." }, openaiImage(RED_PNG), openaiImage(BLUE_PNG)] },
      { role: "assistant", content: "One panel is red and the other blue." },
      { role: "user", content: "Which panel is taller?" },
    ] });
    expect(wire.current.text).toBe("Which panel is taller?");
    expect(wire.history).toEqual([
      { role: "user", content: [{ type: "text", text: "Read both panels." }, { type: "image", data: RED_PNG, mimeType: "image/png" }, { type: "image", data: BLUE_PNG, mimeType: "image/png" }] },
      { role: "assistant", content: [{ type: "text", text: "One panel is red and the other blue." }] },
    ]);
    expectNoImageProse(wire);
  });

  it.each(["openai", "claude"])("keeps an image-only %s tool result paired with its structured tool call", async (format) => {
    const messages = [
      { role: "user", content: "Capture the screen." },
      { role: "assistant", content: null, tool_calls: [toolCall()] },
      format === "openai"
        ? { role: "tool", tool_call_id: "capture-1", content: [openaiImage(RED_PNG)] }
        : { role: "user", content: [{ type: "tool_result", tool_use_id: "capture-1", content: [claudeImage(RED_PNG)] }] },
    ];
    const wire = await dispatch({ tools: tools(), messages });
    expect(wire.current.text).toBe("Capture the screen.");
    expect(wire.trailing).toEqual([
      { role: "assistant", content: [{ type: "tool_call", id: "capture-1", name: "capture_screen", arguments: '{"screen":1}' }] },
      { role: "tool", id: "capture-1", name: "capture_screen", content: [{ type: "image", data: RED_PNG, mimeType: "image/png" }] },
    ]);
    expectNoImageProse(wire);
  });

  it("keeps compacted tool text and multiple result PNGs in the next turn's typed history", async () => {
    const log = Array.from({ length: 80 }, (_, i) => `src/panel.js:${i + 1}:const panel${i} = "screen capture result with detailed layout data";`).join("\n");
    const body = { tools: tools(), messages: [
      { role: "user", content: "Capture the panels." },
      { role: "assistant", content: null, tool_calls: [toolCall()] },
      { role: "tool", tool_call_id: "capture-1", content: [{ type: "text", text: log }, openaiImage(RED_PNG), claudeImage(BLUE_PNG)] },
      { role: "assistant", content: "Captured." },
      { role: "user", content: "Compare their heights." },
    ] };
    const stats = compressMessages(body, true);
    expect(stats.hits.length, "fixture must exercise real compaction before translation").toBeGreaterThan(0);
    const compressedText = body.messages[2].content[0].text;
    expect(compressedText.length).toBeLessThan(log.length);
    const wire = await dispatch(body);
    expect(wire.history[2]).toEqual({ role: "tool", id: "capture-1", name: "capture_screen", content: [
      { type: "text", text: compressedText },
      { type: "image", data: RED_PNG, mimeType: "image/png" },
      { type: "image", data: BLUE_PNG, mimeType: "image/png" },
    ] });
    expectNoImageProse(wire);
  });

  it("does not mutate a caller's frozen media conversation during execution", async () => {
    const body = { messages: [
      { role: "user", content: [{ type: "text", text: "Remember this screenshot." }, openaiImage(RED_PNG)] },
      { role: "assistant", content: "Remembered." },
      { role: "user", content: [{ type: "text", text: "Now compare it." }, openaiImage(BLUE_PNG)] },
    ] };
    const before = structuredClone(body);
    deepFreeze(body);
    const wire = await dispatch(body);
    expect(body).toEqual(before);
    expect(wire.current.images[0]?.data).toEqual(Buffer.from(BLUE_PNG, "base64"));
    expect(wire.history[0].content).toContainEqual({ type: "image", data: RED_PNG, mimeType: "image/png" });
  });

  it("detaches mutable tool schema and tool-call containers from the caller", async () => {
    const body = { tools: tools(), messages: [
      { role: "user", content: [openaiImage(RED_PNG)] },
      { role: "assistant", content: null, tool_calls: [toolCall()] },
      { role: "tool", tool_call_id: "capture-1", content: [openaiImage(BLUE_PNG)] },
    ] };
    const before = structuredClone(body);
    const translated = await openaiToCursorRequest(MODEL, body, false, credentials);
    translated.tools[0].function.parameters.properties.screen.type = "string";
    const assistant = translated.messages.find((message) => message.tool_calls?.length);
    assistant.tool_calls[0].function.arguments = '{"screen":2}';
    expect(body).toEqual(before);
  });
});
