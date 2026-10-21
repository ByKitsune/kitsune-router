import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Keep the actual route/adapter. Substitute only the chat/auth boundary; all
// requests and responses below are real Web Request/Response objects, offline.
const chat = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock("@/sse/handlers/chat.js", () => ({ handleChat: (...args) => chat.handle(...args) }));
vi.mock("open-sse/translator/index.js", () => ({ initTranslators() {} }));
import { transformToOllama } from "../../open-sse/utils/ollamaTransform.js";
import { POST } from "../../src/app/api/v1/api/chat/route.js";

const encoder = new TextEncoder();
const headers = {
  "x-request-id": "req_ollama_fixture", "x-ratelimit-limit": "60", "x-ratelimit-remaining": "59",
  "x-ratelimit-reset": "1234567890", "access-control-allow-origin": "https://client.example",
};
const completion = (extra = {}) => ({
  id: "chat_fixture", object: "chat.completion", model: "upstream-model", created: 1792540800,
  choices: [{ index: 0, message: { role: "assistant", content: "Synthetic reply 🌍 中文" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 17, completion_tokens: 5, total_tokens: 22 }, ...extra,
});
const chunk = (delta, finish_reason = null, extra = {}) => ({
  id: "chat_fixture", object: "chat.completion.chunk", model: "stream-model", choices: [{ index: 0, delta, finish_reason }], ...extra,
});
const frame = value => `data: ${JSON.stringify(value)}\r\n\r\n`;
const source = (text, width = 1, extraHeaders = {}) => {
  const bytes = encoder.encode(text);
  return new Response(new ReadableStream({ start(controller) {
    for (let offset = 0; offset < bytes.length; offset += width) controller.enqueue(bytes.slice(offset, offset + width));
    controller.close();
  } }), { headers: { ...headers, "content-type": "text/event-stream", ...extraHeaders } });
};
const lines = async response => (await response.text()).trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
beforeEach(() => { chat.handle.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("Ollama JSON response conversion", () => {
  it("returns the actual nonstreaming text, model and usage as one Ollama JSON object", async () => {
    const upstream = Response.json(completion(), { status: 201, statusText: "Created", headers: { ...headers, "content-length": "9999" } });
    const response = await transformToOllama(upstream, "request-fallback");
    expect(response.status).toBe(201);
    expect(response.statusText).toBe("Created");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-length")).toBeNull();
    for (const [key, value] of Object.entries(headers)) expect(response.headers.get(key)).toBe(value);
    expect(await response.json()).toMatchObject({
      model: "upstream-model", message: { role: "assistant", content: "Synthetic reply 🌍 中文" },
      done: true, done_reason: "stop", prompt_eval_count: 17, eval_count: 5,
    });
  });

  it("lowers real JSON function arguments without inventing arguments or duration counters", async () => {
    const body = completion({ choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [
      { id: "call_a", type: "function", function: { name: "capture", arguments: '{"label":"🌍","enabled":false,"count":0}' } },
    ] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 0, completion_tokens: 0 } });
    const response = await transformToOllama(Response.json(body), "fallback");
    const result = await response.json();
    expect(result.message).toEqual({ role: "assistant", content: "", tool_calls: [
      { function: { name: "capture", arguments: { label: "🌍", enabled: false, count: 0 } } },
    ] });
    expect(result.prompt_eval_count).toBe(0);
    expect(result.eval_count).toBe(0);
    expect(result).not.toHaveProperty("total_duration");
    expect(result).not.toHaveProperty("eval_duration");
  });

  it.each(["{broken", "", "[]", '"not an object"'])("returns an explicit error for malformed/unsupported JSON tool arguments %j", async argumentsText => {
    const body = completion({ choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [
      { type: "function", function: { name: "capture", arguments: argumentsText } },
    ] }, finish_reason: "tool_calls" }] });
    const result = await (await transformToOllama(Response.json(body), "fallback")).json();
    expect(result.error).toMatch(/tool.*arguments/i);
    expect(result.done).not.toBe(true);
    expect(result).not.toHaveProperty("message.tool_calls");
  });

  it.each([
    { choices: [] }, { unexpected: "not a completion" },
    { choices: [{ message: { role: "assistant", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }] }, finish_reason: "stop" }] },
  ])("reports unrecognized or unsupported JSON output instead of an empty successful completion: %j", async body => {
    const result = await (await transformToOllama(Response.json(body), "fallback")).json();
    expect(result.error).toEqual(expect.any(String));
    expect(result.done).not.toBe(true);
  });

  it("does not silently discard malformed JSON or an HTML success page", async () => {
    for (const upstream of [
      new Response('{"choices":', { headers: { "content-type": "application/json" } }),
      new Response("<html>not model output</html>", { headers: { "content-type": "text/html" } }),
    ]) {
      const result = await (await transformToOllama(upstream, "fallback")).json();
      expect(result.error).toEqual(expect.any(String));
      expect(result.done).not.toBe(true);
    }
  });

  it("rejects a tool_calls finish with no actual tool call instead of fabricating an empty result", async () => {
    const body = completion({ choices: [{ index: 0, message: { role: "assistant", content: "", tool_calls: [] }, finish_reason: "tool_calls" }] });
    const result = await (await transformToOllama(Response.json(body), "fallback")).json();
    expect(result.error).toMatch(/tool/i);
    expect(result.done).not.toBe(true);
  });

  it("reports a missing successful response body instead of returning empty model output", async () => {
    const response = await transformToOllama(new Response(null, { status: 200, headers }), "fallback");
    expect(response.headers.get("x-request-id")).toBe("req_ollama_fixture");
    expect((await response.json()).error).toEqual(expect.any(String));
  });

  it.each([400, 401, 403, 429, 503])("retains upstream HTTP %i JSON errors, authentication, rate and correlation headers", async status => {
    const body = { error: { message: "Synthetic upstream refusal", type: "invalid_request_error", code: "fixture_error" } };
    const response = await transformToOllama(Response.json(body, { status, headers: {
      ...headers, "retry-after": "60", "www-authenticate": 'Bearer realm="fixture"',
    } }), "fallback");
    expect(response.status).toBe(status);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="fixture"');
    for (const [key, value] of Object.entries(headers)) expect(response.headers.get(key)).toBe(value);
    expect(await response.json()).toEqual(body);
  });
});

