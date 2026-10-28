import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { CommandCodeExecutor } from "../../open-sse/executors/commandcode.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { openaiToCommandCodeRequest } from "../../open-sse/translator/request/openai-to-commandcode.js";
import {
  buildCommandCodeHeaders,
  COMMAND_CODE_WORKING_DIR,
  slugifyPath,
  createCommandCodeSessionId,
} from "../../open-sse/shared/commandCodeHeaders.js";

const MODEL = "deepseek/deepseek-v4-pro";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PNG_A = "iVBORw0KGgoAAAANSUhEUgAAAAE=";
const PNG_B = "iVBORw0KGgoAAAANSUhEUgAAAAI=";
const image = data => ({ type: "image_url", image_url: { url: `data:image/png;base64,${data}` } });
const reply = () => new Response('{"type":"text-delta","delta":"fixture"}\n{"type":"finish","finishReason":"stop"}\n');
const failureEvent = () => new Response('{"type":"error","error":{"statusCode":503,"message":"unavailable"}}\n');
const wireCall = index => {
  const [url, init] = proxyAwareFetch.mock.calls[index];
  return { url, headers: new Headers(init.headers), body: JSON.parse(init.body) };
};

beforeEach(() => {
  proxyAwareFetch.mockReset();
  proxyAwareFetch.mockImplementation(async () => reply());
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected real network request"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("CommandCode CLI identity", () => {
  it.each([
    ["/home/user/My Project", "home-user-my-project"],
    ["/home/u/MyProject", "home-u-my-project"],
    ["Déjà Vu!", "deja-vu"],
    ["I ♥ Dogs & Cats", "i-love-dogs-and-cats"],
    ["útflækur", "utflaekur"],
    ["C:\\Users\\MyProject", "c-users-my-project"],
    ["", ""],
  ])("slugifies %s like the upstream CLI", (input, expected) => {
    expect(slugifyPath(input)).toBe(expected);
  });

  it("generates fresh session IDs without exposing or deriving from client values", () => {
    const id = createCommandCodeSessionId();
    expect(id).toMatch(UUID_V4);
    expect(id).not.toContain("private-session-fixture");
    expect(createCommandCodeSessionId()).not.toBe(createCommandCodeSessionId());
  });

  it("includes the CLI 1.88 headers without adding unrelated session headers", () => {
    const headers = new Headers(buildCommandCodeHeaders({
      apiKey: "fixture-key", sessionId: "fixture-thread", workingDir: "/My Work/Repo", accept: "application/json",
    }));
    expect(Object.fromEntries(headers)).toEqual({
      accept: "application/json",
      authorization: "Bearer fixture-key",
      "content-type": "application/json",
      "user-agent": "cli",
      "x-cli-environment": "production",
      "x-cli-surface": "cli",
      "x-command-code-version": "1.88.0",
      "x-project-slug": "my-work-repo",
      "x-session-id": "fixture-thread",
      "x-taste-learning": "false",
    });
    expect(headers.has("x-opencode-session")).toBe(false);
    expect(headers.has("x-session-affinity")).toBe(false);
    const unauthenticated = new Headers(buildCommandCodeHeaders());
    expect(unauthenticated.has("authorization")).toBe(false);
    expect(unauthenticated.get("x-session-id")).toMatch(UUID_V4);
  });
});

