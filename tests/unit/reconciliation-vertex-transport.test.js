import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { generateKeyPairSync } from "node:crypto";

// Keep the real proxy transport. Only its bottom-most fetch may reach a socket,
// and that socket must be an ephemeral loopback fixture, never Google/accounts.
const network = vi.hoisted(() => {
  const nativeFetch = globalThis.fetch;
  const blocked = [];
  const rejectedDispatchers = [];
  globalThis.fetch = (url, options) => {
    if (new URL(url).hostname !== "127.0.0.1") {
      blocked.push(String(url));
      rejectedDispatchers.push(options?.dispatcher);
      return Promise.reject(new Error(`fixture forbids direct egress: ${url}`));
    }
    return nativeFetch(url, options);
  };
  return { blocked, rejectedDispatchers };
});

import { VertexExecutor } from "../../open-sse/executors/vertex.js";
import { getDefaultAgent } from "../../open-sse/utils/proxyFetch.js";

const servers = [];
const body = { messages: [{ role: "user", content: "fixture" }], max_tokens: 37 };
const log = { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() };

async function listen(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function capture(request) {
  let text = "";
  for await (const chunk of request) text += chunk;
  return { target: request.headers["x-relay-target"], path: request.headers["x-relay-path"],
    authorization: request.headers.authorization, body: JSON.parse(text) };
}

function probeResponse(response, project = "123456789012", status = 404) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: { message: `Publisher Model projects/${project}/locations/global/publishers/google/models/__probe__ was not found` } }));
}

async function projectRelay(project = "123456789012") {
  const seen = [];
  const { url } = await listen(async (request, response) => {
    const entry = await capture(request);
    seen.push(entry);
    if (entry.path?.includes("/__probe__:")) probeResponse(response, project);
    else { response.setHeader("Content-Type", "application/json"); response.end('{"id":"fixture-result"}'); }
  });
  return { seen, proxyOptions: { strictProxy: true, vercelRelayUrl: url } };
}

function execute(credentials, proxyOptions, extra = {}) {
  return new VertexExecutor("vertex-partner").execute({ model: "qwen/fixture-model", body, stream: false,
    credentials, proxyOptions, log, ...extra });
}

async function within(promise, ms = 500) {
  let timer;
  try {
    return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve("did not settle"), ms); })]);
  } finally { clearTimeout(timer); }
}

