import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const socket = vi.hoisted(() => ({ origin: "", requests: [], reply: null }));
// Isolate persistence only: no production DB, request log files, or credentials.
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({
  getDeclaredModelCaps: vi.fn(async () => undefined),
}));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest: vi.fn(), logRawRequest: vi.fn(), logTargetRequest: vi.fn(),
  logOpenAIRequest: vi.fn(), logProviderResponse: vi.fn(), logConvertedResponse: vi.fn(),
  appendProviderChunk: vi.fn(), appendConvertedChunk: vi.fn(), appendOpenAIChunk: vi.fn(),
  logError: vi.fn(),
}) }));
// Change the destination host only. Registry transport selection, DefaultExecutor,
// request/response translators, JSON serialization, fetch, and HTTP sockets are real.
vi.mock("../../open-sse/executors/index.js", async () => {
  const { DefaultExecutor } = await import("../../open-sse/executors/default.js");
  return { getExecutor(provider) {
    const executor = new DefaultExecutor(provider);
    const buildUrl = executor.buildUrl.bind(executor);
    executor.buildUrl = (...args) => {
      const target = new URL(buildUrl(...args));
      return `${socket.origin}/${provider}${target.pathname}${target.search}`;
    };
    return executor;
  } };
});

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { createSSETransformStreamWithLogger } from "../../open-sse/utils/stream.js";
import { initState, translateResponse } from "../../open-sse/translator/index.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";

const LONG_A = "mcp__cloudflare_observability_plugin__search_logs_by_filter_and_timestamp_range_query_v1";
const LONG_B = "mcp__cloudflare_observability_plugin__search_logs_by_filter_and_timestamp_range_query_v2";
// Independent upstream fixtures, not names computed by the compressor under test.
const SHORT_A = "mcp__cloudflare_observability_plugin__search_logs_by_fi_3e862010";
const SHORT_B = "mcp__cloudflare_observability_plugin__search_logs_by_fi_3b20b59d";
const ARGS_A = '{ "city": "München", "value": 1e3, "path": "C:\\\\tmp" }';
const ARGS_B = '{"node":{"node":1}}';
const CALLS = [
  { id: "call_alpha_TSIG_YzJsbkxXOXlhV2RwYm1Gcw", rawId: "call_alpha", signature: "c2lnLW9yaWdpbmFs", name: "lookup", arguments: ARGS_A },
  { id: "call_beta", rawId: "call_beta", name: "lookup_many", arguments: ARGS_B },
];
const CHAT_USAGE = { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 };
const NATIVE_USAGE = { input_tokens: 11, output_tokens: 7, total_tokens: 18 };
const GEMINI_USAGE = { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 };
const PROGRAM = "const x = await tools.shell({command: 'pwd'});\nreturn x;";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
const IMAGE = { type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } };
const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

let server;
beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    const bytes = [];
    for await (const chunk of request) bytes.push(chunk);
    const received = { path: request.url, body: JSON.parse(Buffer.concat(bytes).toString("utf8")), headers: request.headers };
    socket.requests.push(received);
    const fixture = typeof socket.reply === "function" ? socket.reply(received) : socket.reply;
    response.writeHead(200, { "content-type": fixture.sse ? "text/event-stream" : "application/json" });
    if (fixture.sse) {
      for (const chunk of fixture.chunks || [fixture.body]) response.write(chunk);
      response.end();
    } else response.end(JSON.stringify(fixture.body));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  socket.origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});
beforeEach(() => {
  vi.clearAllMocks();
  socket.requests = [];
  socket.reply = null;
});

