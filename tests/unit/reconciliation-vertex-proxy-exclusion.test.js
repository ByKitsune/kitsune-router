import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

const transport = vi.hoisted(() => {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => {
    if (new URL(url).hostname !== "127.0.0.1") throw new Error("fixture forbids external fetch");
    return nativeFetch(url, options);
  };
  return { nativeFetch };
});

import { VertexExecutor } from "../../open-sse/executors/vertex.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

const servers = [];
const payload = { contents: [{ role: "user", parts: [{ text: "fixture" }] }], generationConfig: { maxOutputTokens: 37 } };

function exclusionPolicy(strictProxy = false) {
  return { connectionProxyEnabled: true, connectionProxyUrl: "http://127.0.0.1:9",
    connectionNoProxy: "aiplatform.googleapis.com", strictProxy };
}

async function directFixture() {
  const requests = [];
  const bottomRequests = [];
  const server = createServer(async (request, response) => {
    let text = "";
    for await (const chunk of request) text += chunk;
    requests.push({ path: request.url, body: text ? JSON.parse(text) : null });
    response.setHeader("Content-Type", "application/json");
    if (request.url.includes("/__probe__:")) {
      response.statusCode = 404;
      response.end('{"error":{"message":"Model projects/123456789012/locations/global/publishers/google/models/__probe__ was not found"}}');
    } else {
      response.end('{"fixture":"intentional-direct-exclusion"}');
    }
  });
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  // Only the network seam is replaced. The real shared transport must first
  // select direct egress; using any proxy dispatcher fails the fixture.
  vi.stubGlobal("fetch", (url, options = {}) => {
    const target = new URL(url);
    if (target.origin !== "https://aiplatform.googleapis.com" || options.dispatcher) {
      throw new Error("fixture received an unexpected target or proxy dispatcher");
    }
    bottomRequests.push({ url: target.toString(), signal: options.signal });
    return transport.nativeFetch(`${origin}${target.pathname}${target.search}`, options);
  });
  return { requests, bottomRequests };
}

beforeEach(() => {
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) {
    vi.stubEnv(key, "");
  }
  vi.stubEnv("HTTPS_PROXY", "http://127.0.0.1:9");
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

describe("Vertex preserves the shared account noProxy decision", () => {
  describe.each(["resolved options", "credential metadata"])("%s", source => {
    it.each([false, true])("keeps non-strict excluded generation direct despite HTTPS_PROXY (stream=%s)", async stream => {
      const fixture = await directFixture();
      const policy = exclusionPolicy();
      const before = structuredClone(policy);
      const shared = await proxyAwareFetch("https://aiplatform.googleapis.com/v1/control", { method: "POST", body: "{}" }, policy);
      expect(shared.status).toBe(200);
      expect(await shared.json()).toEqual({ fixture: "intentional-direct-exclusion" });

      const caller = new AbortController();
      const credentials = { apiKey: "exclusion+fixture&key=second", providerSpecificData: {
        projectId: "research-project", location: "eu", ...(source === "credential metadata" ? policy : {}),
      } };
      const result = await new VertexExecutor().execute({ model: "gemini-2.5-flash", body: payload, stream, credentials,
        proxyOptions: source === "resolved options" ? policy : null, signal: caller.signal });
      expect(result.response.status).toBe(200);
      expect(await result.response.json()).toEqual({ fixture: "intentional-direct-exclusion" });
      expect(fixture.requests).toEqual([
        { path: "/v1/control", body: {} },
        { path: `/v1/projects/research-project/locations/eu/publishers/google/models/gemini-2.5-flash:${stream ? "streamGenerateContent?alt=sse&" : "generateContent?"}key=exclusion%2Bfixture%26key%3Dsecond`, body: payload },
      ]);
      expect(fixture.bottomRequests).toEqual([
        { url: "https://aiplatform.googleapis.com/v1/control", signal: undefined },
        { url: result.url, signal: caller.signal },
      ]);
      expect(policy).toEqual(before);
    });
  });

  it("keeps excluded partner discovery and generation direct without substituting HTTPS_PROXY", async () => {
    const fixture = await directFixture();
    const policy = exclusionPolicy();
    const shared = await proxyAwareFetch("https://aiplatform.googleapis.com/v1/control", {}, policy);
    expect(await shared.json()).toEqual({ fixture: "intentional-direct-exclusion" });
    const result = await new VertexExecutor("vertex-partner").execute({ model: "qwen/fixture-model", body: { messages: [] }, stream: false,
      credentials: { apiKey: "exclusion-probe-fixture" }, proxyOptions: policy });
    expect(await result.response.json()).toEqual({ fixture: "intentional-direct-exclusion" });
    expect(fixture.requests).toEqual([
      { path: "/v1/control", body: null },
      { path: "/v1/publishers/google/models/__probe__:generateContent?key=exclusion-probe-fixture", body: {} },
      { path: "/v1/projects/123456789012/locations/global/endpoints/openapi/chat/completions?key=exclusion-probe-fixture", body: { messages: [] } },
    ]);
    expect(fixture.bottomRequests).toHaveLength(3);
    expect(policy.strictProxy).toBe(false);
  });

  it("does not weaken an explicitly strict excluded route", async () => {
    const fixture = await directFixture();
    const policy = exclusionPolicy(true);
    await expect(proxyAwareFetch("https://aiplatform.googleapis.com/v1/control", {}, policy)).rejects.toThrow(/strictProxy=true/);
    await expect(new VertexExecutor().execute({ model: "gemini-2.5-flash", body: payload, stream: false,
      credentials: { apiKey: "strict-exclusion-fixture", providerSpecificData: { projectId: "research-project" } },
      proxyOptions: policy })).rejects.toThrow(/request failed/i);
    expect(fixture.bottomRequests).toEqual([]);
    expect(fixture.requests).toEqual([]);
    expect(policy.strictProxy).toBe(true);
  });
});