beforeEach(() => {
  network.blocked.length = 0;
  network.rejectedDispatchers.length = 0;
  vi.clearAllMocks();
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) {
    vi.stubEnv(key, "");
  }
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

describe("Vertex actual dispatch", () => {
  it.each([false, true])("sends the configured Gemini route through the caller relay (stream=%s)", async (stream) => {
    const relay = await projectRelay();
    const caller = new AbortController();
    const credentials = { apiKey: "dispatch+key&key=second#fragment", providerSpecificData: { projectId: "research-project", location: "eu" } };
    const payload = { contents: [{ role: "user", parts: [{ text: "fixture" }, { inlineData: { mimeType: "image/png", data: "Zml4dHVyZQ==" } }] }], generationConfig: { maxOutputTokens: 37 } };
    const result = await new VertexExecutor().execute({ model: "gemini-2.5-flash", body: payload, stream,
      credentials, proxyOptions: relay.proxyOptions, signal: caller.signal });
    expect(result.response.status).toBe(200);
    expect(relay.seen).toHaveLength(1);
    expect(relay.seen[0]).toMatchObject({ target: "https://aiplatform.googleapis.com", body: payload });
    const sent = new URL(relay.seen[0].path, relay.seen[0].target);
    expect(sent.pathname).toBe(`/v1/projects/research-project/locations/eu/publishers/google/models/gemini-2.5-flash:${stream ? "streamGenerateContent" : "generateContent"}`);
    expect(sent.searchParams.getAll("key")).toEqual([credentials.apiKey]);
    expect(sent.searchParams.getAll("alt")).toEqual(stream ? ["sse"] : []);
    expect(result.url).toBe(sent.toString());
    expect(network.blocked).toEqual([]);
  });

  it("discovers a partner project and generates on the same resolved strict relay", async () => {
    const relay = await projectRelay();
    const credentials = { apiKey: "probe+key&key=second#fragment" };
    const result = await execute(credentials, relay.proxyOptions);
    expect(await result.response.json()).toEqual({ id: "fixture-result" });
    expect(relay.seen).toHaveLength(2);
    expect(relay.seen[0]).toEqual({ target: "https://aiplatform.googleapis.com",
      path: "/v1/publishers/google/models/__probe__:generateContent?key=probe%2Bkey%26key%3Dsecond%23fragment",
      authorization: undefined, body: {} });
    expect(relay.seen[1]).toEqual({ target: "https://aiplatform.googleapis.com",
      path: "/v1/projects/123456789012/locations/global/endpoints/openapi/chat/completions?key=probe%2Bkey%26key%3Dsecond%23fragment",
      authorization: undefined, body });
    expect(credentials.providerSpecificData?.projectId).toBeUndefined();
    expect(network.blocked).toEqual([]);
  });

  it("uses credential transport metadata when no already-resolved options are supplied", async () => {
    const relay = await projectRelay();
    const result = await execute({ apiKey: "metadata-probe-key", providerSpecificData: relay.proxyOptions });
    expect(result.response.status).toBe(200);
    expect(relay.seen).toHaveLength(2);
    expect(network.blocked).toEqual([]);
  });

  it("does not reuse inferred projects across relay policies or store them as explicit configuration", async () => {
    const first = await projectRelay("first-project");
    const second = await projectRelay("second-project");
    const credentials = { apiKey: "policy-isolation-key" };
    await execute(credentials, first.proxyOptions);
    await execute(credentials, first.proxyOptions);
    const result = await execute(credentials, second.proxyOptions);
    expect(first.seen.map(entry => entry.path.includes("/__probe__:"))).toEqual([true, false, false]);
    expect(second.seen.map(entry => entry.path.includes("/__probe__:"))).toEqual([true, false]);
    expect(new URL(result.url).pathname).toBe("/v1/projects/second-project/locations/global/endpoints/openapi/chat/completions");
    expect(credentials.providerSpecificData?.projectId).toBeUndefined();
  });

  it("does not use a warm non-strict cache to bypass a missing strict proxy", async () => {
    const relay = await projectRelay();
    const apiKey = "cache-must-not-bypass-strict-secret";
    await execute({ apiKey }, { ...relay.proxyOptions, strictProxy: false });
    const error = await execute({ apiKey }, { strictProxy: true }).catch(error => error);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toContain(apiKey);
    expect(network.blocked).toEqual([]);
  });

  it.each(["connection", "environment"])("never falls back to direct after a non-strict %s proxy fails", async (kind) => {
    // The original-fetch seam rejects the resolved proxy dispatcher before it
    // can open a socket. A second call via the default agent is a direct leak.
    const url = "http://127.0.0.1:9";
    const apiKey = `failed-${kind}-proxy-secret-key`;
    const proxyOptions = kind === "connection" ? { connectionProxyEnabled: true, connectionProxyUrl: url, strictProxy: false } : null;
    if (kind === "environment") vi.stubEnv("HTTPS_PROXY", url);
    const error = await execute({ apiKey }, proxyOptions).catch(error => error);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toContain(apiKey);
    expect(network.blocked).toHaveLength(1);
    expect(network.rejectedDispatchers[0]).toBeTruthy();
    expect(network.rejectedDispatchers[0]).not.toBe(await getDefaultAgent());
  });

  it("rejects malformed configuration before either OAuth refresh or project discovery", async () => {
    const relay = await projectRelay();
    const adc = JSON.stringify({ type: "authorized_user", client_id: "bad-route-client", client_secret: "fixture-secret", refresh_token: "fixture-refresh", quota_project_id: "bad/project" });
    await expect(new VertexExecutor().execute({ model: "gemini-2.5-flash", body: {}, stream: false,
      credentials: { apiKey: adc }, proxyOptions: relay.proxyOptions })).rejects.toThrow(/project/i);
    expect(relay.seen).toEqual([]);
    expect(network.blocked).toEqual([]);
  });

  it("does not probe an OAuth-only partner connection with no configured project", async () => {
    const relay = await projectRelay();
    await expect(execute({ accessToken: "fixture-token" }, relay.proxyOptions)).rejects.toThrow(/project/i);
    expect(relay.seen).toEqual([]);
    expect(network.blocked).toEqual([]);
  });

  it("cancels configured raw-key generation with the original caller reason", async () => {
    let notify;
    const started = new Promise(resolve => { notify = resolve; });
    const seen = [];
    const { url } = await listen(async (request, _response) => { seen.push(await capture(request)); notify(); });
    const caller = new AbortController();
    const reason = new Error("caller stopped configured generation");
    const pending = new VertexExecutor().execute({ model: "gemini-2.5-flash", body: { contents: [] }, stream: false,
      credentials: { apiKey: "cancel-generation-key", providerSpecificData: { projectId: "research-project", location: "eu" } },
      proxyOptions: { strictProxy: true, vercelRelayUrl: url }, signal: caller.signal });
    const outcome = pending.then(() => "unexpected success", error => error);
    await started;
    caller.abort(reason);
    expect(await within(outcome)).toBe(reason);
    expect(seen).toHaveLength(1);
    expect(seen[0].path).toBe("/v1/projects/research-project/locations/eu/publishers/google/models/gemini-2.5-flash:generateContent?key=cancel-generation-key");
    expect(network.blocked).toEqual([]);
  });

  it("refreshes ADC credentials and dispatches using the same strict caller relay", async () => {
    const seen = [];
    const { url } = await listen(async (request, response) => {
      let text = "";
      for await (const chunk of request) text += chunk;
      seen.push({ target: request.headers["x-relay-target"], path: request.headers["x-relay-path"], auth: request.headers.authorization,
        body: request.headers["content-type"].includes("json") ? JSON.parse(text) : Object.fromEntries(new URLSearchParams(text)) });
      response.setHeader("Content-Type", "application/json");
      response.end(seen.length === 1 ? '{"access_token":"fresh-adc-fixture","expires_in":3600}' : '{"id":"adc-result"}');
    });
    const credentials = { apiKey: JSON.stringify({ type: "authorized_user", client_id: "adc-proxy-client", client_secret: "adc-fixture-secret",
      refresh_token: "adc-fixture-refresh", quota_project_id: "adc-project" }) };
    const result = await new VertexExecutor().execute({ model: "gemini-2.5-flash", body: { contents: [] }, stream: false,
      credentials, proxyOptions: { strictProxy: true, vercelRelayUrl: url } });
    expect(await result.response.json()).toEqual({ id: "adc-result" });
    expect(seen).toEqual([
      { target: "https://oauth2.googleapis.com", path: "/token", auth: undefined,
        body: { grant_type: "refresh_token", client_id: "adc-proxy-client", client_secret: "adc-fixture-secret", refresh_token: "adc-fixture-refresh" } },
      { target: "https://aiplatform.googleapis.com", path: "/v1/projects/adc-project/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent",
        auth: "Bearer fresh-adc-fixture", body: { contents: [] } },
    ]);
    expect(network.blocked).toEqual([]);
  });

  it.each(["execute", "refreshCredentials"])("mints SA credentials through the resolved strict relay in %s", async (method) => {
    const seen = [];
    const { url } = await listen(async (request, response) => {
      let text = "";
      for await (const chunk of request) text += chunk;
      seen.push({ target: request.headers["x-relay-target"], path: request.headers["x-relay-path"], auth: request.headers.authorization,
        body: request.headers["content-type"].includes("json") ? JSON.parse(text) : Object.fromEntries(new URLSearchParams(text)) });
      response.setHeader("Content-Type", "application/json");
      response.end(seen.length === 1 ? '{"access_token":"fresh-sa-fixture","expires_in":3600}' : '{"id":"sa-result"}');
    });
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    const credentials = { apiKey: JSON.stringify({ type: "service_account", client_email: `${method}@fixture.invalid`, private_key: privateKey, project_id: "sa-project" }) };
    const executor = new VertexExecutor();
    const proxyOptions = { strictProxy: true, vercelRelayUrl: url };
    const result = method === "execute"
      ? await executor.execute({ model: "gemini-2.5-flash", body: { contents: [] }, stream: false, credentials, proxyOptions })
      : await executor.refreshCredentials(credentials, undefined, proxyOptions);
    expect(method === "execute" ? (await result.response.json()).id : result?.accessToken).toBe(method === "execute" ? "sa-result" : "fresh-sa-fixture");
    expect(seen[0]).toMatchObject({ target: "https://oauth2.googleapis.com", path: "/token",
      body: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: expect.any(String) } });
    if (method === "execute") expect(seen[1]).toMatchObject({ target: "https://aiplatform.googleapis.com",
      path: "/v1/projects/sa-project/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent", auth: "Bearer fresh-sa-fixture" });
    expect(network.blocked).toEqual([]);
  });

  it("rejects caller cancellation before reactive credential refresh", async () => {
    const caller = new AbortController();
    const reason = new Error("caller stopped before refresh");
    caller.abort(reason);
    await expect(new VertexExecutor().refreshCredentials({ apiKey: "fixture-key" }, undefined, null, caller.signal)).rejects.toBe(reason);
    expect(network.blocked).toEqual([]);
  });

  it.each(["ADC execution", "SA execution", "SA reactive refresh"])("cancels an in-flight %s through the compatible optional refresh signal", async (kind) => {
    let notify;
    const started = new Promise(resolve => { notify = resolve; });
    let requests = 0;
    const { url } = await listen(async (request, _response) => {
      for await (const _chunk of request) { /* drain the token request */ }
      requests++;
      notify();
    });
    let apiKey;
    if (kind === "ADC execution") {
      apiKey = JSON.stringify({ type: "authorized_user", client_id: "adc-cancel-client", client_secret: "fixture-secret",
        refresh_token: "adc-cancel-refresh", quota_project_id: "adc-project" });
    } else {
      const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
      apiKey = JSON.stringify({ type: "service_account", client_email: `${kind.replaceAll(" ", "-")}@cancel-fixture.invalid`, private_key: privateKey, project_id: "sa-project" });
    }
    const executor = new VertexExecutor();
    const caller = new AbortController();
    const reason = new Error(`caller stopped ${kind}`);
    const proxyOptions = { strictProxy: true, vercelRelayUrl: url };
    const pending = kind === "SA reactive refresh"
      ? executor.refreshCredentials({ apiKey }, undefined, proxyOptions, caller.signal)
      : executor.execute({ model: "gemini-2.5-flash", body: { contents: [] }, stream: false, credentials: { apiKey }, proxyOptions, signal: caller.signal });
    const outcome = pending.then(() => "unexpected success", error => error);
    await started;
    caller.abort(reason);
    expect(await within(outcome)).toBe(reason);
    expect(requests).toBe(1);
    expect(network.blocked).toEqual([]);
  });

  it.each(["probe", "generation"])("never forwards credentialed %s requests to a redirect target", async (phase) => {
    let redirected = 0;
    const target = await listen((_request, response) => { redirected++; probeResponse(response); });
    const relay = await listen(async (request, response) => { await capture(request); response.writeHead(302, { Location: target.url }); response.end(); });
    const credentials = { apiKey: `redirect-${phase}-secret`, ...(phase === "generation" ? { providerSpecificData: { projectId: "research-project" } } : {}) };
    const error = await execute(credentials, { strictProxy: true, vercelRelayUrl: relay.url }).catch(error => error);
    expect(error).toBeInstanceOf(Error);
    expect(redirected).toBe(0);
    expect(error.message).not.toContain(`redirect-${phase}-secret`);
  });
});