const dataFrame = data => `data: ${JSON.stringify(data)}\n\n`;
const eventFrame = data => `event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`;
const chatChunk = (delta, finish_reason = null) => ({
  id: "chatcmpl-stream-contract", object: "chat.completion.chunk", created: 1700000000, model: "wire-model",
  choices: [{ index: 0, delta, finish_reason }],
});
function chatWire(calls = CALLS, fragmentedNames = false) {
  const chunks = [dataFrame(chatChunk({ role: "assistant" }))];
  chunks.push(dataFrame(chatChunk({ tool_calls: calls.map((call, index) => ({
    index, id: call.id, type: "function", function: { name: fragmentedNames ? call.name.slice(0, 4) : call.name, arguments: "" },
  })) })));
  if (fragmentedNames) chunks.push(dataFrame(chatChunk({ tool_calls: calls.map((call, index) => ({
    index, function: { name: call.name.slice(4), arguments: "" },
  })) })));
  // Both starts precede all arguments; argument deltas then interleave by call index.
  const fragments = calls.map(call => call.arguments === ARGS_B
    ? ['{"node":', '{"node":1}}']
    : [call.arguments.slice(0, 13), call.arguments.slice(13)]);
  for (let part = 0; part < 2; part++) {
    for (let index = calls.length - 1; index >= 0; index--) chunks.push(dataFrame(chatChunk({
      tool_calls: [{ index, function: { arguments: fragments[index][part] } }],
    })));
  }
  chunks.push(dataFrame(chatChunk({}, "tool_calls")));
  chunks.push(dataFrame({ id: "chatcmpl-stream-contract", choices: [], usage: CHAT_USAGE }));
  chunks.push("data: [DONE]\n\n");
  return chunks.join("");
}
function claudeWire(calls = CALLS, stopReason = "tool_use") {
  const events = [{ type: "message_start", message: {
    id: "msg_stream_contract", type: "message", role: "assistant", model: "wire-model", content: [],
    stop_reason: null, stop_sequence: null, usage: { input_tokens: 11, output_tokens: 0 },
  } }];
  calls.forEach((call, index) => events.push(
    { type: "content_block_start", index, content_block: { type: "tool_use", id: call.id, name: call.name, input: {}, caller: { type: "direct" } } },
    { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: call.arguments.slice(0, 13) } },
    { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: call.arguments.slice(13) } },
    { type: "content_block_stop", index },
  ));
  events.push({ type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 7 } }, { type: "message_stop" });
  return events.map(eventFrame).join("");
}
function responseItems(calls = CALLS) {
  return calls.map((call, index) => ({
    type: "function_call", id: `fc_contract_${index}`, status: "completed", call_id: call.id, name: call.name, arguments: call.arguments,
  }));
}
function responseObject(output = responseItems(), extra = {}) {
  return { id: "resp_stream_contract", object: "response", created_at: 1700000000, model: "wire-model", status: "completed", output, usage: NATIVE_USAGE, ...extra };
}
function responsesWire(calls = CALLS) {
  const items = responseItems(calls);
  const events = [{ type: "response.created", response: { id: "resp_stream_contract", object: "response", status: "in_progress", output: [] } }];
  items.forEach((item, output_index) => events.push({ type: "response.output_item.added", output_index, item: { ...item, status: "in_progress", arguments: "" } }));
  for (let part = 0; part < 2; part++) {
    for (let index = items.length - 1; index >= 0; index--) {
      const item = items[index];
      events.push({ type: "response.function_call_arguments.delta", item_id: item.id, output_index: index, delta: part === 0 ? item.arguments.slice(0, 13) : item.arguments.slice(13) });
    }
  }
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    events.push({ type: "response.function_call_arguments.done", item_id: item.id, output_index: index, arguments: item.arguments });
    events.push({ type: "response.output_item.done", output_index: index, item });
  }
  events.push({ type: "response.completed", response: responseObject(items) });
  return events.map(eventFrame).join("");
}
function frames(wire) {
  return wire.replace(/\r\n/g, "\n").split("\n\n").flatMap(frame => {
    const lines = frame.split("\n");
    const payload = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!payload || payload === "[DONE]") return [];
    return [{ event: lines.find(line => line.startsWith("event:"))?.slice(6).trim(), data: JSON.parse(payload) }];
  });
}
function collectChatCalls(wire) {
  const calls = new Map();
  for (const { data } of frames(wire)) for (const choice of data.choices || []) for (const call of choice.delta?.tool_calls || []) {
    const key = `${choice.index ?? 0}:${call.index ?? 0}`;
    const entry = calls.get(key) || { id: "", name: "", arguments: "" };
    if (call.id) entry.id = call.id;
    entry.name += call.function?.name || "";
    entry.arguments += call.function?.arguments || "";
    calls.set(key, entry);
  }
  return [...calls.values()];
}
function assertChat(wire, expected = CALLS, finish = "tool_calls") {
  expect(collectChatCalls(wire)).toEqual(expected.map(call => ({ id: call.id, name: call.name, arguments: call.arguments })));
  const data = frames(wire).map(frame => frame.data);
  expect(data.flatMap(chunk => chunk.choices || []).filter(choice => choice.finish_reason).map(choice => choice.finish_reason)).toEqual([finish]);
  expect(data.filter(chunk => chunk.usage).at(-1)?.usage).toMatchObject(CHAT_USAGE);
  expect(wire.match(/data: \[DONE\]/g)).toHaveLength(1);
  expect(data.some(chunk => chunk.type?.startsWith("response.") || chunk.type === "message_start")).toBe(false);
}
function assertMessages(wire, expected = CALLS) {
  const parsed = frames(wire);
  expect(parsed.every(frame => frame.event === frame.data.type)).toBe(true);
  const data = parsed.map(frame => frame.data);
  expect(data[0].type).toBe("message_start");
  const starts = data.filter(chunk => chunk.type === "content_block_start" && chunk.content_block?.type === "tool_use");
  expect(starts.map(chunk => ({ id: chunk.content_block.id, name: chunk.content_block.name }))).toEqual(expected.map(call => ({ id: call.id, name: call.name })));
  starts.forEach((start, index) => {
    const args = data.filter(chunk => chunk.type === "content_block_delta" && chunk.index === start.index && chunk.delta?.type === "input_json_delta").map(chunk => chunk.delta.partial_json).join("");
    expect(args).toBe(expected[index].arguments);
    expect(data.filter(chunk => chunk.type === "content_block_stop" && chunk.index === start.index)).toHaveLength(1);
  });
  const terminal = data.filter(chunk => chunk.type === "message_delta");
  expect(terminal).toMatchObject([{ delta: { stop_reason: "tool_use" }, usage: { output_tokens: 7 } }]);
  expect(terminal[0].usage.input_tokens ?? data[0].message.usage.input_tokens).toBe(11);
  expect(data.filter(chunk => chunk.type === "message_stop")).toHaveLength(1);
  expect(wire).not.toContain("[DONE]");
  expect(data.some(chunk => chunk.choices || chunk.response)).toBe(false);
}
function assertResponses(wire, expected = CALLS) {
  const parsed = frames(wire);
  expect(parsed.every(frame => frame.event === frame.data.type)).toBe(true);
  const data = parsed.map(frame => frame.data);
  const items = data.filter(chunk => chunk.type === "response.output_item.done").sort((left, right) => left.output_index - right.output_index).map(chunk => chunk.item);
  expect(items.map(item => ({ id: item.call_id, name: item.name, arguments: item.arguments }))).toEqual(expected.map(call => ({ id: call.id, name: call.name, arguments: call.arguments })));
  for (const item of items) {
    const deltas = data.filter(chunk => chunk.type === "response.function_call_arguments.delta" && chunk.item_id === item.id);
    expect(deltas.map(chunk => chunk.delta).join("")).toBe(item.arguments);
  }
  const terminal = data.filter(chunk => ["response.completed", "response.incomplete", "response.failed"].includes(chunk.type));
  expect(terminal).toHaveLength(1);
  expect(terminal[0]).toMatchObject({ type: "response.completed", response: { status: "completed", usage: NATIVE_USAGE } });
  expect(terminal[0].response.output).toEqual(items);
  expect(data.some(chunk => chunk.choices || chunk.type === "message_start")).toBe(false);
}
function clientBody(source, names = CALLS.map(call => call.name), prompt = "Run the tool contract.") {
  const schema = { type: "object", properties: { city: { type: "string" }, node: { type: "object" } } };
  if (source === F.CLAUDE) return { max_tokens: 2048, messages: [{ role: "user", content: [{ type: "text", text: prompt }] }], tools: names.map(name => ({ name, input_schema: schema })) };
  if (source === F.OPENAI_RESPONSES) return { input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }], tools: names.map(name => ({ type: "function", name, parameters: schema })) };
  if (source === F.GEMINI) return { contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ functionDeclarations: names.map(name => ({ name, parameters: schema })) }] };
  return { messages: [{ role: "user", content: prompt }], tools: names.map(name => ({ type: "function", function: { name, parameters: schema } })) };
}
async function dispatch(provider, model, source, body = clientBody(source), stream = true, credentials = { apiKey: "offline-stream-contract" }) {
  return handleChatCore({
    body: { model, stream, ...body }, modelInfo: { provider, model }, sourceFormatOverride: source,
    credentials, connectionId: `stream-contract-${provider}`, log,
    clientRawRequest: { endpoint: source === F.CLAUDE ? "/v1/messages" : source === F.OPENAI_RESPONSES ? "/v1/responses" : "/v1/chat/completions", body, headers: {} },
    rtkEnabled: false, headroomEnabled: false, pxpipeEnabled: false, cavemanEnabled: false, ponytailEnabled: false,
  });
}
async function consume(wire, providerFormat, clientFormat, { toolNameMap = null, customToolNames = null } = {}) {
  const encoder = new TextEncoder();
  const transform = createSSETransformStreamWithLogger(providerFormat, clientFormat, "offline-contract", null, toolNameMap, "wire-model", null, {}, null, null, customToolNames);
  const bytes = encoder.encode(wire);
  const source = new ReadableStream({ start(controller) {
    // Deliberately split UTF-8 bytes and SSE lines, not just whole JSON frames.
    for (let offset = 0; offset < bytes.length; offset += 31) controller.enqueue(bytes.subarray(offset, offset + 31));
    controller.close();
  } });
  return new Response(source.pipeThrough(transform)).text();
}