describe("Ollama SSE to NDJSON conversion", () => {
  it("decodes byte-fragmented UTF-8 and emits one terminal after finish, usage, DONE and flush", async () => {
    const wire = frame(chunk({ role: "assistant", content: "🌍 中文 café" }))
      + frame(chunk({}, "stop"))
      + frame({ choices: [], usage: { prompt_tokens: 17, completion_tokens: 5 } })
      + "data: [DONE]\r\n\r\ndata: [DONE]\r\n\r\n";
    const response = await transformToOllama(source(wire), "fallback");
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    for (const [key, value] of Object.entries(headers)) expect(response.headers.get(key)).toBe(value);
    const output = await lines(response);
    expect(output.filter(item => item.done)).toHaveLength(1);
    expect(output.map(item => item.message?.content || "").join("")).toBe("🌍 中文 café");
    expect(output.at(-1)).toMatchObject({ model: "stream-model", done: true, prompt_eval_count: 17, eval_count: 5 });
  });

  it("reassembles parallel tool name/argument fragments exactly, retaining only one final tool payload", async () => {
    const wire = frame(chunk({ tool_calls: [
      { index: 0, id: "a", type: "function", function: { name: "cap", arguments: '{"label":"' } },
      { index: 1, id: "b", type: "function", function: { name: "read", arguments: '{"path":' } },
    ] })) + frame(chunk({ tool_calls: [
      { index: 1, function: { arguments: '"中文/file"}' } },
      { index: 0, function: { name: "ture", arguments: '🌍","count":0}' } },
    ] })) + frame(chunk({}, "tool_calls")) + "data: [DONE]\n\n";
    const output = await lines(await transformToOllama(source(wire), "fallback"));
    expect(output.filter(item => item.done)).toHaveLength(1);
    expect(output.at(-1).message.tool_calls).toEqual([
      { function: { name: "capture", arguments: { label: "🌍", count: 0 } } },
      { function: { name: "read", arguments: { path: "中文/file" } } },
    ]);
  });

  it.each(["\n", "\r\n", "\r"])("handles SSE multiline data, comments and an unterminated final line with %j delimiters", async delimiter => {
    const pretty = JSON.stringify(chunk({ content: "tail" }), null, 2).split("\n").map(line => `data: ${line}`).join(delimiter);
    const wire = `: keepalive${delimiter}${delimiter}${pretty}${delimiter}${delimiter}data: ${JSON.stringify(chunk({}, "length"))}`;
    const output = await lines(await transformToOllama(source(wire, 3), "fallback"));
    expect(output.map(item => item.message?.content || "").join("")).toBe("tail");
    expect(output.filter(item => item.done)).toHaveLength(1);
    expect(output.at(-1).done_reason).toBe("length");
  });

  it.each([
    'data: {bad json}\n\n',
    frame(chunk({ content: "unfinished" })),
    "data: [DONE]\n\n",
    frame({ unknown: "unrecognized event" }),
    frame(chunk({ tool_calls: [{ index: 0, type: "function", function: { name: "capture", arguments: "{broken" } }] })) + frame(chunk({}, "tool_calls")) + "data: [DONE]\n\n",
  ])("emits one explicit error, not a fabricated successful terminal, for malformed/truncated SSE %j", async wire => {
    const output = await lines(await transformToOllama(source(wire, 4), "fallback"));
    expect(output.filter(item => item.error)).toHaveLength(1);
    expect(output.some(item => item.done === true)).toBe(false);
  });

  it.each(["completed", "malformed"])("closes a %s source that stays open after its terminal event instead of keeping upstream work alive", async kind => {
    let input;
    const cancel = vi.fn();
    const upstream = new Response(new ReadableStream({ start(controller) { input = controller; }, cancel }), { headers: { "content-type": "text/event-stream" } });
    const response = await transformToOllama(upstream, "fallback");
    const execution = response.text();
    input.enqueue(encoder.encode(kind === "completed"
      ? frame(chunk({ content: "done" })) + frame(chunk({}, "stop")) + "data: [DONE]\n\n"
      : "data: {bad}\n\n"));
    let timer;
    const outcome = await Promise.race([
      execution.then(text => ({ text })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ pending: true }), 100); }),
    ]);
    clearTimeout(timer);
    if (outcome.pending) input.close();
    await execution;
    expect(outcome.pending).not.toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    const output = outcome.text.trim().split("\n").map(line => JSON.parse(line));
    if (kind === "completed") expect(output.filter(item => item.done)).toHaveLength(1);
    else expect(output.filter(item => item.error)).toHaveLength(1);
  });

  it("cancels the source when the downstream Ollama client cancels", async () => {
    let input;
    const cancel = vi.fn();
    const upstream = new Response(new ReadableStream({ start(controller) { input = controller; }, cancel }), { headers: { "content-type": "text/event-stream" } });
    const response = await transformToOllama(upstream, "fallback");
    const reader = response.body.getReader();
    input.enqueue(encoder.encode(frame(chunk({ content: "first" }))));
    expect(JSON.parse(new TextDecoder().decode((await reader.read()).value)).message.content).toBe("first");
    await reader.cancel("caller stopped");
    // Node 22 settles the readable cancellation before the upstream pipe's
    // cleanup task; require prompt propagation, not a newer-runtime ordering.
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1), { timeout: 500, interval: 1 });
  });

  it("does not combine different tool identities that reuse one stream index", async () => {
    const wire = frame(chunk({ tool_calls: [{ index: 0, id: "a", type: "function", function: { name: "capture", arguments: '{"path":' } }] }))
      + frame(chunk({ tool_calls: [{ index: 0, id: "b", type: "function", function: { name: "other", arguments: '"other"}' } }] }))
      + frame(chunk({}, "tool_calls")) + "data: [DONE]\n\n";
    const output = await lines(await transformToOllama(source(wire, 8), "fallback"));
    expect(output.filter(item => item.error)).toHaveLength(1);
    expect(output.some(item => item.done)).toBe(false);
  });
});

