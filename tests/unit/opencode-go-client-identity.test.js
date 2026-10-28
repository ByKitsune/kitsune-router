import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Public Go guidance: identify the client; use session IDs only with a trusted
// scope. No live inference or free-tier entitlement is asserted here.
// https://opencode.ai/v2/docs/console/go/#where-can-i-use-it
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("../../open-sse/providers/declaredCaps.js", () => ({ getDeclaredModelCaps: vi.fn(async () => undefined) }));
vi.mock("../../open-sse/utils/requestLogger.js", () => ({ createRequestLogger: async () => ({
  logClientRawRequest: vi.fn(), logRawRequest: vi.fn(), logTargetRequest: vi.fn(), logOpenAIRequest: vi.fn(),
  logProviderResponse: vi.fn(), logConvertedResponse: vi.fn(), logError: vi.fn(),
}) }));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(), appendRequestLog: vi.fn(async () => {}), saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}), enqueueRequestUsage: vi.fn(async entry => ({ accepted: true, eventId: entry.eventId })),
}));

import { BRAND } from "../../branding/identity.mjs";
import goRegistry from "../../open-sse/providers/registry/opencode-go.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { handleChatCore } from "../../open-sse/handlers/chatCore.js";
import { resolveTransport } from "../../open-sse/services/provider.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