describe("real same-format stream consumer wiring", () => {
  it.each([false, true])("restores long parallel Chat tool names with fragmented=%s deltas", async fragmented => {
    const expected = CALLS.map((call, index) => ({ ...call, name: index === 0 ? LONG_A : LONG_B }));
    const upstream = CALLS.map((call, index) => ({ ...call, name: index === 0 ? SHORT_A : SHORT_B }));
    socket.reply = { sse: true, body: chatWire(upstream, fragmented) };
    const result = await dispatch("openai", "gpt-5.5", F.OPENAI, clientBody(F.OPENAI, [LONG_A, LONG_B]));
    expect(result.success).toBe(true);
    const wire = await result.response.text();
    assertChat(wire, expected);
    expect(socket.requests[0].path).toBe("/openai/v1/chat/completions");
    expect(socket.requests[0].body.tools.map(tool => tool.function.name)).toEqual([SHORT_A, SHORT_B]);
  });

  it("keeps fragmented aliases and reused tool indices isolated across simultaneous and later requests", async () => {
    socket.reply = ({ body }) => ({ sse: true, body: chatWire([
      { ...CALLS[0], name: body.messages[0].content === "request-one" ? SHORT_A : SHORT_B },
    ], true) });
    const [one, two] = await Promise.all([
      dispatch("openai", "gpt-5.5", F.OPENAI, clientBody(F.OPENAI, [LONG_A], "request-one")),
      dispatch("openai", "gpt-5.5", F.OPENAI, clientBody(F.OPENAI, [LONG_B], "request-two")),
    ]);
    const [wireOne, wireTwo] = await Promise.all([one.response.text(), two.response.text()]);
    assertChat(wireOne, [{ ...CALLS[0], name: LONG_A }]);
    assertChat(wireTwo, [{ ...CALLS[0], name: LONG_B }]);
    socket.reply = { sse: true, body: chatWire([{ ...CALLS[0], name: SHORT_A }]) };
    const later = await dispatch("openai", "gpt-5.5", F.OPENAI, clientBody(F.OPENAI, [SHORT_A]));
    assertChat(await later.response.text(), [{ ...CALLS[0], name: SHORT_A }]);
  });

  it.each([
    ["compressed", [LONG_A, "lookup_many"], [SHORT_A, "lookup_many"], { apiKey: "offline-claude-fixture" }],
    ["cloaked", ["lookup", "lookup_many"], ["lookup_ide", "lookup_many_ide"], { accessToken: "sk-ant-oat-offline-fixture" }],
  ])("restores %s complete native Claude names without changing fields or injecting Chat terminators", async (_kind, names, upstreamNames, credentials) => {
    const upstream = CALLS.map((call, index) => ({ ...call, name: upstreamNames[index] }));
    const expected = CALLS.map((call, index) => ({ ...call, name: names[index] }));
    socket.reply = { sse: true, body: claudeWire(upstream) };
    const result = await dispatch("claude", "claude-sonnet-4-6", F.CLAUDE, clientBody(F.CLAUDE, names), true, credentials);
    const wire = await result.response.text();
    assertMessages(wire, expected);
    const starts = frames(wire).filter(frame => frame.data.type === "content_block_start");
    expect(starts.every(frame => frame.data.content_block.caller?.type === "direct")).toBe(true);
    expect(socket.requests[0].body.tools.slice(0, 2).map(tool => tool.name)).toEqual(upstreamNames);
  });

  it.each([true, false])("restores native Responses function/custom names and full envelopes with stream=%s on a per-model endpoint", async stream => {
    const functionItem = { type: "function_call", id: "fc_native", call_id: CALLS[0].id, name: SHORT_A, arguments: ARGS_A, status: "completed" };
    const customItem = { type: "custom_tool_call", id: "ctc_native", call_id: "call_custom", name: SHORT_B, input: PROGRAM, status: "completed" };
    const hosted = { type: "web_search_call", id: "ws_native", status: "completed", action: { type: "search", queries: ["native envelope"] } };
    const refusal = { type: "message", id: "msg_refusal", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "Cannot disclose that." }] };
    const native = responseObject([functionItem, customItem, hosted, refusal], { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, metadata: { contract: "native" } });
    const events = [
      { type: "response.created", response: { id: native.id, status: "in_progress", output: [] } },
      { type: "response.output_item.added", output_index: 0, item: { ...functionItem, status: "in_progress", arguments: "" } },
      { type: "response.function_call_arguments.delta", item_id: functionItem.id, output_index: 0, delta: ARGS_A },
      { type: "response.output_item.done", output_index: 0, item: functionItem },
      { type: "response.output_item.added", output_index: 1, item: { ...customItem, status: "in_progress", input: "" } },
      { type: "response.custom_tool_call_input.delta", item_id: customItem.id, output_index: 1, delta: PROGRAM },
      { type: "response.custom_tool_call_input.done", item_id: customItem.id, output_index: 1, input: PROGRAM },
      { type: "response.output_item.done", output_index: 1, item: customItem },
      { type: "response.incomplete", response: native },
    ];
    socket.reply = stream ? { sse: true, body: events.map(eventFrame).join("") } : { body: native };
    const body = clientBody(F.OPENAI_RESPONSES, [LONG_A]);
    body.tools.push({ type: "custom", name: LONG_B, description: "Execute a program", format: { type: "text" } });
    body.previous_response_id = "resp_previous_contract";
    const result = await dispatch("opencode-go", "gpt-6-luna", F.OPENAI_RESPONSES, body, stream);
    expect(result.success).toBe(true);
    const output = stream ? frames(await result.response.text()).map(frame => frame.data) : null;
    const final = stream ? output.find(event => event.type === "response.incomplete")?.response : await result.response.json();
    expect(final).toEqual({ ...native, output: [{ ...functionItem, name: LONG_A }, { ...customItem, name: LONG_B }, hosted, refusal] });
    if (stream) {
      expect(output.filter(event => event.type === "response.output_item.added").map(event => event.item.name)).toEqual([LONG_A, LONG_B]);
      expect(output.find(event => event.type === "response.custom_tool_call_input.done")).toMatchObject({ input: PROGRAM, item_id: "ctc_native", output_index: 1 });
      expect(output.some(event => event.choices)).toBe(false);
    }
    expect(socket.requests[0].path).toBe("/opencode-go/zen/go/v1/responses");
    expect(socket.requests[0].body.previous_response_id).toBe("resp_previous_contract");
  });
});

