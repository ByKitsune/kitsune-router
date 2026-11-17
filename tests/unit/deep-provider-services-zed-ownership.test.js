import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { clearZedCaches, fetchZedAuthenticatedUser, fetchZedLlmToken, zedLlmFetch } from "../../open-sse/shared/zedAuth.js";

const servers = [];
const listen = async handler => {
  const server = createServer(handler);
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
};
const credentials = accessToken => ({ accessToken, providerSpecificData: { userId: "synthetic-user", organizationId: "synthetic-org" } });
beforeEach(() => { clearZedCaches(); });
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
afterAll(async () => { const { closeUpstreamPools } = await import("../../open-sse/utils/proxyFetch.js"); await closeUpstreamPools(); });

const paths = [
  ["authenticated user", "/client/users/me", (c, options) => fetchZedAuthenticatedUser(c, options)],
  ["LLM token", "/client/llm_tokens", (c, options) => fetchZedLlmToken(c, options)],
  ["completion", "/completion", (c, options) => zedLlmFetch(c, "/completion", { ...options, fetchOptions: { method: "POST", body: '{"model":"synthetic"}' } })],
];
describe.each(paths)("Zed %s request", (_name, redirectPath, invoke) => {
  it.each([[307, false], [308, false], [307, true], [308, true]])("refuses HTTP%s (cross origin: %s) before forwarding account proofs", async (status, crossOrigin) => {
    let target;
    let intended = 0;
    let forwarded = 0;
    const handler = async (req, res) => {
      for await (const _chunk of req) { /* Never log the synthetic proof. */ }
      if (req.url === redirectPath) {
        intended++;
        res.writeHead(status, { Location: `${target}/target` });
        res.end();
      } else if (req.url === "/client/llm_tokens") {
        res.setHeader("content-type", "application/json");
        res.end('{"token":"synthetic-llm"}');
      } else {
        forwarded++;
        res.setHeader("content-type", "application/json");
        res.end('{"token":"forwarded-token","id":"synthetic-user"}');
      }
    };
    const source = await listen(handler);
    target = crossOrigin ? await listen(handler) : source;
    const options = { config: { cloudBaseUrl: source, llmBaseUrl: source } };
    await expect(invoke(credentials("synthetic-proof"), options)).rejects.toMatchObject({ code: "ACCOUNT_REDIRECT_REFUSED" });
    expect(intended).toBe(1);
    expect(forwarded).toBe(0);
  });
});

describe("Zed credential cache and retry ownership", () => {
  it("does not collide on the final16characters of different native auth proofs", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => Response.json({ token: init.headers.Authorization.includes("first-prefix") ? "first-llm" : "second-llm" }));
    const first = credentials("first-prefix-0123456789abcdef");
    const second = credentials("second-prefix-0123456789abcdef");
    expect(await fetchZedLlmToken(first)).toBe("first-llm");
    expect(await fetchZedLlmToken(second)).toBe("second-llm");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a cloud token after changing the configured origin", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async url => Response.json({ token: new URL(url).hostname }));
    const proof = credentials("same-proof");
    expect(await fetchZedLlmToken(proof, { config: { cloudBaseUrl: "https://first.example.invalid" } })).toBe("first.example.invalid");
    expect(await fetchZedLlmToken(proof, { config: { cloudBaseUrl: "https://second.example.invalid" } })).toBe("second.example.invalid");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not return a cached token to a pre-aborted caller", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ token: "same-llm" }));
    const proof = credentials("same-proof");
    await fetchZedLlmToken(proof);
    const caller = new AbortController();
    const reason = new Error("caller left before cached auth");
    caller.abort(reason);
    await expect(fetchZedLlmToken(proof, { signal: caller.signal })).rejects.toBe(reason);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not wait on a stalled rejected-body cancel before a safe401 refresh", async () => {
    let acknowledge;
    const ack = new Promise(resolve => { acknowledge = resolve; });
    let tokenCalls = 0;
    let chatCalls = 0;
    const cancel = vi.fn(() => ack);
    vi.spyOn(globalThis, "fetch").mockImplementation(async url => {
      if (new URL(url).pathname === "/client/llm_tokens") return Response.json({ token: `synthetic-${++tokenCalls}` });
      if (++chatCalls === 1) return new Response(new ReadableStream({ cancel }), { status: 401 });
      return Response.json({ success: true });
    });
    const pending = zedLlmFetch(credentials("same-proof"), "/completion");
    try {
      const outcome = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve("still waiting"), 50))]);
      expect(outcome).toBeInstanceOf(Response);
      expect(await outcome.json()).toEqual({ success: true });
      expect(tokenCalls).toBe(2);
      expect(chatCalls).toBe(2);
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      acknowledge();
      await pending;
    }
  });
});
