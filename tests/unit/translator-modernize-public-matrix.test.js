import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const network = vi.hoisted(() => ({ origin: "", requests: [], reply: null }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}), saveRequestUsage: vi.fn(async () => {}),
}));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: async () => undefined }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest() {}, logRawRequest() {}, logTargetRequest() {}, logOpenAIRequest() {},
  logProviderResponse() {}, logConvertedResponse() {}, logError() {},
  appendProviderChunk() {}, appendConvertedChunk() {}, appendOpenAIChunk() {},
}) }));
vi.mock("../../open-sse/executors/index.js", async () => {
  const { DefaultExecutor } = await import("../../open-sse/executors/default.js");
  return { getExecutor(provider) {
    const executor = new DefaultExecutor(provider);
    const buildUrl = executor.buildUrl.bind(executor);
    executor.buildUrl = (...args) => {
      const url = new URL(buildUrl(...args));
      return `${network.origin}/${provider}${url.pathname}${url.search}`;
    };
    return executor;
  } };
});

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";

const formats = [F.OPENAI, F.CLAUDE, F.OPENAI_RESPONSES, F.GEMINI];
const targets = [
  { format: F.OPENAI, provider: "openai-compatible-chat-modernize", model: "gpt-4o" },
  { format: F.CLAUDE, provider: "anthropic-compatible-modernize", model: "claude-sonnet-4.5" },
  { format: F.OPENAI_RESPONSES, provider: "openai-compatible-responses-modernize", model: "gpt-4o" },
  { format: F.GEMINI, provider: "gemini", model: "gemini-2.5-flash" },
];
const png = "iVBORw0KGgo=";
const image = `data:image/png;base64,${png}`;
const schema = { type: "object", properties: { key: { type: "string" } }, required: ["key"] };
const args = '{"key":"wire"}';
const tool = { id: "call_wire", type: "function", function: { name: "lookup", arguments: args } };
const chatUsage = { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 };
const responseUsage = { input_tokens: 11, output_tokens: 7, total_tokens: 18 };
const googleUsage = { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 };
const frame = data => `data: ${JSON.stringify(data)}\n\n`;
const event = data => `event: ${data.type}\n${frame(data)}`;
const chunk = (delta, finish_reason = null) => ({ id: "chatcmpl-modernize-http", object: "chat.completion.chunk", model: "wire-model", choices: [{ index: 0, delta, finish_reason }] });

function requestBody(source) {
  if (source === F.CLAUDE) return { max_tokens: 2048, system: "System public matrix", tools: [{ name: "lookup", input_schema: schema }], messages: [
    { role: "user", content: [{ type: "text", text: "Inspect public matrix" }, { type: "image", source: { type: "base64", media_type: "image/png", data: png } }] },
    { role: "assistant", content: [{ type: "tool_use", id: "call_history", name: "lookup", input: { key: "history" } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "call_history", content: "history-result" }, { type: "text", text: "Continue" }] },
  ] };
  if (source === F.OPENAI_RESPONSES) return { max_output_tokens: 2048, instructions: "System public matrix", tools: [{ type: "function", name: "lookup", parameters: schema }], input: [
    { role: "user", content: [{ type: "input_text", text: "Inspect public matrix" }, { type: "input_image", image_url: image }] },
    { type: "function_call", call_id: "call_history", name: "lookup", arguments: '{"key":"history"}' },
    { type: "function_call_output", call_id: "call_history", output: "history-result" },
    { role: "user", content: [{ type: "input_text", text: "Continue" }] },
  ] };
  if (source === F.GEMINI) return { generationConfig: { maxOutputTokens: 2048 }, systemInstruction: { parts: [{ text: "System public matrix" }] },
    tools: [{ functionDeclarations: [{ name: "lookup", parametersJsonSchema: schema }] }], contents: [
      { role: "user", parts: [{ text: "Inspect public matrix" }, { inlineData: { mimeType: "image/png", data: png } }] },
      { role: "model", parts: [{ functionCall: { id: "call_history", name: "lookup", args: { key: "history" } } }] },
      { role: "user", parts: [{ functionResponse: { id: "call_history", name: "lookup", response: { result: "history-result" } } }, { text: "Continue" }] },
    ] };
  return { max_tokens: 2048, tools: [{ type: "function", function: { name: "lookup", parameters: schema } }], messages: [
    { role: "system", content: "System public matrix" },
    { role: "user", content: [{ type: "text", text: "Inspect public matrix" }, { type: "image_url", image_url: { url: image } }] },
    { role: "assistant", content: null, tool_calls: [{ id: "call_history", type: "function", function: { name: "lookup", arguments: '{"key":"history"}' } }] },
    { role: "tool", tool_call_id: "call_history", content: "history-result" },
    { role: "user", content: "Continue" },
  ] };
}