describe("declared GPT Responses, Claude Messages and CN Chat transports over HTTP", () => {
  const targets = [
    { provider: "openai", model: "gpt-6.1-sol", format: F.OPENAI_RESPONSES, path: "/openai/v1/responses" },
    { provider: "claude", model: "claude-sonnet-4-6", format: F.CLAUDE, path: "/claude/v1/messages?beta=true" },
    { provider: "minimax-cn", model: "MiniMax-M3", format: F.OPENAI, path: "/minimax-cn/v1/chat/completions" },
  ];
  for (const target of targets) for (const client of [F.OPENAI, F.CLAUDE, F.OPENAI_RESPONSES]) {
    it(`${target.provider}/${target.model} returns ${client} tool envelopes from its selected transport`, async () => {
      // MiniMax supports native Messages as well as Chat; Responses clients use its Messages fallback.
      const format = target.provider === "minimax-cn" && client !== F.OPENAI ? F.CLAUDE : target.format;
      socket.reply = { sse: true, body: format === F.OPENAI ? chatWire() : format === F.CLAUDE ? claudeWire() : responsesWire() };
      const result = await dispatch(target.provider, target.model, client);
      expect(result.success).toBe(true);
      const wire = await result.response.text();
      if (client === F.OPENAI) assertChat(wire);
      else if (client === F.CLAUDE) assertMessages(wire);
      else assertResponses(wire);
      const request = socket.requests[0];
      expect(request.path).toBe(target.provider === "minimax-cn" && client !== F.OPENAI ? "/minimax-cn/anthropic/v1/messages?beta=true" : target.path);
      if (format === F.OPENAI_RESPONSES) {
        expect(Array.isArray(request.body.input)).toBe(true);
        expect(request.body).not.toHaveProperty("messages");
      } else {
        expect(Array.isArray(request.body.messages)).toBe(true);
        expect(request.body).not.toHaveProperty("input");
      }
    });
  }

  it("replays existing native DeepSeek Responses continuity without manufacturing reasoning input", async () => {
    const input = [
      { type: "function_call", id: "fc_replay", call_id: "call_replay", name: "lookup", arguments: '{"key":"value"}' },
      { type: "function_call_output", call_id: "call_replay", output: "found" },
      { role: "user", content: [{ type: "input_text", text: "Continue from the previous response." }] },
    ];
    socket.reply = { body: responseObject([{ type: "message", id: "msg_replayed", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Continued.", annotations: [] }] }]) };
    const result = await dispatch("opencode-go", "deepseek-v4-pro", F.OPENAI_RESPONSES, {
      input, previous_response_id: "resp_previous_deepseek", store: false, reasoning: { effort: "high" },
      tools: [{ type: "function", name: "lookup", parameters: { type: "object", properties: { key: { type: "string" } } } }],
    }, false);
    expect(result.success).toBe(true);
    expect((await result.response.json()).output[0].content[0].text).toBe("Continued.");
    expect(socket.requests[0].path).toBe("/opencode-go/zen/go/v1/responses");
    expect(socket.requests[0].body).toMatchObject({ input, previous_response_id: "resp_previous_deepseek", store: false, reasoning: { effort: "high" } });
    expect(socket.requests[0].body.input).toHaveLength(3);
    expect(socket.requests[0].body).not.toHaveProperty("messages");
  });
});

describe("registered streaming tool argument and identity contracts", () => {
  it.each([F.CLAUDE, F.OPENAI_RESPONSES])("waits for a complete fragmented Chat name before announcing a native %s tool", async client => {
    const wire = await consume(chatWire(CALLS, true), F.OPENAI, client);
    if (client === F.CLAUDE) assertMessages(wire);
    else assertResponses(wire);
  });

  it("does not replace real repeated JSON argument prefixes with a guessed cumulative snapshot", async () => {
    const wire = await consume(chatWire([CALLS[1]]), F.OPENAI, F.CLAUDE);
    assertMessages(wire, [CALLS[1]]);
  });

  it.each([F.OPENAI, F.CLAUDE])("pairs interleaved Responses argument deltas by item identity for %s clients", async client => {
    const wire = await consume(responsesWire(), F.OPENAI_RESPONSES, client);
    if (client === F.OPENAI) assertChat(wire);
    else assertMessages(wire);
  });

  it.each([F.OPENAI, F.CLAUDE])("uses a complete Responses tool snapshot exactly once when no argument delta exists for %s", async client => {
    const item = responseItems([CALLS[0]])[0];
    const wire = [
      { type: "response.created", response: { id: "resp_snapshot", status: "in_progress" } },
      { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", arguments: "" } },
      { type: "response.function_call_arguments.done", item_id: item.id, output_index: 0, arguments: ARGS_A },
      { type: "response.output_item.done", output_index: 0, item },
      { type: "response.completed", response: responseObject([item]) },
    ].map(eventFrame).join("");
    const result = await consume(wire, F.OPENAI_RESPONSES, client);
    if (client === F.OPENAI) assertChat(result, [CALLS[0]]);
    else assertMessages(result, [CALLS[0]]);
  });

  it.each([F.OPENAI, F.CLAUDE])("keeps native Responses custom input representable as JSON tool arguments for %s", async client => {
    const item = { type: "custom_tool_call", id: "ctc_contract", call_id: "call_program", name: "exec", input: PROGRAM, status: "completed" };
    const wire = [
      { type: "response.created", response: { id: "resp_custom", status: "in_progress" } },
      { type: "response.output_item.added", output_index: 0, item: { ...item, input: "", status: "in_progress" } },
      { type: "response.custom_tool_call_input.delta", item_id: item.id, output_index: 0, delta: PROGRAM.slice(0, 17) },
      { type: "response.custom_tool_call_input.delta", item_id: item.id, output_index: 0, delta: PROGRAM.slice(17) },
      { type: "response.custom_tool_call_input.done", item_id: item.id, output_index: 0, input: PROGRAM },
      { type: "response.output_item.done", output_index: 0, item },
      { type: "response.completed", response: responseObject([item]) },
    ].map(eventFrame).join("");
    const result = await consume(wire, F.OPENAI_RESPONSES, client);
    const expected = [{ id: "call_program", name: "exec", arguments: JSON.stringify({ input: PROGRAM }) }];
    if (client === F.OPENAI) assertChat(result, expected);
    else assertMessages(result, expected);
  });

  it("keeps previously emitted tool-start objects immutable as later registered events are consumed", () => {
    const state = { ...initState(F.CLAUDE), targetFormat: F.OPENAI, sourceFormat: F.CLAUDE };
    const first = translateResponse(F.OPENAI, F.CLAUDE, chatChunk({ tool_calls: [{ index: 0, id: CALLS[0].id, type: "function", function: { name: "lookup", arguments: '{ "city":' } }] }), state);
    const start = first.find(event => event.type === "content_block_start");
    const before = structuredClone(first);
    translateResponse(F.OPENAI, F.CLAUDE, chatChunk({ tool_calls: [{ index: 0, function: { arguments: ARGS_A } }] }), state);
    translateResponse(F.OPENAI, F.CLAUDE, { ...chatChunk({}, "tool_calls"), usage: CHAT_USAGE }, state);
    expect(start.content_block).toEqual({ type: "tool_use", id: CALLS[0].id, name: "lookup", input: {} });
    expect(first).toEqual(before);
  });

  it.each([true, false])("retains Gemini function-call ID and signed continuity when Chat output becomes native Gemini with stream=%s", async stream => {
    socket.reply = stream ? { sse: true, body: chatWire() } : { body: {
      id: "chatcmpl-gemini-tool", object: "chat.completion", model: "wire-model",
      choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: CALLS.map(call => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments } })) }, finish_reason: "tool_calls" }], usage: CHAT_USAGE,
    } };
    const result = await dispatch("openai-compatible-chat-stream-contract", "gpt-5.5", F.GEMINI, clientBody(F.GEMINI), stream);
    expect(result.success).toBe(true);
    const values = stream ? frames(await result.response.text()).map(frame => frame.data) : [await result.response.json()];
    const parts = values.flatMap(value => value.candidates?.[0]?.content?.parts || []).filter(part => part.functionCall);
    expect(parts).toEqual([
      { functionCall: { id: "call_alpha", name: "lookup", args: { city: "München", value: 1000, path: "C:\\tmp" } }, thoughtSignature: "c2lnLW9yaWdpbmFs" },
      { functionCall: { id: "call_beta", name: "lookup_many", args: { node: { node: 1 } } } },
    ]);
    expect(values.at(-1).usageMetadata).toMatchObject(GEMINI_USAGE);
    expect(values.some(value => value.response || value.choices)).toBe(false);
  });
});