describe("Ollama public route", () => {
  it("converts actual JSON output without cloning/parsing a second request body or dropping auth/correlation/rate headers", async () => {
    const request = new Request("http://localhost/v1/api/chat", { method: "POST", headers: {
      authorization: "Bearer synthetic-client-key", "content-type": "application/json",
    }, body: JSON.stringify({ model: "request-alias", stream: false, messages: [{ role: "user", content: "hi" }] }) });
    const clone = vi.spyOn(request, "clone");
    chat.handle.mockImplementation(async received => {
      expect(received).toBe(request);
      expect(received.headers.get("authorization")).toBe("Bearer synthetic-client-key");
      expect(await received.json()).toMatchObject({ model: "request-alias", stream: false });
      return Response.json(completion(), { headers });
    });
    const response = await POST(request);
    expect(clone).not.toHaveBeenCalled();
    expect(response.headers.get("x-request-id")).toBe("req_ollama_fixture");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("59");
    expect((await response.json()).message.content).toBe("Synthetic reply 🌍 中文");
  });

  it("lets authentication reject a real request without any adapter-side body read", async () => {
    const request = new Request("http://localhost/v1/api/chat", { method: "POST", body: "not even valid JSON" });
    const clone = vi.spyOn(request, "clone");
    chat.handle.mockImplementation(async received => {
      expect(received.bodyUsed).toBe(false);
      return Response.json({ error: { message: "Missing API key" } }, { status: 401, headers: { ...headers, "www-authenticate": "Bearer" } });
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(clone).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
    expect(await response.json()).toEqual({ error: { message: "Missing API key" } });
  });

  it("uses a stable legacy model fallback if the mapped response has no model", async () => {
    chat.handle.mockResolvedValue(Response.json(completion({ model: undefined })));
    const response = await POST(new Request("http://localhost/v1/api/chat", { method: "POST", body: "{}" }));
    expect((await response.json()).model).toBe("llama3.2");
  });

  it("preserves successful HTTP status and advisory headers on real streaming route requests", async () => {
    chat.handle.mockImplementation(async request => {
      expect(await request.json()).toMatchObject({ stream: true });
      const input = source(frame(chunk({ content: "route stream 🌍" })) + frame(chunk({}, "stop")) + "data: [DONE]\n\n");
      return new Response(input.body, { status: 203, headers: input.headers });
    });
    const response = await POST(new Request("http://localhost/v1/api/chat", { method: "POST", body: JSON.stringify({ stream: true }) }));
    expect(response.status).toBe(203);
    expect(response.headers.get("x-ratelimit-limit")).toBe("60");
    expect(response.headers.get("x-request-id")).toBe("req_ollama_fixture");
    const output = await lines(response);
    expect(output.map(item => item.message?.content || "").join("")).toBe("route stream 🌍");
    expect(output.filter(item => item.done)).toHaveLength(1);
  });
});