function jsonBody(target) {
  if (target === F.CLAUDE) return { id: "msg_modernize_http", type: "message", role: "assistant", model: "wire-model", content: [
    { type: "thinking", thinking: "Plan public matrix", signature: "opaque-native" },
    { type: "text", text: "Answer public matrix" }, { type: "tool_use", id: tool.id, name: "lookup", input: { key: "wire" } },
  ], stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 11, output_tokens: 7 }, opaque: { retained: true } };
  if (target === F.OPENAI_RESPONSES) return { id: "resp_modernize_http", object: "response", model: "wire-model", status: "completed", output: [
    { id: "rs_wire", type: "reasoning", summary: [{ type: "summary_text", text: "Plan public matrix" }], encrypted_content: "native-opaque-reasoning" },
    { id: "msg_wire", type: "message", role: "assistant", content: [{ type: "output_text", text: "Answer public matrix" }] },
    { id: "fc_wire", type: "function_call", call_id: tool.id, name: "lookup", arguments: args },
  ], usage: responseUsage, opaque: { retained: true } };
  if (target === F.GEMINI) return { responseId: "gemini_modernize_http", modelVersion: "wire-model", candidates: [{ content: { role: "model", parts: [
    { thought: true, text: "Plan public matrix" }, { text: "Answer public matrix" }, { functionCall: { id: tool.id, name: "lookup", args: { key: "wire" } } },
  ] }, finishReason: "STOP" }], usageMetadata: googleUsage, opaque: { retained: true } };
  return { id: "chatcmpl-modernize-http", object: "chat.completion", model: "wire-model", choices: [{ index: 0, message: { role: "assistant", content: "Answer public matrix", reasoning_content: "Plan public matrix", tool_calls: [tool] }, finish_reason: "tool_calls" }], usage: chatUsage, opaque: { retained: true } };
}

function sseBody(target) {
  if (target === F.OPENAI) return [chunk({ role: "assistant" }), chunk({ reasoning_content: "Plan public matrix" }), chunk({ content: "Answer public matrix" }),
    chunk({ tool_calls: [{ ...tool, index: 0, function: { name: "lookup", arguments: args.slice(0, 8) } }] }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: args.slice(8) } }] }), chunk({}, "tool_calls"), { choices: [], usage: chatUsage },
  ].map(frame).join("") + "data: [DONE]\n\n";
  if (target === F.CLAUDE) return [
    { type: "message_start", message: { id: "msg_modernize_http", type: "message", role: "assistant", model: "wire-model", content: [], usage: { input_tokens: 11, output_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Plan public matrix" } }, { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Answer public matrix" } }, { type: "content_block_stop", index: 1 },
    { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: tool.id, name: "lookup", input: {} } },
    { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: args } }, { type: "content_block_stop", index: 2 },
    { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 7 } }, { type: "message_stop", opaque: { retained: true } },
  ].map(event).join("");
  if (target === F.OPENAI_RESPONSES) {
    const body = jsonBody(target);
    return [
      { type: "response.created", response: { ...body, output: [], status: "in_progress" } },
      { type: "response.reasoning_summary_text.delta", item_id: "rs_wire", output_index: 0, summary_index: 0, delta: "Plan public matrix" },
      { type: "response.output_text.delta", item_id: "msg_wire", output_index: 1, content_index: 0, delta: "Answer public matrix" },
      { type: "response.output_item.added", output_index: 2, item: { ...body.output[2], arguments: "" } },
      { type: "response.function_call_arguments.delta", output_index: 2, item_id: "fc_wire", delta: args },
      { type: "response.output_item.done", output_index: 2, item: body.output[2] },
      { type: "response.completed", response: body },
    ].map(event).join("");
  }
  const body = jsonBody(F.GEMINI);
  const { usageMetadata, ...candidate } = body;
  return frame(candidate) + frame({ usageMetadata });
}

