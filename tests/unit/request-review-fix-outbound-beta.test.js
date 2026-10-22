import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
import { translateRequest } from "../../open-sse/translator/index.js";
import { normalizeClaudePassthrough } from "../../open-sse/translator/formats/claude.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { GithubExecutor } from "../../open-sse/executors/github.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
const beta = "interleaved-thinking-2025-05-14";
const model = "claude-sonnet-4.5";
const messages = [{ role: "user", content: "hello" }];
const native = (id = model) => ({ model: id, messages: structuredClone(messages), max_tokens: 4096, thinking: { type: "enabled", budget_tokens: 8192, display: "omitted" }, tools: [{ name: "lookup", input_schema: { type: "object" } }], metadata: { user_id: "review-user" } });
const sent = () => vi.mocked(proxyAwareFetch).mock.calls.map(([, opts]) => ({ body: JSON.parse(opts.body), headers: new Headers(opts.headers) }));
const failure = () => Response.json({ error: "offline fixture" }, { status: 400 });
beforeEach(() => { vi.mocked(proxyAwareFetch).mockReset(); vi.mocked(proxyAwareFetch).mockImplementation(async () => failure()); });
describe("request review fix: actual outbound beta", () => {
  it("fits GitHub's budget despite an inbound beta that is never forwarded", async () => {
    await new GithubExecutor().execute({ model, body: { messages, max_tokens: 4096, reasoning_effort: "high", tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }] }, stream: false, credentials: { rawHeaders: { "anthropic-beta": beta } } });
    expect(sent()).toHaveLength(1);
    expect(sent()[0].headers.get("anthropic-beta")).toBeNull();
    expect(sent()[0].body.max_tokens).toBe(4096);
    expect(sent()[0].body.thinking.type).toBe("enabled");
    expect(sent()[0].body.thinking.budget_tokens).toBe(3072);
  });
  it.each(["native", "translated"])("preserves %s manual mode with default outbound beta and no inbound beta", async path => {
    const credentials = { connectionId: `review-default-${path}`, apiKey: "offline-fixture" };
    const body = path === "native" ? normalizeClaudePassthrough(native(), model) : translateRequest("claude", "claude", model, native(), false, credentials, "claude");
    await new DefaultExecutor("claude").execute({ model, body, stream: false, credentials });
    expect(sent()).toHaveLength(1);
    expect(sent()[0].headers.get("anthropic-beta")).toContain(beta);
    expect(sent()[0].body.max_tokens).toBe(4096);
    expect(sent()[0].body.thinking).toEqual({ type: "enabled", budget_tokens: 8192, display: "omitted" });
    expect(sent()[0].body.metadata).toEqual({ user_id: "review-user" });
  });
  it("rejects an explicit budget on denied-beta retries and future turns rather than shrinking it", async () => {
    const credentials = { connectionId: "review-rejected-interleaving", apiKey: "offline-fixture", rawHeaders: { "anthropic-beta": beta } };
    vi.mocked(proxyAwareFetch).mockResolvedValueOnce(Response.json({ error: { message: `Unexpected value(s) \`${beta}\` for the \`anthropic-beta\` header` } }, { status: 400 }));
    const execute = async () => new DefaultExecutor("claude").execute({ model, body: normalizeClaudePassthrough(native(), model, credentials.rawHeaders), stream: false, credentials });
    await expect(execute()).rejects.toMatchObject({ code: "invalid_thinking_budget", param: "max_tokens" });
    await expect(execute()).rejects.toMatchObject({ code: "invalid_thinking_budget", param: "max_tokens" });
    expect(sent()).toHaveLength(1);
    expect(sent()[0].body.thinking.budget_tokens).toBe(8192);
  });

  it("fits generated effort budgets after a denied-beta retry and on future turns", async () => {
    const credentials = { connectionId: "review-generated-rejected-interleaving", apiKey: "offline-fixture", rawHeaders: { "anthropic-beta": beta } };
    vi.mocked(proxyAwareFetch).mockResolvedValueOnce(Response.json({ error: { message: `Unexpected value(s) \`${beta}\` for the \`anthropic-beta\` header` } }, { status: 400 }));
    const execute = async () => {
      const body = translateRequest("openai", "claude", model, { messages, max_tokens: 4096, reasoning_effort: "high", tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }] }, false, credentials, "claude");
      return new DefaultExecutor("claude").execute({ model, body, stream: false, credentials });
    };
    await execute();
    await execute();
    expect(sent()).toHaveLength(3);
    expect(sent()[0].body.thinking.budget_tokens).toBe(24576);
    for (const request of sent().slice(1)) {
      expect(request.headers.get("anthropic-beta")).not.toContain(beta);
      expect(request.body.max_tokens).toBe(4096);
      expect(request.body.thinking.budget_tokens).toBe(3072);
    }
  });
  it("preserves translated OpenAI high effort only with actual outbound beta", async () => {
    const credentials = { apiKey: "offline-fixture", connectionId: "review-openai-interleaving" };
    const body = translateRequest("openai", "claude", model, { messages, max_tokens: 4096, reasoning_effort: "high", tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }] }, false, credentials, "claude");
    await new DefaultExecutor("claude").execute({ model, body, stream: false, credentials });
    expect(sent()[0].headers.get("anthropic-beta")).toContain(beta);
    expect(sent()[0].body.max_tokens).toBe(4096);
    expect(sent()[0].body.thinking.budget_tokens).toBe(24576);
  });
  it("stops a small-cap beta rejection before repeating an invalid non-interleaved body", async () => {
    const credentials = { connectionId: "review-small-denied", apiKey: "offline-fixture" };
    vi.mocked(proxyAwareFetch).mockResolvedValueOnce(Response.json({ error: { message: `Unexpected value(s) \`${beta}\` for the \`anthropic-beta\` header` } }, { status: 400 }));
    const body = normalizeClaudePassthrough({ ...native(), max_tokens: 1000 }, model);
    await expect(new DefaultExecutor("claude").execute({ model, body, stream: false, credentials })).rejects.toMatchObject({ code: "invalid_thinking_budget" });
    expect(sent()).toHaveLength(1);
    expect(body.thinking.budget_tokens).toBe(8192);
  });
  it("preserves a small native output cap when actual manual interleaving permits it", async () => {
    const credentials = { connectionId: "review-small-interleaved", apiKey: "offline-fixture" };
    const body = normalizeClaudePassthrough({ ...native(), max_tokens: 1000 }, model);
    await new DefaultExecutor("claude").execute({ model, body, stream: false, credentials });
    expect(sent()[0].headers.get("anthropic-beta")).toContain(beta);
    expect(sent()[0].body.max_tokens).toBe(1000);
    expect(sent()[0].body.thinking.budget_tokens).toBe(8192);
  });
  it("does not trust beta on an arbitrary reseller's actual headers", async () => {
    const executor = new DefaultExecutor("anthropic-compatible-review");
    const credentials = { apiKey: "offline-fixture", runtimeTransport: { format: "claude", baseUrl: "https://reseller.invalid/messages", headers: { "Anthropic-Beta": beta } }, rawHeaders: { "anthropic-beta": beta } };
    await expect(executor.execute({ model, body: normalizeClaudePassthrough(native(), model, credentials.rawHeaders), stream: false, credentials }))
      .rejects.toMatchObject({ code: "invalid_thinking_budget", param: "max_tokens" });
    expect(sent()).toHaveLength(0);
  });
  it.each(["claude-haiku-4.5", "claude-opus-4.6"])("never grants unsupported %s manual interleaving", async id => {
    const credentials = { apiKey: "offline-fixture", rawHeaders: { "anthropic-beta": beta } };
    await expect(new DefaultExecutor("claude").execute({ model: id, body: native(id), stream: false, credentials }))
      .rejects.toMatchObject({ code: "invalid_thinking_budget", param: "max_tokens" });
    expect(sent()).toHaveLength(0);
  });
});
