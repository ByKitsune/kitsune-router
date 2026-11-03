import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { CodexExecutor } from "../../open-sse/executors/codex.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { CODEX_USER_AGENT, CODEX_CLI_VERSION } from "../../open-sse/config/clientVersions.js";

const model = "gpt-6.1-sol";
const body = session => ({ model, input: "Continue", instructions: "Preserve this instruction", ...(session ? { prompt_cache_key: session } : {}) });
const auth = id => ({ connectionId: `connection-${id}`, accessToken: `fixture-token-${id}`, providerSpecificData: { chatgptAccountId: `account-${id}` } });

beforeEach(() => {
  proxyAwareFetch.mockReset();
  proxyAwareFetch.mockImplementation(async () => Response.json({ id: "resp_fixture" }));
});

describe("Codex request-local transport identity", () => {
  it.each([false, true])("preserves caller parallel tool intent %s and additional requested include fields", async parallel => {
    const request = { ...body("tool-session"), parallel_tool_calls: parallel,
      reasoning: { effort: "high" }, include: ["file_search_call.results", "reasoning.encrypted_content"],
    };
    const original = structuredClone(request);
    await new CodexExecutor().execute({ model, body: request, stream: true, credentials: auth("tools") });
    const sent = JSON.parse(proxyAwareFetch.mock.calls[0][1].body);
    expect(sent.parallel_tool_calls).toBe(parallel);
    expect(sent.include).toEqual(["file_search_call.results", "reasoning.encrypted_content"]);
    expect(request).toEqual(original);
  });

  it("adds required encrypted continuity without erasing the caller's other include selection", async () => {
    await new CodexExecutor().execute({ model, body: { ...body(), reasoning: { effort: "high" }, include: ["file_search_call.results"] }, stream: true, credentials: auth("include") });
    expect(JSON.parse(proxyAwareFetch.mock.calls[0][1].body).include).toEqual(["file_search_call.results", "reasoning.encrypted_content"]);
  });

  it.each(["reasoning.encrypted_content", [null]])("rejects malformed include intent before dispatch instead of replacing it: %j", async include => {
    await expect(new CodexExecutor().execute({ model, body: { ...body(), reasoning: { effort: "high" }, include }, stream: true, credentials: auth("include") }))
      .rejects.toMatchObject({ code: "unsupported_parameter", param: "include" });
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });

  it("builds each request's headers after another request has transformed on the same executor", () => {
    const executor = new CodexExecutor();
    const first = executor.transformRequest(model, body("first-session"), true, auth("first"));
    const second = executor.transformRequest(model, body("second-session"), true, auth("second"));
    const firstHeaders = executor.buildHeaders(auth("first"), true, null, model, first);
    const secondHeaders = executor.buildHeaders(auth("second"), true, null, model, second);
    expect(firstHeaders.session_id).toBe("first-session");
    expect(firstHeaders["session-id"]).toBe("first-session");
    expect(secondHeaders.session_id).toBe("second-session");
    expect(firstHeaders["ChatGPT-Account-ID"]).toBe("account-first");
    expect(secondHeaders["ChatGPT-Account-ID"]).toBe("account-second");
    expect(executor).not.toHaveProperty("_currentSessionId");
  });

  it("does not borrow a previous session when headers are built without a transformed body", () => {
    const executor = new CodexExecutor();
    executor.transformRequest(model, body("private-first-session"), true, auth("first"));
    const secondAuth = auth("second");
    const first = executor.buildHeaders(secondAuth);
    const second = executor.buildHeaders(secondAuth);
    expect(first.session_id).not.toBe("private-first-session");
    expect(first.session_id).toBe(second.session_id);
  });

  it("keeps account auth, app version and opaque native history on concurrent outbound requests", async () => {
    const executor = new CodexExecutor();
    const requests = ["first", "second"].map(id => ({
      ...body(`session-${id}`), include: ["reasoning.encrypted_content"],
      input: [{ type: "reasoning", encrypted_content: `opaque-${id}` }, { role: "user", content: "Continue" }],
    }));
    const original = structuredClone(requests);
    await Promise.all(requests.map((request, index) => {
      const id = index ? "second" : "first";
      return executor.execute({ model, body: request, stream: true, credentials: {
        ...auth(id), rawHeaders: new Headers({ Authorization: "Bearer caller-secret", "ChatGPT-Account-ID": "caller-account", "User-Agent": "caller-agent" }),
      } });
    }));
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
    for (const [, options] of proxyAwareFetch.mock.calls) {
      const headers = new Headers(options.headers);
      const sent = JSON.parse(options.body);
      const id = sent.prompt_cache_key.slice("session-".length);
      expect(headers.get("authorization")).toBe(`Bearer fixture-token-${id}`);
      expect(headers.get("chatgpt-account-id")).toBe(`account-${id}`);
      expect(headers.get("session-id")).toBe(`session-${id}`);
      expect(headers.get("session_id")).toBe(`session-${id}`);
      expect(headers.get("user-agent")).toBe(CODEX_USER_AGENT);
      expect(headers.get("version")).toBe(CODEX_CLI_VERSION);
      expect(sent.input[0]).toEqual({ type: "reasoning", encrypted_content: `opaque-${id}` });
      expect(sent.include).toEqual(["reasoning.encrypted_content"]);
    }
    expect(requests).toEqual(original);
  });

  it.each([new Headers({ "X-Session-ID": "current-session" }), { "X-Session-ID": "current-session" }])("reads current caller session without forwarding unrelated identity headers", async rawHeaders => {
    await new CodexExecutor().execute({ model, body: body(), stream: true, credentials: { ...auth("current"), rawHeaders } });
    const sent = proxyAwareFetch.mock.calls[0][1];
    expect(new Headers(sent.headers).get("session-id")).toBe("current-session");
    expect(JSON.parse(sent.body).prompt_cache_key).toBe("current-session");
  });
});