const responseFor = url => {
  if (url.endsWith("/messages")) return Response.json({
    id: "msg_fixture", type: "message", role: "assistant", model: "minimax-m3",
    content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
  });
  if (url.endsWith("/responses")) return Response.json({
    id: "resp_fixture", object: "response", status: "completed", model: "gpt-6-luna",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  });
  return Response.json({
    id: "chatcmpl-fixture", object: "chat.completion", model: "glm-5.3",
    choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected non-fixture network"); }));
  proxyAwareFetch.mockImplementation(async url => responseFor(String(url)));
});
afterEach(() => vi.unstubAllGlobals());

async function dispatch({ source = "openai", model = "glm-5.3", ua, rawHeaders, provider = "opencode-go" } = {}) {
  const body = source === "openai-responses"
    ? { input: "fixture", max_output_tokens: 32 }
    : source === "gemini"
      ? { contents: [{ role: "user", parts: [{ text: "fixture" }] }], generationConfig: { maxOutputTokens: 32 } }
      : { messages: [{ role: "user", content: "fixture" }], max_tokens: 32 };
  const headers = rawHeaders || { ...(ua ? { "user-agent": ua } : {}), authorization: "Bearer incoming-secret", "x-opencode-session": "caller-session" };
  const result = await handleChatCore({
    body: { model, stream: false, ...body }, modelInfo: { provider, model },
    credentials: { apiKey: "synthetic-provider-key", providerSpecificData: {} }, connectionId: "synthetic-account",
    sourceFormatOverride: source, userAgent: ua,
    clientRawRequest: { endpoint: source === "claude" ? "/v1/messages" : source === "openai-responses" ? "/v1/responses" : "/v1/chat/completions", headers, body },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  });
  expect(result.success).toBe(true);
  const [url, init] = proxyAwareFetch.mock.calls.at(-1);
  return { url, headers: new Headers(init.headers), body: JSON.parse(init.body) };
}

describe("Go transport identity and subscription notice", () => {
  it("declares the router's truthful identity on both default and all runtime transports", () => {
    const executor = new DefaultExecutor("opencode-go");
    const credentials = { apiKey: "synthetic-provider-key" };
    expect(new Headers(executor.buildHeaders(credentials, false)).get("user-agent")).toBe(BRAND.binary);
    for (const format of ["openai", "claude", "openai-responses"]) {
      const runtimeTransport = resolveTransport("opencode-go", format);
      expect(new Headers(executor.buildHeaders({ ...credentials, runtimeTransport }, false)).get("user-agent")).toBe(BRAND.binary);
    }
  });

  it("describes quota references and the opt-in Extra Usage balance fallback", () => {
    expect(goRegistry.display.notice.text).toContain("https://opencode.ai/v2/docs/console/go/");
    expect(goRegistry.display.notice.text).toMatch(/quota|allowance/i);
    expect(goRegistry.display.notice.text).toMatch(/Extra Usage/);
    expect(goRegistry.display.notice.text).toMatch(/enabled/i);
    expect(goRegistry.display.notice.text).toMatch(/balance/i);
    expect(goRegistry.display.notice.apiKeyUrl).toBe("https://opencode.ai/auth");
  });

  it.each([
    ["openai", "glm-5.3", "chat/completions"],
    ["claude", "minimax-m3", "messages"],
    ["openai-responses", "gpt-6-luna", "responses"],
    ["gemini", "glm-5.3-flash", "chat/completions"],
  ])("keeps caller identity and auth on %s → %s", async (source, model, path) => {
    const caller = "real-coding-client/2.4";
    const wire = await dispatch({ source, model, ua: caller });
    expect(wire.url).toBe(`https://opencode.ai/zen/go/v1/${path}`); // Existing config, not a live-compatibility claim.
    expect(wire.headers.get("user-agent")).toBe(caller);
    if (path === "messages") expect(wire.headers.get("x-api-key")).toBe("synthetic-provider-key");
    else expect(wire.headers.get("authorization")).toBe("Bearer synthetic-provider-key");
    expect(JSON.stringify([...wire.headers])).not.toContain("incoming-secret");
    expect(wire.headers.has("x-opencode-session")).toBe(false);
  });

  it.each([undefined, "node", "undici", "python-httpx/0.28.0", "OpenAI/JS 6.0", "bad\r\nheader"])("uses the router identity for absent, generic, or unsafe client UA %j", async ua => {
    const wire = await dispatch({ ua });
    expect(wire.headers.get("user-agent")).toBe(BRAND.binary);
    expect(wire.headers.has("x-opencode-session")).toBe(false);
  });

  it("reads a specific caller from case-insensitive Headers without mutating the shared transport", async () => {
    const rawHeaders = new Headers({ "User-Agent": "editor/1.7", "x-opencode-session": "untrusted-session" });
    const wire = await dispatch({ rawHeaders });
    expect(wire.headers.get("user-agent")).toBe("editor/1.7");
    expect(wire.headers.has("x-opencode-session")).toBe(false);
    expect(resolveTransport("opencode-go", "openai").headers["User-Agent"]).toBe(BRAND.binary);
  });

  it.each(["claude-cli/2.1.306", "codex_cli_rs/0.163.0", "opencode/1.19.3"])("preserves the real caller identity %s", async ua => {
    const wire = await dispatch({ ua });
    expect(wire.headers.get("user-agent")).toBe(ua);
  });

  it("does not replace a more specific transport identity", async () => {
    const transport = resolveTransport("opencode-go", "openai");
    const previous = transport.headers;
    try {
      transport.headers = { "User-Agent": "specific-transport/1" };
      const wire = await dispatch({ ua: "editor/1.7" });
      expect(wire.headers.get("user-agent")).toBe("specific-transport/1");
    } finally {
      transport.headers = previous;
    }
  });

  it("keeps concurrent caller identities request-local", async () => {
    await Promise.all([dispatch({ ua: "editor-a/1" }), dispatch({ ua: "editor-b/1" })]);
    const agents = proxyAwareFetch.mock.calls.map(([, init]) => new Headers(init.headers).get("user-agent"));
    expect(agents.sort()).toEqual(["editor-a/1", "editor-b/1"]);
    expect(resolveTransport("opencode-go", "openai").headers["User-Agent"]).toBe(BRAND.binary);
  });

  it("does not change a different provider's outgoing identity", async () => {
    const wire = await dispatch({ provider: "openai", model: "gpt-4o", ua: "real-coding-client/2.4" });
    expect(wire.headers.get("user-agent") || "").not.toContain(BRAND.binary);
  });
});