describe("consumer-visible refusal and terminal semantics", () => {
  it("does not discard a Chat refusal-only delta before its content-filter terminal", async () => {
    socket.reply = { sse: true, body: [
      dataFrame(chatChunk({ role: "assistant" })), dataFrame(chatChunk({ refusal: "Cannot disclose " })),
      dataFrame(chatChunk({ refusal: "that." })), dataFrame({ ...chatChunk({}, "content_filter"), usage: CHAT_USAGE }), "data: [DONE]\n\n",
    ].join("") };
    const result = await dispatch("openai", "gpt-5.5", F.OPENAI);
    const wire = await result.response.text();
    const data = frames(wire).map(frame => frame.data);
    expect(data.map(chunk => chunk.choices?.[0]?.delta?.refusal || "").join("")).toBe("Cannot disclose that.");
    assertChat(wire, [], "content_filter");
  });

  it.each([F.OPENAI, F.CLAUDE, F.OPENAI_RESPONSES])("preserves a refusal from native Responses through the %s stream consumer", async client => {
    const item = { type: "message", id: "msg_blocked", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "Cannot disclose that." }] };
    const wire = [
      { type: "response.created", response: { id: "resp_refusal", status: "in_progress" } },
      { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", content: [] } },
      { type: "response.refusal.delta", item_id: item.id, output_index: 0, content_index: 0, delta: "Cannot disclose " },
      { type: "response.refusal.delta", item_id: item.id, output_index: 0, content_index: 0, delta: "that." },
      { type: "response.refusal.done", item_id: item.id, output_index: 0, content_index: 0, refusal: "Cannot disclose that." },
      { type: "response.output_item.done", output_index: 0, item },
      { type: "response.completed", response: responseObject([item]) },
    ].map(eventFrame).join("");
    const data = frames(await consume(wire, F.OPENAI_RESPONSES, client)).map(frame => frame.data);
    if (client === F.OPENAI) expect(data.map(chunk => chunk.choices?.[0]?.delta?.refusal || "").join("")).toBe("Cannot disclose that.");
    else if (client === F.CLAUDE) expect(data.map(chunk => chunk.delta?.text || "").join("")).toBe("Cannot disclose that.");
    else expect(data.find(chunk => chunk.type === "response.completed").response.output[0].content).toEqual(item.content);
    expect(data.filter(chunk => chunk.usage || chunk.response?.usage).at(-1)).toBeDefined();
  });

  it.each([F.CLAUDE, F.OPENAI_RESPONSES])("preserves Chat refusal semantics in native %s output rather than reporting an empty success", async client => {
    const wire = [dataFrame(chatChunk({ refusal: "Cannot disclose that." })), dataFrame({ ...chatChunk({}, "content_filter"), usage: CHAT_USAGE }), "data: [DONE]\n\n"].join("");
    const data = frames(await consume(wire, F.OPENAI, client)).map(frame => frame.data);
    if (client === F.CLAUDE) {
      expect(data.map(chunk => chunk.delta?.text || "").join("")).toBe("Cannot disclose that.");
      expect(data.find(chunk => chunk.type === "message_delta")?.delta.stop_reason).toBe("refusal");
    } else {
      const terminal = data.find(chunk => chunk.type === "response.completed" || chunk.type === "response.incomplete");
      expect(terminal.response.output[0].content).toEqual([{ type: "refusal", refusal: "Cannot disclose that." }]);
      expect(terminal.response.usage).toMatchObject(NATIVE_USAGE);
    }
  });

  it.each(["max_tokens", "refusal"])("maps native Claude %s to a valid Chat finish reason consistently for SSE and JSON", async stopReason => {
    const textEvents = [
      { type: "message_start", message: { id: "msg_stop", role: "assistant", type: "message", model: "wire-model", content: [], usage: { input_tokens: 11, output_tokens: 0 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "Partial response." } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: stopReason }, usage: { output_tokens: 7 } }, { type: "message_stop" },
    ];
    const streamed = frames(await consume(textEvents.map(eventFrame).join(""), F.CLAUDE, F.OPENAI)).map(frame => frame.data);
    const expected = stopReason === "max_tokens" ? "length" : "content_filter";
    expect(streamed.flatMap(chunk => chunk.choices || []).find(choice => choice.finish_reason)?.finish_reason).toBe(expected);
    socket.reply = { body: { id: "msg_stop", type: "message", role: "assistant", model: "wire-model", content: [{ type: "text", text: "Partial response." }], stop_reason: stopReason, stop_sequence: null, usage: { input_tokens: 11, output_tokens: 7 } } };
    const result = await dispatch("claude", "claude-sonnet-4-6", F.OPENAI, clientBody(F.OPENAI), false);
    expect(result.success).toBe(true);
    const json = await result.response.json();
    expect(json.choices[0].finish_reason).toBe(expected);
    expect(json.choices[0].message.content).toBe("Partial response.");
    expect(json.usage).toMatchObject(CHAT_USAGE);
  });

  it("does not overwrite an incomplete tool response's length terminal in non-streaming Chat", async () => {
    socket.reply = { body: { id: "chatcmpl-partial-tool", object: "chat.completion", model: "wire-model", choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [{ id: "call_partial", type: "function", function: { name: "lookup", arguments: '{"city":' } }] }, finish_reason: "length" }], usage: CHAT_USAGE } };
    const result = await dispatch("openai-compatible-chat-stream-contract", "gpt-5.5", F.OPENAI, clientBody(F.OPENAI), false);
    expect(result.success).toBe(true);
    const json = await result.response.json();
    expect(json.choices[0].finish_reason).toBe("length");
    expect(json.choices[0].message.tool_calls[0].function.arguments).toBe('{"city":');
    expect(json.usage).toMatchObject(CHAT_USAGE);
  });
});