function assertOutbound(body, target) {
  if (target === F.GEMINI) {
    expect(body.systemInstruction.parts.map(part => part.text).join("")).toBe("System public matrix");
    const parts = body.contents.flatMap(content => content.parts);
    expect(parts.find(part => part.functionCall).functionCall).toMatchObject({ id: "call_history", name: "lookup", args: { key: "history" } });
    expect(parts.find(part => part.functionResponse).functionResponse).toMatchObject({ id: "call_history", name: "lookup", response: { result: "history-result" } });
    const data = parts.find(part => part.inlineData).inlineData;
    expect(data.mimeType || data.mime_type).toBe("image/png");
    expect(data.data).toBe(png);
    expect(body.tools[0].functionDeclarations[0].name).toBe("lookup");
    return;
  }
  if (target === F.OPENAI_RESPONSES) {
    expect(body.instructions).toBe("System public matrix");
    expect(body.input.find(item => item.type === "function_call")).toMatchObject({ call_id: "call_history", name: "lookup", arguments: '{"key":"history"}' });
    expect(body.input.find(item => item.type === "function_call_output").call_id).toBe("call_history");
    expect(body.input.flatMap(item => item.content || []).find(part => part.type === "input_image").image_url).toBe(image);
    expect(body.tools[0].name).toBe("lookup");
    return;
  }
  if (target === F.CLAUDE) {
    expect(typeof body.system === "string" ? body.system : body.system.map(part => part.text).join("\n")).toBe("System public matrix");
    const parts = body.messages.flatMap(message => message.content);
    expect(parts.find(part => part.type === "tool_use")).toMatchObject({ id: "call_history", name: "lookup", input: { key: "history" } });
    expect(parts.find(part => part.type === "tool_result").tool_use_id).toBe("call_history");
    expect(parts.find(part => part.type === "image").source).toEqual({ type: "base64", media_type: "image/png", data: png });
    expect(body.tools[0].name).toBe("lookup");
    return;
  }
  expect(body.messages.find(message => message.role === "system").content).toBe("System public matrix");
  expect(body.messages.find(message => message.tool_calls).tool_calls[0]).toMatchObject({ id: "call_history", function: { name: "lookup", arguments: '{"key":"history"}' } });
  expect(body.messages.find(message => message.role === "tool").tool_call_id).toBe("call_history");
  expect(body.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).find(part => part.type === "image_url").image_url.url).toBe(image);
  expect(body.tools[0].function.name).toBe("lookup");
}