describe("CommandCode actual outbound requests", () => {
  it("does not infer an unscoped conversation ID through the public translator", () => {
    const source = { messages: [{ role: "user", content: "fixture" }] };
    const before = structuredClone(source);
    const credentials = { apiKey: "fixture-key", rawHeaders: { "x-session-id": "private-session-a" } };
    const translate = () => translateRequest(FORMATS.OPENAI, FORMATS.COMMANDCODE, MODEL, source, true, credentials, "commandcode", null, [], "fixture-connection");
    const first = translate();
    const second = translate();
    credentials.rawHeaders["x-session-id"] = "private-session-b";
    const third = translate();
    expect(first.threadId).toMatch(UUID_V4);
    expect(second.threadId).not.toBe(first.threadId);
    expect(third.threadId).not.toBe(first.threadId);
    expect(JSON.stringify([first, second, third])).not.toContain("private-session");
    expect(source).toEqual(before);
  });

  it("preserves text, tool results and typed user/tool images across the public translation and transport", async () => {
    const source = {
      messages: [
        { role: "system", content: "Compacted context." },
        { role: "user", content: [{ type: "text", text: "Inspect" }, image(PNG_A)] },
        { role: "assistant", content: null, tool_calls: [
          { id: "call_1", type: "function", function: { name: "read", arguments: '{"path":"a.png"}' } },
          { id: "call_2", type: "function", function: { name: "read", arguments: '{"path":"b.png"}' } },
        ] },
        { role: "tool", tool_call_id: "call_1", name: "read", content: [{ type: "text", text: "first image" }, image(PNG_A)] },
        { role: "tool", tool_call_id: "call_2", name: "read", content: [image(PNG_B)] },
        { role: "user", content: "Compare them." },
      ],
      tools: [{ type: "function", function: { name: "read", description: "Read an image", parameters: { type: "object" } } }],
      max_completion_tokens: 384000,
      temperature: 0.7,
      top_p: 0.9,
    };
    const original = structuredClone(source);
    const credentials = {
      apiKey: "fixture-api-secret", accessToken: "fixture-other-secret",
      rawHeaders: { "x-session-id": "fixture-client-session-secret", "x-private": "fixture-private-header" },
    };
    const translated = translateRequest(FORMATS.OPENAI, FORMATS.COMMANDCODE, MODEL, source, true, credentials, "commandcode", null, [], "fixture-connection");
    const translatedBefore = structuredClone(translated);
    const log = { debug: vi.fn() };
    const result = await new CommandCodeExecutor().execute({ model: MODEL, body: translated, stream: true, credentials, log });
    const { url, headers, body } = wireCall(0);

    expect(url).toBe("https://api.commandcode.ai/alpha/generate");
    expect(headers.get("authorization")).toBe("Bearer fixture-api-secret");
    expect(headers.get("accept")).toBe("text/event-stream");
    expect(headers.get("x-session-id")).toBe(body.threadId);
    expect(body.threadId).toMatch(UUID_V4);
    expect(headers.get("x-project-slug")).toBe(slugifyPath(body.config.workingDir));
    expect(body.params).toMatchObject({ system: "Compacted context.", model: MODEL, stream: true, max_tokens: 200000, temperature: 0.7, top_p: 0.9 });
    expect(body.params.tools[0]).toMatchObject({ name: "read", description: "Read an image", input_schema: { type: "object" } });
    const messages = body.params.messages;
    expect(messages.map(m => m.role)).toEqual(["user", "assistant", "tool", "tool", "user", "user"]);
    expect(messages[0].content[1]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: PNG_A } });
    expect(messages[1].content.filter(b => b.type === "tool-call").map(b => [b.toolCallId, b.input.path])).toEqual([["call_1", "a.png"], ["call_2", "b.png"]]);
    expect(messages[2].content[0].output).toEqual({ type: "text", value: "first image" });
    expect(messages[3].content[0].output).toEqual({ type: "text", value: "" });
    expect(messages[4].content.map(b => b.source?.data)).toEqual([PNG_A, PNG_B]);
    expect(JSON.stringify(body.params.messages.filter(m => m.role === "tool"))).not.toContain(PNG_A);
    expect(JSON.stringify(body.params.messages.filter(m => m.role === "tool"))).not.toContain(PNG_B);
    expect(source).toEqual(original);
    expect(translated).toEqual(translatedBefore);
    for (const secret of ["fixture-api-secret", "fixture-other-secret", "fixture-client-session-secret", "fixture-private-header"]) {
      expect(JSON.stringify(body)).not.toContain(secret);
      expect(JSON.stringify(log.debug.mock.calls)).not.toContain(secret);
      expect(JSON.stringify([...headers].filter(([name]) => name !== "authorization"))).not.toContain(secret);
    }
    expect(result.responseFormat).toBe(FORMATS.OPENAI);
    expect(await result.response.text()).toContain("data: [DONE]");
  });

  it("keeps concurrent sessions, workspaces and credentials isolated on the shared executor", async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    proxyAwareFetch.mockImplementation(async () => {
      if (proxyAwareFetch.mock.calls.length === 2) release();
      await gate;
      return reply();
    });
    const executor = new CommandCodeExecutor();
    const credentialsA = { apiKey: "fixture-key-a", _clientSessionId: "private-session-a" };
    const credentialsB = { apiKey: "fixture-key-b", _clientSessionId: "private-session-b" };
    const source = { messages: [{ role: "user", content: "fixture" }] };
    const a = openaiToCommandCodeRequest(MODEL, source, true, credentialsA);
    const b = openaiToCommandCodeRequest(MODEL, source, true, credentialsB);
    a.config.workingDir = "/Workspace Alpha";
    b.config.workingDir = "/Workspace Beta";
    const results = await Promise.all([
      executor.execute({ model: MODEL, body: a, stream: true, credentials: credentialsA }),
      executor.execute({ model: MODEL, body: b, stream: true, credentials: credentialsB }),
    ]);
    const calls = [wireCall(0), wireCall(1)];
    for (const [index, id, slug, key] of [[0, a.threadId, "workspace-alpha", "fixture-key-a"], [1, b.threadId, "workspace-beta", "fixture-key-b"]]) {
      expect(calls[index].headers.get("x-session-id")).toBe(id);
      expect(calls[index].headers.get("x-session-id")).toBe(calls[index].body.threadId);
      expect(calls[index].headers.get("x-project-slug")).toBe(slug);
      expect(calls[index].headers.get("authorization")).toBe(`Bearer ${key}`);
    }
    expect(a.threadId).not.toBe(b.threadId);
    await Promise.all(results.map(result => result.response.text()));
  });

  it("uses the existing native thread and actual working directory without mutating the input", async () => {
    const body = { threadId: "native-thread", config: { workingDir: "/AnotherProject", custom: true }, params: { model: MODEL, messages: [], max_tokens: 300000 } };
    const before = structuredClone(body);
    const result = await new CommandCodeExecutor().execute({ model: MODEL, body, stream: false, credentials: { accessToken: "fixture-access" } });
    const call = wireCall(0);
    expect(call.headers.get("x-session-id")).toBe("native-thread");
    expect(call.headers.get("x-project-slug")).toBe("another-project");
    expect(call.headers.get("authorization")).toBe("Bearer fixture-access");
    expect(call.headers.has("accept")).toBe(false);
    expect(call.body).toMatchObject({ threadId: "native-thread", stream: true, config: { workingDir: "/AnotherProject", custom: true }, params: { max_tokens: 200000 } });
    expect(body).toEqual(before);
    await result.response.text();
  });

  it("overrides case-variant configured session headers and accepts frozen caller inputs", async () => {
    const executor = new CommandCodeExecutor();
    executor.config = { ...executor.config, headers: {
      ...executor.config.headers, "X-Session-Id": "wrong", "X-Project-Slug": "wrong", authorization: "Bearer wrong",
    } };
    const body = Object.freeze({
      threadId: "native-thread",
      config: Object.freeze({ workingDir: "/Frozen Workspace" }),
      params: Object.freeze({ model: MODEL, messages: Object.freeze([]), max_tokens: 300000 }),
    });
    const result = await executor.execute({ model: MODEL, body, stream: true, credentials: { apiKey: "fixture-key" } });
    const call = wireCall(0);
    expect(call.headers.get("x-session-id")).toBe(call.body.threadId);
    expect(call.headers.get("x-project-slug")).toBe(slugifyPath(call.body.config.workingDir));
    expect(call.headers.get("authorization")).toBe("Bearer fixture-key");
    expect(call.body.params.max_tokens).toBe(200000);
    expect(body.params.max_tokens).toBe(300000);
    await result.response.text();
  });

  it.each([" bad-thread", "bad\nthread", 123])("rejects an invalid native thread without emitting it or making a request", async threadId => {
    const executor = new CommandCodeExecutor();
    const error = await executor.execute({ model: MODEL, body: { threadId }, stream: true, credentials: {} }).catch(err => err);
    expect(error).toBeInstanceOf(TypeError);
    expect(error.message).toBe("CommandCode threadId must be a header-safe string");
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });

  it("creates missing native IDs once and keeps them aligned through an HTTP retry", async () => {
    proxyAwareFetch.mockImplementationOnce(async () => new Response("retry", { status: 503 }));
    const executor = new CommandCodeExecutor();
    executor.config = { ...executor.config, retry: { 503: { attempts: 1, delayMs: 0 } } };
    const body = { params: { model: MODEL, messages: [] } };
    const before = structuredClone(body);
    const result = await executor.execute({ model: MODEL, body, stream: false, credentials: {} });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
    const first = wireCall(0);
    const second = wireCall(1);
    expect(first.body.threadId).toMatch(UUID_V4);
    expect(first.body.config.workingDir).toBe(COMMAND_CODE_WORKING_DIR);
    for (const call of [first, second]) {
      expect(call.headers.get("x-session-id")).toBe(first.body.threadId);
      expect(call.body.threadId).toBe(first.body.threadId);
      expect(call.headers.get("x-project-slug")).toBe(slugifyPath(call.body.config.workingDir));
      expect(call.headers.has("authorization")).toBe(false);
    }
    expect(body).toEqual(before);
    await result.response.text();
  });

  it("keeps the same ID and headers when an NDJSON error frame triggers an executor retry", async () => {
    proxyAwareFetch.mockImplementationOnce(async () => failureEvent());
    const body = { params: { model: MODEL, messages: [] } };
    const before = structuredClone(body);
    const result = await new CommandCodeExecutor().execute({ model: MODEL, body, stream: true, credentials: { apiKey: "fixture-key" } });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
    const first = wireCall(0);
    const second = wireCall(1);
    expect(first.body.threadId).toMatch(UUID_V4);
    expect(second.body.threadId).toBe(first.body.threadId);
    for (const call of [first, second]) {
      expect(call.headers.get("x-session-id")).toBe(call.body.threadId);
      expect(call.headers.get("x-project-slug")).toBe(slugifyPath(call.body.config.workingDir));
      expect(call.headers.get("authorization")).toBe("Bearer fixture-key");
    }
    expect(body).toEqual(before);
    expect(await result.response.text()).toContain("data: [DONE]");
  });

  it("does not dial again when the caller aborts during an NDJSON retry", async () => {
    proxyAwareFetch.mockImplementation(async () => failureEvent());
    const controller = new AbortController();
    const reason = new Error("fixture cancellation");
    const log = { debug: vi.fn(() => controller.abort(reason)) };
    await expect(new CommandCodeExecutor().execute({ model: MODEL, body: { params: { messages: [] } }, stream: true, credentials: {}, signal: controller.signal, log })).rejects.toBe(reason);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it("propagates caller cancellation while inspecting the first NDJSON frame", async () => {
    let peekStarted;
    const started = new Promise(resolve => { peekStarted = resolve; });
    proxyAwareFetch.mockImplementation(async (_url, init) => new Response(new ReadableStream({
      start(streamController) {
        init.signal.addEventListener("abort", () => streamController.error(init.signal.reason), { once: true });
      },
      pull() { peekStarted(); },
    }, { highWaterMark: 0 })));
    const controller = new AbortController();
    const reason = new Error("fixture cancelled during peek");
    const execution = new CommandCodeExecutor().execute({ model: MODEL, body: { params: { messages: [] } }, stream: true, credentials: {}, signal: controller.signal });
    await started;
    controller.abort(reason);
    await expect(execution).rejects.toBe(reason);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });
});
