import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const beta = "mid-conversation-output-config-2026-07-01";
const model = "claude-opus-5-5";
const makeBody = () => ({
  model, max_tokens: 2048,
  messages: [
    { role: "user", content: "Solve this task." },
    { role: "system", content: [], output_config: { effort: "high" } },
  ],
});
const headerShapes = [
  { "AnThRoPiC-BeTa": `${beta},${beta},claude-code-20250219,oauth-2025-04-20,bad flag` },
  new Headers({ "anthropic-beta": `${beta},claude-code-20250219,oauth-2025-04-20` }),
  { "anthropic-beta": [beta, "claude-code-20250219", "oauth-2025-04-20"] },
];
beforeEach(() => {
  proxyAwareFetch.mockReset();
  proxyAwareFetch.mockResolvedValue(Response.json({ id: "msg_fixture", type: "message", role: "assistant", content: [{ type: "text", text: "answer" }] }));
});

describe("native Anthropic API-key body/header capability pairing", () => {
  it.each(headerShapes)("sends the requested feature beta with its native system body: %j", async rawHeaders => {
    const source = makeBody();
    const original = structuredClone(source);
    const credentials = { apiKey: "fixture-key", accessToken: "unused-stale-oauth", rawHeaders };
    const body = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, model, source, false, credentials, "anthropic");
    await new DefaultExecutor("anthropic").execute({ model, body, stream: false, credentials });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    const [url, init] = proxyAwareFetch.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = new Headers(init.headers);
    const flags = headers.get("anthropic-beta").split(",");
    expect(flags.filter(flag => flag === beta)).toEqual([beta]);
    expect(flags).toContain("interleaved-thinking-2025-05-14");
    expect(flags).not.toContain("claude-code-20250219");
    expect(flags).not.toContain("oauth-2025-04-20");
    expect(flags).not.toContain("bad flag");
    expect(headers.get("x-api-key")).toBe("fixture-key");
    for (const name of ["authorization", "x-app", "user-agent", "x-claude-code-session-id"]) expect(headers.has(name)).toBe(false);
    expect(JSON.parse(init.body).messages[1]).toEqual(original.messages[1]);
    expect(source).toEqual(original);
  });

  it("keeps client capability flags off a lookalike non-Anthropic endpoint", () => {
    const executor = new DefaultExecutor("anthropic");
    const credentials = { apiKey: "fixture-key", rawHeaders: { "anthropic-beta": beta },
      runtimeTransport: { baseUrl: "https://api.anthropic.com.attacker.example/v1/messages", format: "claude", headers: {} } };
    const headers = new Headers(executor.buildHeaders(credentials, false, undefined, model, makeBody()));
    expect(headers.get("anthropic-beta") || "").not.toContain(beta);
  });

  it("returns native beta rejections unchanged instead of replaying required body fields without their header", async () => {
    const payload = { type: "error", error: { type: "invalid_request_error",
      message: `Unexpected value(s) \`${beta}\` for the \`anthropic-beta\` header` } };
    proxyAwareFetch.mockResolvedValueOnce(Response.json(payload, { status: 400 }));
    const credentials = { apiKey: "fixture-key", rawHeaders: { "anthropic-beta": beta } };
    const body = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, model, makeBody(), false, credentials, "anthropic");
    const result = await new DefaultExecutor("anthropic").execute({ model, body, stream: false, credentials });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual(payload);
    expect(new Headers(proxyAwareFetch.mock.calls[0][1].headers).get("anthropic-beta").split(",")).toContain(beta);
  });
});