describe("generated media response serializers", () => {
  it.each([true, false])("keeps Gemini generated PNG bytes in Chat images, never content prose, with stream=%s", async stream => {
    const native = { responseId: "gemini_image_contract", modelVersion: "gemini-2.5-flash", candidates: [{ index: 0, content: { role: "model", parts: [{ text: "Generated." }, { inlineData: { mimeType: "image/png", data: PNG } }] }, finishReason: "STOP" }], usageMetadata: GEMINI_USAGE };
    socket.reply = stream ? { sse: true, body: dataFrame(native) } : { body: native };
    const result = await dispatch("gemini", "gemini-2.5-flash", F.OPENAI, clientBody(F.OPENAI), stream);
    expect(result.success).toBe(true);
    if (stream) {
      const data = frames(await result.response.text()).map(frame => frame.data);
      expect(data.flatMap(chunk => chunk.choices?.[0]?.delta?.images || [])).toEqual([{ ...IMAGE, index: 0 }]);
      expect(data.map(chunk => chunk.choices?.[0]?.delta?.content || "").join("")).toBe("Generated.");
      expect(data.filter(chunk => chunk.usage).at(-1)?.usage).toMatchObject(CHAT_USAGE);
    } else {
      const json = await result.response.json();
      expect(json.choices[0].message.images).toEqual([{ ...IMAGE, index: 0 }]);
      expect(json.choices[0].message.content).toBe("Generated.");
      expect(json.usage).toMatchObject(CHAT_USAGE);
    }
  });
});

describe("remaining native tool and forced-JSON boundaries", () => {
  it.each([F.OPENAI, F.CLAUDE, F.OPENAI_RESPONSES])("preserves parallel Gemini tools through the registered %s stream consumer", async client => {
    const native = {
      responseId: "gemini_tools_contract", modelVersion: "gemini-2.5-flash",
      candidates: [{ index: 0, content: { role: "model", parts: [
        { functionCall: { id: "call_alpha", name: "lookup", args: { city: "München", value: 1000, path: "C:\\tmp" } }, thoughtSignature: "c2lnLW9yaWdpbmFs" },
        { functionCall: { id: "call_beta", name: "lookup_many", args: { node: { node: 1 } } } },
      ] }, finishReason: "STOP" }], usageMetadata: GEMINI_USAGE,
    };
    const expected = [
      { ...CALLS[0], arguments: '{"city":"München","value":1000,"path":"C:\\\\tmp"}' },
      CALLS[1],
    ];
    const wire = await consume(dataFrame(native), F.GEMINI, client);
    if (client === F.OPENAI) assertChat(wire, expected);
    else if (client === F.CLAUDE) assertMessages(wire, expected);
    else assertResponses(wire, expected);
  });

  it.each([F.CLAUDE, F.OPENAI_RESPONSES])("restores fragmented compressed Chat names before native %s tool starts", async client => {
    const upstream = CALLS.map((call, index) => ({ ...call, name: index === 0 ? SHORT_A : SHORT_B }));
    const expected = CALLS.map((call, index) => ({ ...call, name: index === 0 ? LONG_A : LONG_B }));
    const wire = await consume(chatWire(upstream, true), F.OPENAI, client, { toolNameMap: new Map([[SHORT_A, LONG_A], [SHORT_B, LONG_B]]) });
    if (client === F.CLAUDE) assertMessages(wire, expected);
    else assertResponses(wire, expected);
  });

  it.each([true, false])("keeps a compressed custom declaration native after Chat fallback with stream=%s", async stream => {
    const call = { id: "call_custom_fallback", name: SHORT_B, arguments: JSON.stringify({ input: PROGRAM }) };
    socket.reply = stream ? { sse: true, body: chatWire([call], true) } : { body: {
      id: "chatcmpl-custom-fallback", object: "chat.completion", model: "wire-model",
      choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [{ id: call.id, type: "function", function: { name: SHORT_B, arguments: call.arguments } }] }, finish_reason: "tool_calls" }], usage: CHAT_USAGE,
    } };
    const result = await dispatch("openai-compatible-chat-stream-contract", "gpt-5.5", F.OPENAI_RESPONSES, {
      input: "Run a program.", tools: [{ type: "custom", name: LONG_B, description: "Execute", format: { type: "text" } }],
    }, stream);
    expect(result.success).toBe(true);
    const events = stream ? frames(await result.response.text()).map(frame => frame.data) : null;
    const output = stream ? events.find(event => event.type === "response.completed")?.response.output : (await result.response.json()).output;
    expect(output).toMatchObject([{ type: "custom_tool_call", call_id: "call_custom_fallback", name: LONG_B, input: PROGRAM, status: "completed" }]);
    expect(output[0]).not.toHaveProperty("arguments");
    if (stream) expect(events.find(event => event.type === "response.output_item.added").item).toMatchObject({ type: "custom_tool_call", name: LONG_B, input: "" });
  });

  it.each([F.OPENAI, F.CLAUDE])("converts native Responses custom JSON into a valid %s tool object", async client => {
    socket.reply = { body: responseObject([{ type: "custom_tool_call", id: "ctc_json", call_id: "call_program", name: "exec", input: PROGRAM, status: "completed" }]) };
    const result = await dispatch("openai", "gpt-6.1-sol", client, clientBody(client, ["exec"]), false);
    expect(result.success).toBe(true);
    const json = await result.response.json();
    if (client === F.OPENAI) {
      expect(json.choices[0].message.tool_calls).toEqual([{ id: "call_program", type: "function", function: { name: "exec", arguments: JSON.stringify({ input: PROGRAM }) } }]);
      expect(json.choices[0].finish_reason).toBe("tool_calls");
    } else {
      expect(json.content).toEqual([{ type: "tool_use", id: "call_program", name: "exec", input: { input: PROGRAM } }]);
      expect(json.stop_reason).toBe("tool_use");
    }
  });

  it.each([false, true])("restores long tool names after forced Chat SSE aggregation with fragmented=%s", async fragmented => {
    const expected = [{ ...CALLS[0], name: LONG_A }];
    socket.reply = { sse: true, body: chatWire([{ ...CALLS[0], name: SHORT_A }], fragmented) };
    const result = await dispatch("openai", "gpt-5.5", F.OPENAI, clientBody(F.OPENAI, [LONG_A]), false);
    expect(result.success).toBe(true);
    expect(result.response.headers.get("content-type")).toContain("application/json");
    const json = await result.response.json();
    expect(json.choices[0].message.tool_calls).toEqual(expected.map(call => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments } })));
    expect(json.choices[0].finish_reason).toBe("tool_calls");
    expect(json.usage).toMatchObject(CHAT_USAGE);
  });

  it("preserves generated Chat images after forced SSE aggregation instead of losing them or making base64 prose", async () => {
    socket.reply = { sse: true, body: [
      dataFrame(chatChunk({ role: "assistant" })), dataFrame(chatChunk({ images: [IMAGE] })),
      dataFrame({ ...chatChunk({ content: "Generated." }, "stop"), usage: CHAT_USAGE }), "data: [DONE]\n\n",
    ].join("") };
    const result = await dispatch("openai", "gpt-5.5", F.OPENAI, clientBody(F.OPENAI), false);
    expect(result.success).toBe(true);
    const json = await result.response.json();
    expect(json.choices[0].message.images).toEqual([IMAGE]);
    expect(json.choices[0].message.content).toBe("Generated.");
    expect(json.usage).toMatchObject(CHAT_USAGE);
  });

  it.each([true, false])("keeps generated Chat images typed for native Gemini consumers with stream=%s", async stream => {
    socket.reply = stream ? { sse: true, body: [
      dataFrame(chatChunk({ images: [IMAGE] })), dataFrame({ ...chatChunk({ content: "Generated." }, "stop"), usage: CHAT_USAGE }), "data: [DONE]\n\n",
    ].join("") } : { body: {
      id: "chatcmpl-image-json", object: "chat.completion", model: "wire-model",
      choices: [{ index: 0, message: { role: "assistant", content: "Generated.", images: [IMAGE] }, finish_reason: "stop" }], usage: CHAT_USAGE,
    } };
    const result = await dispatch("openai-compatible-chat-stream-contract", "gpt-5.5", F.GEMINI, clientBody(F.GEMINI), stream);
    expect(result.success).toBe(true);
    const values = stream ? frames(await result.response.text()).map(frame => frame.data) : [await result.response.json()];
    const parts = values.flatMap(value => value.candidates?.[0]?.content?.parts || []);
    expect(parts.filter(part => part.inlineData)).toEqual([{ inlineData: { mimeType: "image/png", data: PNG } }]);
    expect(parts.map(part => part.text || "").join("")).toBe("Generated.");
  });

  it("keeps a native Responses content-filter incomplete terminal meaningful for Chat clients", async () => {
    const native = responseObject([], { status: "incomplete", incomplete_details: { reason: "content_filter" } });
    const wire = [
      { type: "response.created", response: { id: native.id, status: "in_progress" } },
      { type: "response.output_text.delta", item_id: "msg_partial", output_index: 0, content_index: 0, delta: "Partial." },
      { type: "response.incomplete", response: native },
    ].map(eventFrame).join("");
    const output = await consume(wire, F.OPENAI_RESPONSES, F.OPENAI);
    const data = frames(output).map(frame => frame.data);
    expect(data.map(chunk => chunk.choices?.[0]?.delta?.content || "").join("")).toBe("Partial.");
    expect(data.flatMap(chunk => chunk.choices || []).filter(choice => choice.finish_reason).map(choice => choice.finish_reason)).toEqual(["content_filter"]);
    expect(data.filter(chunk => chunk.usage).at(-1)?.usage).toMatchObject(CHAT_USAGE);
  });
});