describe("Vertex project discovery cancellation and untrusted responses", () => {
  it("does not dial for a caller already aborted with an ordinary Error", async () => {
    const relay = await projectRelay();
    const caller = new AbortController();
    const reason = new Error("caller stopped before discovery");
    caller.abort(reason);
    await expect(execute({ apiKey: "preabort-key" }, relay.proxyOptions, { signal: caller.signal })).rejects.toBe(reason);
    expect(relay.seen).toEqual([]);
    expect(network.blocked).toEqual([]);
  });

  it.each(["headers", "body"])("cancels while probe %s are pending and never dispatches generation", async (phase) => {
    let notify;
    let requests = 0;
    const started = new Promise(resolve => { notify = resolve; });
    const { url } = await listen(async (request, response) => {
      await capture(request);
      requests++;
      if (phase === "body") { response.writeHead(404, { "Content-Type": "application/json" }); response.write('{"error":{"message":"projects/123456789012/'); }
      notify("started");
    });
    const caller = new AbortController();
    const reason = new Error(`caller stopped during ${phase}`);
    const pending = execute({ apiKey: `cancel-${phase}-key` }, { strictProxy: true, vercelRelayUrl: url }, { signal: caller.signal });
    const outcome = pending.then(() => "unexpected success", error => error);
    expect(await within(Promise.race([started, outcome]))).toBe("started");
    caller.abort(reason);
    expect(await within(outcome)).toBe(reason);
    expect(requests).toBe(1);
    expect(network.blocked).toEqual([]);
  });

  it.each(["headers", "body"])("enforces a discovery deadline while %s are pending", async (phase) => {
    let notify;
    let requests = 0;
    const started = new Promise(resolve => { notify = resolve; });
    const { url } = await listen(async (request, response) => {
      await capture(request);
      requests++;
      if (phase === "body") { response.writeHead(404, { "Content-Type": "application/json" }); response.write('{"error":{"message":"projects/123456789012/'); }
      notify("started");
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const outcome = execute({ apiKey: `deadline-${phase}-secret` }, { strictProxy: true, vercelRelayUrl: url })
      .then(() => "unexpected success", error => error);
    expect(await Promise.race([started, outcome])).toBe("started");
    await vi.advanceTimersByTimeAsync(10_001);
    vi.useRealTimers();
    const error = await within(outcome);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/timed out|deadline/i);
    expect(error.message).not.toContain(`deadline-${phase}-secret`);
    expect(requests).toBe(1);
    expect(network.blocked).toEqual([]);
  });

  it.each([401, 403, 429, 500])("does not infer a project from a denial/failure (HTTP %s) or cache it", async (status) => {
    const seen = [];
    const { url } = await listen(async (request, response) => { seen.push(await capture(request)); probeResponse(response, "123456789012", status); });
    for (let attempt = 0; attempt < 2; attempt++) {
      const error = await execute({ apiKey: `denial-${status}-secret` }, { strictProxy: true, vercelRelayUrl: url }).catch(error => error);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).not.toContain(`denial-${status}-secret`);
    }
    expect(seen.map(entry => entry.path.includes("/__probe__:"))).toEqual([true, true]);
  });

  it.each(["bad?key=secret", "..", "123456%2Fmalformed"])("rejects an unsafe inferred project without a generation request (%s)", async (project) => {
    let requests = 0;
    const { url } = await listen(async (request, response) => { await capture(request); requests++; probeResponse(response, project); });
    const error = await execute({ apiKey: "malformed-probe-secret" }, { strictProxy: true, vercelRelayUrl: url }).catch(error => error);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toContain(project);
    expect(requests).toBe(1);
    expect(network.blocked).toEqual([]);
  });

  it("never caches an inferred project containing trailing line breaks", async () => {
    let requests = 0;
    const { url } = await listen(async (request, response) => { await capture(request); requests++; probeResponse(response, "research-project\n"); });
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(execute({ apiKey: "newline-probe-key" }, { strictProxy: true, vercelRelayUrl: url })).rejects.toThrow(/project/i);
    }
    expect(requests).toBe(2);
  });

  it("bounds a chunked project-error body instead of consuming or trusting unlimited JSON", async () => {
    let requests = 0;
    const { url } = await listen(async (request, response) => {
      await capture(request);
      requests++;
      response.writeHead(404, { "Content-Type": "application/json" });
      response.write('{"error":{"message":"projects/123456789012/');
      response.end(`${"x".repeat(64 * 1024)}"}}`);
    });
    await expect(execute({ apiKey: "oversize-probe-key" }, { strictProxy: true, vercelRelayUrl: url })).rejects.toThrow(/project|discovery/i);
    expect(requests).toBe(1);
  });

  it("expires cached project discoveries within six minutes", async () => {
    const relay = await projectRelay();
    await execute({ apiKey: "expiry-probe-key" }, relay.proxyOptions);
    await execute({ apiKey: "expiry-probe-key" }, relay.proxyOptions);
    expect(relay.seen.filter(entry => entry.path.includes("/__probe__:"))).toHaveLength(1);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6 * 60 * 1000);
    await execute({ apiKey: "expiry-probe-key" }, relay.proxyOptions);
    expect(relay.seen.filter(entry => entry.path.includes("/__probe__:"))).toHaveLength(2);
  });

  it("bounds the project cache rather than retaining every raw API-key discovery", async () => {
    const relay = await projectRelay();
    await execute({ apiKey: "bounded-cache-first-key" }, relay.proxyOptions);
    for (let index = 0; index < 256; index++) await execute({ apiKey: `bounded-cache-key-${index}` }, relay.proxyOptions);
    const previous = relay.seen.length;
    await execute({ apiKey: "bounded-cache-first-key" }, relay.proxyOptions);
    expect(relay.seen.slice(previous).map(entry => entry.path.includes("/__probe__:"))).toEqual([true, false]);
  }, 15000);
});
