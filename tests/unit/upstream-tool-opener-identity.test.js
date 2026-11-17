import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}), saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}), enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));
import { handleStreamingResponse } from "../../open-sse/handlers/chatCore/streamingHandler.js";
import { handleForcedSSEToJson } from "../../open-sse/handlers/chatCore/sseToJsonHandler.js";
import { createStreamController } from "../../open-sse/utils/streamHandler.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";
import { createChatToolIdentityBuffer } from "../../open-sse/utils/chatDelta.js";

const nativeFetch = globalThis.fetch;
const frame = value => `data: ${JSON.stringify(value)}\n\n`;
const chat = (delta, finish_reason = null, index = 0) => ({ id: "chatcmpl-opener-regression", choices: [{ index, delta, finish_reason }] });
const tool = (index, name, argumentsText = "", extra = {}) => ({ index, type: "function", function: { name, arguments: argumentsText }, ...extra });
const usage = { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 };
const finish = (reason = "tool_calls", index = 0) => chat({}, reason, index);
const trailer = frame({ choices: [], usage }) + "data: [DONE]\n\n";
const servers = [];

afterEach(async () => {
  for (const server of servers) server.closeAllConnections();
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
});

async function upstream(wire, hold = false) {
  let release;
  const released = new Promise(resolve => { release = resolve; });
  const server = createServer(async (_request, response) => {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    if (hold) { response.write(wire[0]); await released; response.end(wire.slice(1).join("")); }
    else response.end(wire);
  });
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const response = await nativeFetch(`http://127.0.0.1:${server.address().port}`);
  return { response, release };
}

function context(response, sourceFormat = F.OPENAI, n = 1) {
  return {
    providerResponse: response, provider: "offline", model: "wire-model", targetFormat: F.OPENAI, sourceFormat,
    body: { model: "wire-model", messages: [], n }, stream: true, requestStartTime: Date.now(),
    streamController: createStreamController({ log: { line() {}, errorLine() {} } }),
    trackDone: vi.fn(), appendLog: vi.fn(),
    reqLogger: { logProviderResponse: vi.fn(), logConvertedResponse: vi.fn(), appendConvertedChunk: vi.fn() },
  };
}

function events(wire) {
  return wire.split("\n\n").flatMap(block => {
    const line = block.split("\n").find(value => value.startsWith("data: "));
    if (!line || line === "data: [DONE]") return [];
    return [JSON.parse(line.slice(6))];
  });
}
const calls = wire => events(wire).flatMap(event => event.choices || []).flatMap(choice => (choice.delta?.tool_calls || []).map(call => ({ choice: choice.index, ...call })));

async function stream(wire, sourceFormat = F.OPENAI, n = 1) {
  const input = await upstream(wire);
  const result = await handleStreamingResponse(context(input.response, sourceFormat, n));
  expect(result.success).toBe(true);
  return result.response.text();
}

async function forced(wire, n = 1) {
  const input = await upstream(wire);
  return handleForcedSSEToJson({ ...context(input.response, F.OPENAI, n), stream: false });
}