it("restores a compressed tool name and respects its terminal in an unterminated final Chat SSE frame", async () => {
  socket.reply = { sse: true, body: `data: ${JSON.stringify({
    ...chatChunk({ tool_calls: [{ index: 0, id: CALLS[0].id, type: "function", function: { name: SHORT_A, arguments: ARGS_A } }] }, "tool_calls"),
    usage: CHAT_USAGE,
  })}` };
  const result = await dispatch("openai", "gpt-5.5", F.OPENAI, clientBody(F.OPENAI, [LONG_A]));
  expect(result.success).toBe(true);
  assertChat(await result.response.text(), [{ ...CALLS[0], name: LONG_A }]);
});

it.each([F.OPENAI, F.CLAUDE])("preserves a Responses JSON refusal in the actual %s nonstreaming consumer", async client => {
  socket.reply = { body: responseObject([{ type: "message", id: "msg_json_refusal", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "Cannot disclose that." }] }]) };
  const result = await dispatch("openai", "gpt-6.1-sol", client, clientBody(client), false);
  expect(result.success).toBe(true);
  const json = await result.response.json();
  if (client === F.OPENAI) {
    expect(json.choices[0].message.refusal).toBe("Cannot disclose that.");
    expect(json.choices[0].finish_reason).toBe("stop");
    expect(json.usage).toMatchObject(CHAT_USAGE);
  } else {
    expect(json.content).toContainEqual({ type: "text", text: "Cannot disclose that." });
    expect(json.usage).toMatchObject({ input_tokens: 11, output_tokens: 7 });
  }
});

it.each([["MAX_TOKENS", "length"], ["SAFETY", "content_filter"]])("maps Gemini %s consistently at streaming and JSON boundaries", async (reason, expected) => {
  const native = { responseId: "gemini_stop_contract", modelVersion: "gemini-2.5-flash", candidates: [{ index: 0, content: { role: "model", parts: [{ text: "Partial." }] }, finishReason: reason }], usageMetadata: GEMINI_USAGE };
  const streamed = frames(await consume(dataFrame(native), F.GEMINI, F.OPENAI)).map(frame => frame.data);
  expect(streamed.flatMap(chunk => chunk.choices || []).find(choice => choice.finish_reason)?.finish_reason).toBe(expected);
  socket.reply = { body: native };
  const result = await dispatch("gemini", "gemini-2.5-flash", F.OPENAI, clientBody(F.OPENAI), false);
  expect(result.success).toBe(true);
  const json = await result.response.json();
  expect(json.choices[0].finish_reason).toBe(expected);
  expect(json.choices[0].message.content).toBe("Partial.");
  expect(json.usage).toMatchObject(CHAT_USAGE);
});

