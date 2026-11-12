import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";

const model = "claude-opus-5-5";
const capability = "mid-conversation-output-config-2026-07-01";
const optional = "inline-tools-2026-09-15";
const rejection = (...flags) => ({ type: "error", error: { type: "invalid_request_error",
  message: `Unexpected value(s) ${flags.map(flag => `\`${flag}\``).join(", ")} for the \`anthropic-beta\` header` } });
const body = () => ({ model, max_tokens: 1024, messages: [{ role: "user", content: "Continue." }] });
const run = (executor, credentials, request = body()) => executor.execute({ model, body: request, stream: false, credentials });
const sent = index => new Headers(proxyAwareFetch.mock.calls[index][1].headers).get("anthropic-beta").split(",");

beforeEach(() => { proxyAwareFetch.mockReset(); });

describe("Claude OAuth beta/body capability pairing", () => {
  it.each([
    { "AnThRoPiC-BeTa": capability },
    { "anthropic-beta": [capability, capability] },
    new Headers({ "anthropic-beta": capability }),
  ])("returns a caller-requested capability rejection unchanged: %j", async rawHeaders => {
    const payload = rejection(capability);
    proxyAwareFetch.mockResolvedValue(Response.json(payload, { status: 400 }));
    const request = body();
    request.messages.push({ role: "system", content: [], output_config: { effort: "high" } });
    const original = structuredClone(request);
    const credentials = { accessToken: "fixture-oauth", connectionId: `explicit-${JSON.stringify(rawHeaders)}`, rawHeaders };
    const result = await run(new DefaultExecutor("claude"), credentials, request);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual(payload);
    expect(sent(0)).toContain(capability);
    expect(JSON.parse(proxyAwareFetch.mock.calls[0][1].body).messages).toEqual(original.messages);
  });

  it("heals an unrelated optional default while retaining the explicit capability/body pair", async () => {
    proxyAwareFetch.mockResolvedValueOnce(Response.json(rejection(optional), { status: 400 }))
      .mockResolvedValueOnce(Response.json({ type: "message", content: [] }));
    const credentials = { accessToken: "fixture-oauth", connectionId: "optional-with-required", rawHeaders: { "anthropic-beta": capability } };
    const request = body();
    request.messages.push({ role: "system", content: [], output_config: { effort: "high" } });
    const result = await run(new DefaultExecutor("claude"), credentials, request);
    expect(result.response.status).toBe(200);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
    expect(sent(0)).toContain(optional);
    expect(sent(1)).not.toContain(optional);
    expect(sent(0)).toContain(capability);
    expect(sent(1)).toContain(capability);
    expect(JSON.parse(proxyAwareFetch.mock.calls[1][1].body).messages).toEqual(request.messages);
  });

  it("does not let an earlier optional rejection erase a later explicit opt-in on that connection", async () => {
    const executor = new DefaultExecutor("claude");
    const credentials = { accessToken: "fixture-oauth", connectionId: "later-explicit" };
    proxyAwareFetch.mockResolvedValueOnce(Response.json(rejection(optional), { status: 400 }))
      .mockResolvedValueOnce(Response.json({ type: "message", content: [] }));
    expect((await run(executor, credentials)).response.status).toBe(200);
    expect(sent(1)).not.toContain(optional);
    const other = new Headers(executor.buildHeaders({ ...credentials, connectionId: "later-explicit-other" }, false, undefined, model, body()));
    expect(other.get("anthropic-beta").split(",")).toContain(optional);
    proxyAwareFetch.mockClear();
    const payload = rejection(optional);
    proxyAwareFetch.mockResolvedValue(Response.json(payload, { status: 400 }));
    const result = await run(executor, { ...credentials, rawHeaders: { "anthropic-beta": optional } });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(sent(0)).toContain(optional);
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual(payload);
  });

  it("does not retry native inline tool changes without the required configured beta", async () => {
    const payload = rejection(optional);
    proxyAwareFetch.mockResolvedValue(Response.json(payload, { status: 400 }));
    const request = body();
    request.messages.push({ role: "system", content: [{ type: "tool_addition", tool: { type: "tool_reference", name: "read_file" } }] });
    const result = await run(new DefaultExecutor("claude"), { accessToken: "fixture-oauth", connectionId: "implicit-inline" }, request);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(sent(0)).toContain(optional);
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual(payload);
  });

  it("preserves an implicit required header even after the connection rejected it as an optional default", async () => {
    const executor = new DefaultExecutor("claude");
    const credentials = { accessToken: "fixture-oauth", connectionId: "later-implicit" };
    proxyAwareFetch.mockResolvedValueOnce(Response.json(rejection(optional), { status: 400 }))
      .mockResolvedValueOnce(Response.json({ type: "message", content: [] }));
    await run(executor, credentials);
    expect(sent(1)).not.toContain(optional);
    proxyAwareFetch.mockClear();
    proxyAwareFetch.mockResolvedValue(Response.json(rejection(optional), { status: 400 }));
    const request = body();
    request.messages.push({ role: "system", content: [{ type: "tool_removal", tool: { type: "tool_reference", name: "read_file" } }] });
    const result = await run(executor, credentials, request);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(sent(0)).toContain(optional);
    expect(result.response.status).toBe(400);
  });

  it("does not retry away a configured tool-search beta while retaining deferred tools", async () => {
    const flag = "tool-search-tool-2025-10-19";
    proxyAwareFetch.mockResolvedValue(Response.json(rejection(flag), { status: 400 }));
    const request = { ...body(), tools: [{ type: "tool_search_tool_regex_20251119", name: "tool_search" }, { name: "read_file", input_schema: { type: "object" }, defer_loading: true }] };
    const result = await run(new DefaultExecutor("claude"), { accessToken: "fixture-oauth", connectionId: "implicit-search" }, request);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(sent(0)).toContain(flag);
    expect(result.response.status).toBe(400);
  });

  it("does not turn a lookalike endpoint rejection into first-party account state", async () => {
    const payload = rejection(optional);
    proxyAwareFetch.mockResolvedValue(Response.json(payload, { status: 400 }));
    const executor = new DefaultExecutor("claude");
    const credentials = { accessToken: "fixture-oauth", connectionId: "lookalike-beta", runtimeTransport: {
      baseUrl: "https://api.anthropic.com.attacker.example/v1/messages", format: "claude", headers: {},
      auth: { combined: true, header: "Authorization", scheme: "bearer" },
    } };
    const result = await run(executor, credentials);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(result.response.status).toBe(400);
    const officialHeaders = new Headers(executor.buildHeaders({ accessToken: credentials.accessToken, connectionId: credentials.connectionId }, false, undefined, model, body()));
    expect(officialHeaders.get("anthropic-beta").split(",")).toContain(optional);
  });
});
