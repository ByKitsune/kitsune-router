import { createServer } from "node:http";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ fetch: globalThis.fetch }));
import { BaseExecutor } from "../../open-sse/executors/base.js";
import { GithubExecutor } from "../../open-sse/executors/github.js";
import { closeUpstreamPools } from "../../open-sse/utils/proxyFetch.js";

const servers = new Set();
let patchedFetch;
beforeEach(() => {
  patchedFetch = globalThis.fetch;
  for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(name, "");
  vi.stubEnv("DISABLE_MITM_BYPASS", "1");
  globalThis.fetch = (url, init) => {
    if (new URL(String(url)).hostname !== "127.0.0.1") throw new Error("Unexpected nonlocal executor request");
    return native.fetch(url, init);
  };
});
afterEach(async () => {
  globalThis.fetch = patchedFetch;
  vi.unstubAllEnvs();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  servers.clear();
});
afterAll(async () => { await closeUpstreamPools({ timeoutMs: 100 }); });

async function listen(handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  servers.add(server);
  return `http://127.0.0.1:${server.address().port}`;
}

async function redirectFixture(status, crossOrigin) {
  const initial = [], forwarded = [], fallback = [];
  const capture = async request => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    return { method: request.method, headers: request.headers, body: Buffer.concat(chunks).toString("utf8") };
  };
  const other = await listen(async (request, response) => {
    forwarded.push(await capture(request));
    response.setHeader("Content-Type", "application/json");
    response.end('{"unexpected":"redirect target"}');
  });
  const origin = await listen(async (request, response) => {
    if (request.url === "/forwarded") {
      forwarded.push(await capture(request));
      response.setHeader("Content-Type", "application/json");
      response.end('{"unexpected":"same-origin redirect target"}');
    } else if (request.url === "/fallback") {
      fallback.push(await capture(request));
      response.end("unexpected fallback");
    } else {
      initial.push(await capture(request));
      response.writeHead(status, { Location: crossOrigin ? `${other}/forwarded` : "/forwarded" });
      response.end("Use the canonical endpoint");
    }
  });
  return { origin, initial, forwarded, fallback };
}

describe("credential-bearing Chat executor redirects are terminal", () => {
  for (const crossOrigin of [false, true]) {
    it.each([301, 302, 303, 307, 308])("refuses HTTP %i without forwarding credentials/body to " + (crossOrigin ? "another origin" : "another path"), async status => {
      const fixture = await redirectFixture(status, crossOrigin);
      const executor = new BaseExecutor("anthropic-compatible-redirect-fixture", {
        baseUrls: [`${fixture.origin}/primary`, `${fixture.origin}/fallback`],
        retry: { 502: { attempts: 2, delayMs: 0 } },
      });
      executor.buildUrl = (_model, _stream, index) => executor.config.baseUrls[index];
      const body = { messages: [{ role: "user", content: "synthetic confidential prompt" }] };
      const outcome = await executor.execute({ model: "fixture", body, stream: false,
        credentials: { apiKey: "synthetic-confidential-api-key" } }).catch(error => error);
      expect(outcome).toMatchObject({ code: "ACCOUNT_REDIRECT_REFUSED" });
      expect(fixture.initial).toHaveLength(1);
      expect(fixture.initial[0]).toMatchObject({ method: "POST", body: JSON.stringify(body) });
      expect(fixture.initial[0].headers["x-api-key"]).toBe("synthetic-confidential-api-key");
      expect(fixture.forwarded).toEqual([]);
      expect(fixture.fallback).toEqual([]);
    });
  }
});

describe("specialized Copilot endpoint switches retain the same redirect policy", () => {
  for (const endpoint of ["messages", "responses"]) {
    it.each([307, 308])(`refuses HTTP %i from the direct ${endpoint} path before another POST`, async status => {
      const fixture = await redirectFixture(status, true);
      const executor = new GithubExecutor();
      executor.config = { ...executor.config, messagesUrl: `${fixture.origin}/messages`, responsesUrl: `${fixture.origin}/responses` };
      const options = { model: endpoint === "messages" ? "claude-sonnet-4-6" : "gpt-6.1", stream: false,
        body: { messages: [{ role: "user", content: "synthetic private Copilot prompt" }] },
        credentials: { accessToken: "synthetic-copilot-access-token", copilotToken: "synthetic-copilot-token" } };
      const outcome = await (endpoint === "messages"
        ? executor.executeWithMessagesEndpoint(options) : executor.executeWithResponsesEndpoint(options)).catch(error => error);
      expect(outcome).toMatchObject({ code: "ACCOUNT_REDIRECT_REFUSED" });
      expect(fixture.initial).toHaveLength(1);
      expect(fixture.initial[0].headers.authorization).toBe("Bearer synthetic-copilot-token");
      expect(fixture.forwarded).toEqual([]);
      expect(fixture.fallback).toEqual([]);
    });
  }
});