describe("signed image occurrences and exact native tool names", () => {
  const sigA = "opaque-image-signature-A==";
  const sigB = "opaque-image-signature-B==";
  const signedParts = [
    { text: "Generated." },
    { inlineData: { mimeType: "image/png", data: PNG }, thoughtSignature: sigA },
    { inline_data: { mime_type: "image/png", data: PNG }, thought_signature: sigB },
    { functionCall: { id: "call_after_image", name: "lookup", args: {} } },
  ];
  const expectedImages = [
    { ...IMAGE, index: 0, extra_content: { google: { thought_signature: sigA } } },
    { ...IMAGE, index: 1, extra_content: { google: { thought_signature: sigB } } },
  ];
  const native = { responseId: "signed_image_contract", modelVersion: "gemini-2.5-flash", candidates: [{ index: 0, content: { role: "model", parts: signedParts }, finishReason: "STOP" }], usageMetadata: GEMINI_USAGE };

  it.each([F.GEMINI, F.GEMINI_CLI, F.ANTIGRAVITY, F.VERTEX])("keeps signed image occurrences distinct across chunks from %s", async target => {
    const chunks = [
      { ...native, candidates: [{ index: 0, content: { role: "model", parts: signedParts.slice(0, 2) } }], usageMetadata: undefined },
      { ...native, candidates: [{ index: 0, content: { role: "model", parts: signedParts.slice(2) }, finishReason: "STOP" }] },
    ].map(value => target === F.ANTIGRAVITY || target === F.GEMINI_CLI ? { response: value } : value);
    const wire = await consume(chunks.map(dataFrame).join(""), target, F.OPENAI);
    const data = frames(wire).map(frame => frame.data);
    expect(data.flatMap(chunk => chunk.choices?.[0]?.delta?.images || [])).toEqual(expectedImages);
    expect(data.map(chunk => chunk.choices?.[0]?.delta?.content || "").join("")).toBe("Generated.");
    expect(collectChatCalls(wire)).toEqual([{ id: "call_after_image", name: "lookup", arguments: "{}" }]);
    expect(wire).not.toContain(`"content":"${sigA}`);
    expect(wire).not.toContain(`"content":"${sigB}`);
    expect(data.filter(chunk => chunk.usage).at(-1)?.usage).toMatchObject(CHAT_USAGE);
  });

  it.each([true, false])("preserves signed-image extension and occurrence indices through real Core with stream=%s", async stream => {
    socket.reply = stream ? { sse: true, body: dataFrame(native) } : { body: native };
    const result = await dispatch("gemini", "gemini-2.5-flash", F.OPENAI, clientBody(F.OPENAI), stream);
    expect(result.success).toBe(true);
    const images = stream ? frames(await result.response.text()).flatMap(({ data }) => data.choices?.[0]?.delta?.images || []) : (await result.response.json()).choices[0].message.images;
    expect(images).toEqual(expectedImages);
  });

  it.each([true, false])("keeps legitimate *_ide tool names exact without a request map with stream=%s", async stream => {
    const call = { ...CALLS[0], name: "lookup_ide" };
    socket.reply = stream ? { sse: true, body: claudeWire([call]) } : { body: {
      id: "msg_native_suffix", type: "message", role: "assistant", model: "wire-model",
      content: [{ type: "tool_use", id: call.id, name: call.name, input: JSON.parse(call.arguments) }],
      stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 11, output_tokens: 7 },
    } };
    const result = await dispatch("claude", "claude-sonnet-4-6", F.CLAUDE, clientBody(F.CLAUDE, ["lookup_ide"]), stream);
    expect(result.success).toBe(true);
    if (stream) assertMessages(await result.response.text(), [call]);
    else expect((await result.response.json()).content[0]).toMatchObject({ type: "tool_use", id: call.id, name: "lookup_ide", input: JSON.parse(ARGS_A) });
  });

  it.each([true, false])("restores a legitimately suffixed original exactly once after OAuth cloaking with stream=%s", async stream => {
    const upstream = { ...CALLS[0], name: "lookup_ide_ide" };
    socket.reply = stream ? { sse: true, body: claudeWire([upstream]) } : { body: {
      id: "msg_mapped_suffix", type: "message", role: "assistant", model: "wire-model",
      content: [{ type: "tool_use", id: upstream.id, name: upstream.name, input: JSON.parse(upstream.arguments) }],
      stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 11, output_tokens: 7 },
    } };
    const result = await dispatch("claude", "claude-sonnet-4-6", F.CLAUDE, clientBody(F.CLAUDE, ["lookup_ide"]), stream, { accessToken: "sk-ant-oat-offline-fixture" });
    expect(result.success).toBe(true);
    if (stream) assertMessages(await result.response.text(), [{ ...CALLS[0], name: "lookup_ide" }]);
    else expect((await result.response.json()).content[0].name).toBe("lookup_ide");
    expect(socket.requests[0].body.tools[0].name).toBe("lookup_ide_ide");
  });

  it("does not remove a legitimate proxy_ prefix during Chat to Messages translation", async () => {
    const call = { ...CALLS[0], name: "proxy_lookup" };
    assertMessages(await consume(chatWire([call]), F.OPENAI, F.CLAUDE), [call]);
  });

  it.each([F.OPENAI, F.CLAUDE])("carries request compression metadata across a real %s cross-format converter", async client => {
    const provider = client === F.CLAUDE ? "openai-compatible-chat-stream-contract" : "claude";
    const model = client === F.CLAUDE ? "gpt-5.5" : "claude-sonnet-4-6";
    const upstream = [{ ...CALLS[0], name: SHORT_A }];
    socket.reply = { sse: true, body: client === F.CLAUDE ? chatWire(upstream, true) : claudeWire(upstream) };
    const result = await dispatch(provider, model, client, clientBody(client, [LONG_A]));
    expect(result.success).toBe(true);
    const wire = await result.response.text();
    if (client === F.CLAUDE) assertMessages(wire, [{ ...CALLS[0], name: LONG_A }]);
    else assertChat(wire, [{ ...CALLS[0], name: LONG_A }]);
    expect(socket.requests[0].body.tools[0].function?.name || socket.requests[0].body.tools[0].name).toBe(SHORT_A);
  });
  it.each([true, false])("replays each canonical image signature on its native Gemini response part with stream=%s", async stream => {
    socket.reply = stream ? { sse: true, body: [
      dataFrame(chatChunk({ images: expectedImages })), dataFrame({ ...chatChunk({ content: "Generated." }, "stop"), usage: CHAT_USAGE }), "data: [DONE]\n\n",
    ].join("") } : { body: {
      id: "chatcmpl-image-signatures", object: "chat.completion", model: "wire-model",
      choices: [{ index: 0, message: { role: "assistant", content: "Generated.", images: expectedImages }, finish_reason: "stop" }], usage: CHAT_USAGE,
    } };
    const result = await dispatch("openai-compatible-chat-stream-contract", "gpt-5.5", F.GEMINI, clientBody(F.GEMINI), stream);
    expect(result.success).toBe(true);
    const values = stream ? frames(await result.response.text()).map(frame => frame.data) : [await result.response.json()];
    const images = values.flatMap(value => value.candidates?.[0]?.content?.parts || []).filter(part => part.inlineData);
    expect(images).toEqual([
      { inlineData: { mimeType: "image/png", data: PNG }, thoughtSignature: sigA },
      { inlineData: { mimeType: "image/png", data: PNG }, thoughtSignature: sigB },
    ]);
    expect(values.at(-1).usageMetadata).toMatchObject(GEMINI_USAGE);
  });
});

it.each([true, false])("preserves Chat refusal text and SAFETY terminal in native Gemini with stream=%s", async stream => {
  socket.reply = stream ? { sse: true, body: [
    dataFrame(chatChunk({ refusal: "Cannot disclose that." })), dataFrame({ ...chatChunk({}, "content_filter"), usage: CHAT_USAGE }), "data: [DONE]\n\n",
  ].join("") } : { body: {
    id: "chatcmpl-gemini-refusal", object: "chat.completion", model: "wire-model",
    choices: [{ index: 0, message: { role: "assistant", content: null, refusal: "Cannot disclose that." }, finish_reason: "content_filter" }], usage: CHAT_USAGE,
  } };
  const result = await dispatch("openai-compatible-chat-stream-contract", "gpt-5.5", F.GEMINI, clientBody(F.GEMINI), stream);
  expect(result.success).toBe(true);
  const values = stream ? frames(await result.response.text()).map(frame => frame.data) : [await result.response.json()];
  expect(values.flatMap(value => value.candidates?.[0]?.content?.parts || []).map(part => part.text || "").join("")).toBe("Cannot disclose that.");
  expect(values.at(-1).candidates[0].finishReason).toBe("SAFETY");
  expect(values.at(-1).usageMetadata).toMatchObject(GEMINI_USAGE);
});