function assertJson(body, source) {
  if (source === F.CLAUDE) {
    expect(body).toMatchObject({ type: "message", role: "assistant", stop_reason: "tool_use", usage: { input_tokens: 11, output_tokens: 7 } });
    expect(body.content.find(part => part.type === "thinking").thinking).toBe("Plan public matrix");
    expect(body.content.find(part => part.type === "text").text).toBe("Answer public matrix");
    expect(body.content.find(part => part.type === "tool_use")).toMatchObject({ id: tool.id, name: "lookup", input: { key: "wire" } });
    expect(body.id).toBeTruthy();
  } else if (source === F.OPENAI_RESPONSES) {
    expect(body).toMatchObject({ object: "response", status: "completed", usage: responseUsage });
    expect(body.output.find(item => item.type === "reasoning").summary[0].text).toBe("Plan public matrix");
    expect(body.output.find(item => item.type === "message").content[0].text).toBe("Answer public matrix");
    expect(body.output.find(item => item.type === "function_call")).toMatchObject({ call_id: tool.id, name: "lookup", arguments: args });
    expect(body.id).toMatch(/^resp_/);
  } else if (source === F.GEMINI) {
    const native = body.response || body;
    const parts = native.candidates.flatMap(candidate => candidate.content.parts);
    expect(parts.filter(part => part.thought).map(part => part.text).join("")).toBe("Plan public matrix");
    expect(parts.filter(part => !part.thought && part.text).map(part => part.text).join("")).toBe("Answer public matrix");
    expect(parts.find(part => part.functionCall).functionCall).toEqual({ id: tool.id, name: "lookup", args: { key: "wire" } });
    expect(native.candidates[0].finishReason).toBe("STOP");
    expect(native.usageMetadata).toMatchObject(googleUsage);
    expect(native.responseId).toBeTruthy();
  } else {
    expect(body).toMatchObject({ object: "chat.completion", usage: chatUsage });
    expect(body.choices[0]).toMatchObject({ finish_reason: "tool_calls", message: { content: "Answer public matrix", reasoning_content: "Plan public matrix", tool_calls: [tool] } });
    expect(body.id).toMatch(/^chatcmpl-/);
  }
}

function frames(wire) {
  return wire.replace(/\r\n/g, "\n").split("\n\n").flatMap(raw => {
    const lines = raw.split("\n");
    const payload = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    return !payload || payload === "[DONE]" ? [] : [{ event: lines.find(line => line.startsWith("event:"))?.slice(6).trim(), data: JSON.parse(payload) }];
  });
}

function assertStream(wire, source) {
  const parsed = frames(wire);
  const data = parsed.map(value => value.data);
  if (source === F.OPENAI) {
    const choices = data.flatMap(value => value.choices || []);
    expect(choices.map(choice => choice.delta?.content || "").join("")).toBe("Answer public matrix");
    expect(choices.map(choice => choice.delta?.reasoning_content || "").join("")).toBe("Plan public matrix");
    const calls = choices.flatMap(choice => choice.delta?.tool_calls || []);
    expect(calls.map(call => call.id || "").join("")).toBe(tool.id);
    expect(calls.map(call => call.function?.name || "").join("")).toBe("lookup");
    expect(calls.map(call => call.function?.arguments || "").join("")).toBe(args);
    expect(choices.filter(choice => choice.finish_reason).map(choice => choice.finish_reason)).toEqual(["tool_calls"]);
    expect(data.filter(value => value.usage).at(-1).usage).toMatchObject(chatUsage);
    expect(wire.match(/data: \[DONE\]/g)).toHaveLength(1);
  } else if (source === F.CLAUDE) {
    expect(parsed.every(value => value.event === value.data.type)).toBe(true);
    expect(data.filter(value => value.type === "message_stop")).toHaveLength(1);
    expect(data.filter(value => value.delta?.type === "text_delta").map(value => value.delta.text).join("")).toBe("Answer public matrix");
    expect(data.filter(value => value.delta?.type === "thinking_delta").map(value => value.delta.thinking).join("")).toBe("Plan public matrix");
    const start = data.find(value => value.content_block?.type === "tool_use");
    expect(start.content_block).toMatchObject({ id: tool.id, name: "lookup", input: {} });
    expect(data.filter(value => value.index === start.index && value.delta?.type === "input_json_delta").map(value => value.delta.partial_json).join("")).toBe(args);
    const terminal = data.filter(value => value.type === "message_delta");
    expect(terminal).toHaveLength(1);
    expect(terminal[0].delta.stop_reason).toBe("tool_use");
    expect(terminal[0].usage.output_tokens).toBe(7);
    expect(terminal[0].usage.input_tokens ?? data[0].message.usage.input_tokens).toBe(11);
    expect(wire).not.toContain("[DONE]");
  } else if (source === F.OPENAI_RESPONSES) {
    expect(parsed.every(value => value.event === value.data.type)).toBe(true);
    expect(data.filter(value => value.type === "response.completed")).toHaveLength(1);
    expect(data.filter(value => value.type === "response.output_text.delta").map(value => value.delta).join("")).toBe("Answer public matrix");
    expect(data.filter(value => value.type === "response.reasoning_summary_text.delta").map(value => value.delta).join("")).toBe("Plan public matrix");
    expect(data.filter(value => value.type === "response.function_call_arguments.delta").map(value => value.delta).join("")).toBe(args);
    assertJson(data.find(value => value.type === "response.completed").response, source);
  } else {
    const native = data.map(value => value.response || value);
    const parts = native.flatMap(value => value.candidates || []).flatMap(candidate => candidate.content?.parts || []);
    expect(parts.filter(part => part.thought).map(part => part.text).join("")).toBe("Plan public matrix");
    expect(parts.filter(part => !part.thought && part.text).map(part => part.text).join("")).toBe("Answer public matrix");
    expect(parts.filter(part => part.functionCall).map(part => part.functionCall)).toEqual([{ id: tool.id, name: "lookup", args: { key: "wire" } }]);
    expect(native.flatMap(value => value.candidates || []).filter(candidate => candidate.finishReason).map(candidate => candidate.finishReason)).toEqual(["STOP"]);
    expect(native.filter(value => value.usageMetadata).at(-1).usageMetadata).toMatchObject(googleUsage);
  }
}

