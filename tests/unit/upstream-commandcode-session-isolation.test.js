import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { CommandCodeExecutor } from "../../open-sse/executors/commandcode.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { openaiToCommandCodeRequest } from "../../open-sse/translator/request/openai-to-commandcode.js";

const MODEL = "deepseek/deepseek-v4-pro";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONVERSATION = "fixture-private-conversation";
const PROVIDER_KEY = "fixture-upstream-key";

function translate(body, rawHeaders = {}, connectionId = "shared-provider-connection") {
  const credentials = { apiKey: PROVIDER_KEY, rawHeaders };
  const wire = translateRequest(FORMATS.OPENAI, FORMATS.COMMANDCODE, MODEL, body, true, credentials, "commandcode", null, [], connectionId);
  return { credentials, wire };
}

async function send(request, executor = new CommandCodeExecutor()) {
  const result = await executor.execute({ model: MODEL, body: request.wire, stream: true, credentials: request.credentials });
  await result.response.text();
}

const outbound = index => {
  const [, init] = proxyAwareFetch.mock.calls[index];
  return { body: JSON.parse(init.body), headers: new Headers(init.headers) };
};

beforeEach(() => {
  proxyAwareFetch.mockReset();
  proxyAwareFetch.mockImplementation(async () => new Response('{"type":"text-delta","delta":"ok"}\n{"type":"finish"}\n'));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected real network request"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("CommandCode translated session isolation", () => {
  it.each([
    [{ messages: [{ role: "user", content: "same first prompt" }] }],
    [{ messages: [{ role: "assistant", content: "The same long assistant response. ".repeat(4) }, { role: "user", content: "continue" }] }],
  ])("does not reuse connection or assistant-history fallbacks for separate requests", async body => {
    const first = translate(body);
    const second = translate(body);
    // These generic IDs collide under a shared connection/history. They are not
    // proof of a conversation or of a client identity for CommandCode.
    expect(first.credentials._clientSessionId).toBe(second.credentials._clientSessionId);
    expect(first.wire.threadId).toMatch(UUID_V4);
    expect(second.wire.threadId).toMatch(UUID_V4);
    expect(first.wire.threadId).not.toBe(second.wire.threadId);
    const executor = new CommandCodeExecutor();
    await Promise.all([send(first, executor), send(second, executor)]);
    const calls = [outbound(0), outbound(1)];
    expect(new Set(calls.map(call => call.body.threadId)).size).toBe(2);
    for (const call of calls) expect(call.headers.get("x-session-id")).toBe(call.body.threadId);
  });

  it("keeps separate clients isolated even when their explicit conversation IDs collide", async () => {
    const body = { messages: [{ role: "user", content: "fixture" }] };
    const first = translate(body, { authorization: "Bearer fixture-client-a", "x-session-id": CONVERSATION });
    const second = translate(body, { authorization: "Bearer fixture-client-b", "x-session-id": CONVERSATION });
    expect(first.credentials._clientSessionId).toBe(second.credentials._clientSessionId);
    expect(first.wire.threadId).not.toBe(second.wire.threadId);
    const executor = new CommandCodeExecutor();
    await Promise.all([send(first, executor), send(second, executor)]);
    for (const call of [outbound(0), outbound(1)]) {
      expect(call.headers.get("x-session-id")).toBe(call.body.threadId);
      expect(call.headers.get("authorization")).toBe(`Bearer ${PROVIDER_KEY}`);
      for (const secret of [CONVERSATION, "fixture-client-a", "fixture-client-b", "shared-provider-connection"]) {
        expect(JSON.stringify(call.body)).not.toContain(secret);
        expect(JSON.stringify([...call.headers])).not.toContain(secret);
      }
    }
  });

  it("does not claim continuity across turns without a verified tenant scope", async () => {
    // Raw Authorization is not trusted: local mode accepts requests without
    // validating it. Repeated explicit IDs must therefore still be isolated.
    const headers = { authorization: "Bearer fixture-unverified-client", "x-session-id": CONVERSATION };
    const first = translate({ messages: [{ role: "user", content: "turn one" }] }, headers);
    const second = translate({ messages: [{ role: "user", content: "turn one" }, { role: "assistant", content: "answer" }, { role: "user", content: "turn two" }] }, headers);
    expect(first.credentials._clientSessionId).toBe(CONVERSATION);
    expect(second.credentials._clientSessionId).toBe(CONVERSATION);
    expect(first.wire.threadId).not.toBe(second.wire.threadId);
    await send(first);
    await send(second);
    expect(outbound(0).headers.get("x-session-id")).toBe(outbound(0).body.threadId);
    expect(outbound(1).headers.get("x-session-id")).toBe(outbound(1).body.threadId);
  });

  it.each([
    [{ prompt_cache_key: CONVERSATION }, {}],
    [{ session_id: CONVERSATION }, {}],
    [{ conversation_id: CONVERSATION }, {}],
    [{ metadata: { user_id: CONVERSATION } }, {}],
    [{}, { "x-client-request-id": CONVERSATION }],
  ])("does not use an unscoped body or request identifier as a stable tenant identity", (fields, headers) => {
    const body = { messages: [{ role: "user", content: "fixture" }], ...fields };
    const first = translate(body, headers);
    const second = translate(body, headers);
    expect(first.wire.threadId).not.toBe(second.wire.threadId);
    expect(JSON.stringify(first.wire)).not.toContain(CONVERSATION);
  });

  it("does not trust an existing _clientSessionId on direct translator calls", () => {
    const body = { messages: [{ role: "user", content: "fixture" }] };
    const credentials = { apiKey: PROVIDER_KEY, _clientSessionId: CONVERSATION };
    const first = openaiToCommandCodeRequest(MODEL, body, true, credentials);
    const second = openaiToCommandCodeRequest(MODEL, body, true, credentials);
    expect(first.threadId).toMatch(UUID_V4);
    expect(first.threadId).not.toBe(second.threadId);
    expect(JSON.stringify(first)).not.toContain(CONVERSATION);
  });

  it("reuses the one translated thread on an HTTP retry, but not on a later request", async () => {
    proxyAwareFetch.mockImplementationOnce(async () => new Response("retry", { status: 503 }));
    const executor = new CommandCodeExecutor();
    executor.config = { ...executor.config, retry: { 503: { attempts: 1, delayMs: 0 } } };
    const body = { messages: [{ role: "user", content: "fixture" }] };
    const headers = { "x-session-id": CONVERSATION };
    const first = translate(body, headers);
    await send(first, executor);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
    for (const call of [outbound(0), outbound(1)]) {
      expect(call.body.threadId).toBe(first.wire.threadId);
      expect(call.headers.get("x-session-id")).toBe(first.wire.threadId);
    }
    expect(translate(body, headers).wire.threadId).not.toBe(first.wire.threadId);
  });

  it("retains a native caller's thread ID instead of re-scoping it", async () => {
    const request = {
      wire: { threadId: "native-conversation", params: { model: MODEL, messages: [] } },
      credentials: { apiKey: PROVIDER_KEY, rawHeaders: { "x-session-id": CONVERSATION } },
    };
    await send(request);
    expect(outbound(0).body.threadId).toBe("native-conversation");
    expect(outbound(0).headers.get("x-session-id")).toBe("native-conversation");
  });
});