describe("upstream #4992 Chat tool opener identity", () => {
  it("emits one gateway call ID before a valid idless tool finishes over real HTTP", async () => {
    const wire = await stream(frame(chat({ tool_calls: [tool(0, "lookup", '{"city":')] })) + frame(chat({ tool_calls: [{ index: 0, function: { arguments: '"München"}' } }] })) + frame(finish()) + trailer);
    const output = calls(wire);
    expect(output[0].id).toMatch(/^call_[a-zA-Z0-9_-]+$/);
    expect(output.filter(call => call.id)).toHaveLength(1);
    expect(output.map(call => call.function?.arguments || "").join("")).toBe('{"city":"München"}');
    expect(wire.indexOf(output[0].id)).toBeLessThan(wire.indexOf('"finish_reason":"tool_calls"'));
    expect(wire.match(/data: \[DONE\]/g)).toHaveLength(1);
  });

  it("returns a nonempty consistent tool ID in forced JSON and keeps requests isolated", async () => {
    const wire = frame(chat({ tool_calls: [tool(0, "lookup", "{}")] })) + frame(finish()) + trailer;
    const ids = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await forced(wire);
      expect(result.success).toBe(true);
      const response = await result.response.json();
      const call = response.choices[0].message.tool_calls[0];
      expect(call.id).toMatch(/^call_[a-zA-Z0-9_-]+$/);
      expect(call.function).toEqual({ name: "lookup", arguments: "{}" });
      expect(response.choices[0].finish_reason).toBe("tool_calls");
      expect(response.usage).toMatchObject(usage);
      const history = [{ role: "assistant", tool_calls: [call] }, { role: "tool", tool_call_id: call.id, content: "fixture" }];
      expect(history[1].tool_call_id).toBe(history[0].tool_calls[0].id);
      ids.push(call.id);
    }
    expect(new Set(ids).size).toBe(2);
  });

  it.each([false, true])("preserves a supplied opaque ID arriving after finish=%s and emits it only on the opener", async afterFinish => {
    const id = "provider-call_TSIG_b3BhcXVlLXNpZ25lZC1oaXN0b3J5PT0";
    const opaque = "opaque/provider+signature==";
    const opening = frame(chat({ tool_calls: [tool(0, "lookup", "{", { extra_content: { google: { thought_signature: opaque } } })] }));
    const late = frame(chat({ tool_calls: [{ index: 0, id, function: { arguments: "}" } }] }));
    const wire = opening + (afterFinish ? frame(finish()) + late : late + frame(finish())) + trailer;
    const output = calls(await stream(wire));
    expect(output[0].id).toBe(id);
    expect(output.filter(call => call.id)).toHaveLength(1);
    expect(output[0].extra_content).toEqual({ google: { thought_signature: opaque } });
    expect(output.map(call => call.function?.arguments || "").join("")).toBe("{}");
    const json = await forced(wire);
    expect((await json.response.json()).choices[0].message.tool_calls[0]).toMatchObject({ id, extra_content: { google: { thought_signature: opaque } } });
  });

  it("streams sibling text while waiting for an idless tool and keeps cancellation terminal", async () => {
    const input = await upstream([frame(chat({ content: "Visible immediately", tool_calls: [tool(0, "lookup", "{}")] })), frame(finish()) + trailer], true);
    const ctx = context(input.response);
    const result = await handleStreamingResponse(ctx);
    const reader = result.response.body.getReader();
    let text = "";
    while (!text.includes("Visible immediately")) text += new TextDecoder().decode((await reader.read()).value);
    expect(calls(text)).toEqual([]);
    await reader.cancel("caller left before the provider finished");
    input.release();
    expect(ctx.reqLogger.appendConvertedChunk.mock.calls.flat().join("")).not.toContain('"id":"call_');
  });

  it("keeps two choices and interleaved tools separate, preserving existing IDs and metadata", async () => {
    const wire = frame({ choices: [
      { index: 0, delta: { tool_calls: [tool(0, "first", "{"), tool(1, "second", "{}")] }, finish_reason: null },
      { index: 1, delta: { tool_calls: [tool(0, "other", "{}", { id: "provider-other-id" })] }, finish_reason: null },
    ] }) + frame(chat({ tool_calls: [{ index: 0, function: { arguments: "}" } }, { index: 1, extra_content: { google: { thought_signature: "second-opaque==" } } }] }))
      + frame(finish("tool_calls", 0)) + frame(finish("tool_calls", 1)) + trailer;
    const output = calls(await stream(wire, F.OPENAI, 2));
    const groups = new Map();
    for (const call of output) {
      const key = `${call.choice}:${call.index}`;
      const parts = groups.get(key) || [];
      parts.push(call); groups.set(key, parts);
    }
    expect([...groups.keys()].sort()).toEqual(["0:0", "0:1", "1:0"]);
    const ids = [];
    for (const [key, parts] of groups) {
      expect(parts[0].id).toBeTruthy();
      expect(parts.filter(part => part.id)).toHaveLength(1);
      expect(parts.map(part => part.function?.arguments || "").join("")).toBe("{}");
      ids.push(parts[0].id);
      if (key === "1:0") expect(parts[0].id).toBe("provider-other-id");
    }
    expect(new Set(ids).size).toBe(3);
    expect(groups.get("0:1").at(-1).extra_content).toEqual({ google: { thought_signature: "second-opaque==" } });
    const json = await forced(wire, 2);
    expect((await json.response.json()).choices.map(choice => choice.message.tool_calls.length)).toEqual([2, 1]);
  });

  it.each([F.CLAUDE, F.OPENAI_RESPONSES])("preserves native %s framing when the Chat provider omitted an ID", async source => {
    const wire = await stream(frame(chat({ tool_calls: [tool(0, "lookup", "{}")] })) + frame(finish()) + trailer, source);
    const output = events(wire);
    if (source === F.CLAUDE) {
      const starts = output.filter(event => event.type === "content_block_start" && event.content_block.type === "tool_use");
      expect(starts).toHaveLength(1);
      expect(starts[0].content_block.id).toMatch(/^call_/);
      expect(wire).toContain("event: message_stop");
      expect(wire).not.toContain("[DONE]");
    } else {
      const done = output.find(event => event.type === "response.output_item.done" && event.item.type === "function_call");
      expect(done.item.call_id).toMatch(/^call_/);
      expect(done.item.arguments).toBe("{}");
      expect(wire).toContain("event: response.completed");
    }
  });

  it.each(["eof", "done", "length", "error", "invalid-arguments"])("never generates an ID for an incomplete or failed tool (%s)", async failure => {
    const opening = frame(chat({ content: "Partial", tool_calls: [tool(0, "lookup", failure === "invalid-arguments" ? "{" : "{}")] }));
    const tail = failure === "done" ? "data: [DONE]\n\n" : failure === "length" ? frame(finish("length")) + trailer
      : failure === "error" ? frame({ error: { message: "Synthetic upstream failure" } }) + trailer
        : failure === "invalid-arguments" ? frame(finish()) + trailer : "";
    const wire = await stream(opening + tail);
    expect(calls(wire)).toEqual([]);
    if (failure === "error") expect(events(wire).some(event => event.error?.message === "Synthetic upstream failure")).toBe(true);
    else expect(wire).toContain('"finish_reason":"network_error"');
    const json = await forced(opening + tail);
    expect(json.success).toBe(false);
    expect(json.response.status).toBe(502);
  });

  it("never allocates an identity for null or index-only placeholders", async () => {
    const wire = await stream(frame(chat({ content: "No tool", tool_calls: [null, { index: 23, id: null, function: null }] })) + frame(finish("stop")) + trailer);
    expect(calls(wire)).toEqual([]);
    expect(wire).not.toContain('"id":"call_');
    expect(wire).toContain('"finish_reason":"stop"');
  });

  it("commits a valid idless tool within the existing grace when upstream holds the transport open", async () => {
    const input = await upstream([frame(chat({ tool_calls: [tool(0, "lookup", "{}")] })) + frame(finish()), ""], true);
    const result = await handleStreamingResponse(context(input.response));
    const wire = await result.response.text();
    input.release();
    expect(calls(wire)[0].id).toMatch(/^call_/);
    expect(wire).toContain('"finish_reason":"tool_calls"');
    expect(wire.match(/data: \[DONE\]/g)).toHaveLength(1);
  }, 10000);

  it.each([
    { maxBufferedChars: 512, maxBufferedFrames: 1000 },
    { maxBufferedChars: 1024 * 1024, maxBufferedFrames: 2 },
  ])("fails closed when pending ID-less fragments exceed their bounded retention policy (%j)", limits => {
    const buffer = createChatToolIdentityBuffer(limits);
    expect(() => {
      buffer.process(chat({ tool_calls: [tool(0, "lookup", "{")] }));
      for (let index = 0; index < 10; index++) buffer.process(chat({ tool_calls: [{ index: 0, function: { arguments: "x".repeat(32) } }] }));
    }).toThrow(RangeError);
    buffer.clear();
    expect(buffer.hasPending()).toBe(false);
  });
});