let server;
beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    const bytes = [];
    for await (const chunk of request) bytes.push(chunk);
    network.requests.push({ path: request.url, body: JSON.parse(Buffer.concat(bytes).toString("utf8")) });
    const { target, stream } = network.reply;
    response.writeHead(200, { "content-type": stream ? "text/event-stream" : "application/json" });
    const bytesOut = Buffer.from(stream ? sseBody(target) : JSON.stringify(jsonBody(target)));
    for (let offset = 0; offset < bytesOut.length; offset += 17) response.write(bytesOut.subarray(offset, offset + 17));
    response.end();
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  network.origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
beforeEach(() => { vi.clearAllMocks(); network.requests = []; network.reply = null; });

for (const target of targets) describe(`${target.format} actual upstream protocol`, () => {
  for (const source of formats) it.each([true, false])(`${source} client stream=%s retains outbound history and client wire contract`, async stream => {
    const body = requestBody(source);
    const before = JSON.stringify(body);
    network.reply = { target: target.format, stream };
    const result = await handleChatCore({ body: { ...body, model: target.model, stream }, modelInfo: { provider: target.provider, model: target.model },
      sourceFormatOverride: source, credentials: { apiKey: "synthetic-offline-matrix" }, connectionId: "modernize-matrix",
      clientRawRequest: { endpoint: source === F.CLAUDE ? "/v1/messages" : source === F.OPENAI_RESPONSES ? "/v1/responses" : source === F.GEMINI ? "/v1beta/models/gemini:generateContent" : "/v1/chat/completions", body, headers: {} },
      log: { debug() {}, info() {}, warn() {}, error() {} },
      rtkEnabled: false, headroomEnabled: false, cavemanEnabled: false, ponytailEnabled: false, pxpipeEnabled: false,
    });
    expect(result.success).toBe(true);
    expect(result.response.status).toBe(200);
    expect(network.requests).toHaveLength(1);
    assertOutbound(network.requests[0].body, target.format);
    if (stream) {
      const wire = await result.response.text();
      assertStream(wire, source);
      if (source === target.format && source === F.CLAUDE) expect(frames(wire).find(frame => frame.data.type === "message_stop").data.opaque).toEqual({ retained: true });
      if (source === target.format && source === F.OPENAI_RESPONSES) expect(frames(wire).find(frame => frame.data.type === "response.completed").data.response.output[0].encrypted_content).toBe("native-opaque-reasoning");
    } else {
      const json = await result.response.json();
      assertJson(json, source);
      if (source === target.format) expect(json.opaque).toEqual({ retained: true });
    }
    expect(JSON.stringify(body)).toBe(before);
  });
});
