import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

const REDACT = "redact-thinking-2026-02-12";
const CLIENT_BETA = "context-management-2025-06-27";
const model = "claude-sonnet-4-6";
let connection = 0;

function credentials(extra = {}) {
  return { connectionId: `claude-header-contract-${++connection}`, accessToken: "sk-ant-oat-test", ...extra };
}

function requestBody(display, sessionId) {
  return {
    model,
    max_tokens: 4096,
    messages: [{ role: "user", content: "Explain the result" }],
    ...(display ? { thinking: { type: "adaptive", display } } : {}),
    ...(sessionId ? { metadata: { user_id: JSON.stringify({ session_id: sessionId }) } } : {}),
  };
}

async function outbound(executor, body, auth, extra = {}) {
  await executor.execute({ model, body, stream: true, credentials: auth, ...extra });
  const [url, init] = proxyAwareFetch.mock.calls.at(-1);
  return { url, headers: new Headers(init.headers), body: JSON.parse(init.body) };
}

beforeEach(() => {
  proxyAwareFetch.mockReset();
  proxyAwareFetch.mockResolvedValue(new Response("ok", { status: 200 }));
});

describe("Claude outbound request header contract", () => {
  it.each(["bad\r\nsession", "bad\u0000session", "bad\u001fsession", "bad\u007fsession", "x".repeat(257)])("does not send invalid session metadata in HTTP headers: %j", async session => {
    const sent = await outbound(new DefaultExecutor("claude"), requestBody(null, session), credentials());
    expect(sent.headers.has("x-claude-code-session-id")).toBe(false);
    expect(JSON.parse(sent.body.metadata.user_id).session_id).toBe(session);
  });

  it("uses the transformed body when selecting summarized-thinking betas", async () => {
    const executor = new DefaultExecutor("claude");
    const transform = executor.transformRequest.bind(executor);
    executor.transformRequest = (id, body) => transform(id, { ...body, thinking: { type: "adaptive", display: "summarized" } });
    const sent = await outbound(executor, requestBody("omitted"), credentials());
    expect(sent.body.thinking.display).toBe("summarized");
    expect(sent.headers.get("anthropic-beta").split(",")).not.toContain(REDACT);
  });

  it("retains explicit omitted display and its redact beta", async () => {
    const sent = await outbound(new DefaultExecutor("claude"), requestBody("omitted"), credentials());
    expect(sent.body.thinking).toEqual({ type: "adaptive", display: "omitted" });
    expect(sent.headers.get("anthropic-beta").split(",")).toContain(REDACT);
  });

  it("forwards OAuth metadata session per request without persisting it on credentials", async () => {
    const executor = new DefaultExecutor("claude");
    const auth = credentials();
    const first = await outbound(executor, requestBody(null, "session-one"), auth);
    const second = await outbound(executor, requestBody(null, "session-two"), auth);
    const third = await outbound(executor, requestBody(), auth);
    expect(first.headers.get("x-claude-code-session-id")).toBe("session-one");
    expect(second.headers.get("x-claude-code-session-id")).toBe("session-two");
    expect(third.headers.has("x-claude-code-session-id")).toBe(false);
    expect(auth).not.toHaveProperty("sessionId");
  });

  it("does not send OAuth session identity for API-key requests", async () => {
    const sent = await outbound(new DefaultExecutor("claude"), requestBody(null, "private-session"), credentials({ apiKey: "api-secret" }));
    expect(sent.headers.has("x-claude-code-session-id")).toBe(false);
    expect(sent.headers.get("x-api-key")).toBe("api-secret");
  });

  it("unions safe inbound betas without overriding auth or redacting summarized thinking", async () => {
    const sent = await outbound(new DefaultExecutor("claude"), requestBody("summarized", "metadata-session"), credentials({
      rawHeaders: { "Anthropic-Beta": `${CLIENT_BETA},${CLIENT_BETA},${REDACT},interleaved-thinking-20250514,bad flag`, "X-Claude-Code-Session-Id": "client-session", authorization: "Bearer attacker", "x-api-key": "attacker" },
    }));
    const flags = sent.headers.get("anthropic-beta").split(",");
    expect(flags.filter(flag => flag === CLIENT_BETA)).toEqual([CLIENT_BETA]);
    expect(flags).toContain("interleaved-thinking-20250514");
    expect(flags).not.toContain(REDACT);
    expect(flags).not.toContain("bad flag");
    expect(sent.headers.get("x-claude-code-session-id")).toBe("client-session");
    expect(sent.headers.get("authorization")).toBe("Bearer sk-ant-oat-test");
    expect(sent.headers.has("x-api-key")).toBe(false);
  });

  it("keeps rejected inbound beta flags out of retries and later turns for only that account", async () => {
    const executor = new DefaultExecutor("claude");
    const auth = credentials({ rawHeaders: { "anthropic-beta": CLIENT_BETA } });
    proxyAwareFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: `Unexpected value(s) \`${CLIENT_BETA}\` for the \`anthropic-beta\` header` } }), { status: 400 }));
    await outbound(executor, requestBody("summarized"), auth);
    expect(new Headers(proxyAwareFetch.mock.calls[0][1].headers).get("anthropic-beta").split(",")).toContain(CLIENT_BETA);
    expect(new Headers(proxyAwareFetch.mock.calls[1][1].headers).get("anthropic-beta").split(",")).not.toContain(CLIENT_BETA);
    const next = await outbound(executor, requestBody("summarized"), { ...auth });
    expect(next.headers.get("anthropic-beta").split(",")).not.toContain(CLIENT_BETA);
    const other = await outbound(executor, requestBody("summarized"), credentials({ rawHeaders: { "anthropic-beta": CLIENT_BETA } }));
    expect(other.headers.get("anthropic-beta").split(",")).toContain(CLIENT_BETA);
  });

  it.each(["anthropic-compatible-private", "openai-compatible-private"])("does not leak inbound Claude identity or betas to %s", async provider => {
    const sent = await outbound(new DefaultExecutor(provider), requestBody(null, "metadata-session"), credentials({
      apiKey: "gateway-secret", providerSpecificData: { baseUrl: "https://api.anthropic.com.attacker.example/v1" },
      rawHeaders: new Headers({ "anthropic-beta": CLIENT_BETA, "x-claude-code-session-id": "private-session" }),
    }));
    expect(sent.headers.has("x-claude-code-session-id")).toBe(false);
    expect(sent.headers.get("anthropic-beta") || "").not.toContain(CLIENT_BETA);
    expect(sent.headers.get("authorization")).toBe("Bearer gateway-secret");
  });

  it("reads inbound Headers objects and keeps different accounts' sessions separate", async () => {
    const executor = new DefaultExecutor("claude");
    const first = await outbound(executor, requestBody(), credentials({ rawHeaders: new Headers({ "x-claude-code-session-id": "first" }) }));
    const second = await outbound(executor, requestBody(), credentials({ rawHeaders: new Headers({ "x-claude-code-session-id": "second" }) }));
    expect(first.headers.get("x-claude-code-session-id")).toBe("first");
    expect(second.headers.get("x-claude-code-session-id")).toBe("second");
  });
});
