import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

const state = vi.hoisted(() => ({
  nativeFetch: globalThis.fetch, executor: null, credentials: null, policy: {}, provider: "openai", comboModels: null,
  getProviderCredentials: vi.fn(), markAccountUnavailable: vi.fn(), clearAccountError: vi.fn(),
  checkAndRefreshToken: vi.fn(), updateProviderCredentials: vi.fn(), imageFetch: vi.fn(),
}));
vi.mock("open-sse/executors/index.js", () => ({ getExecutor: () => state.executor }));
vi.mock("@/sse/services/auth.js", () => ({
  extractApiKey: () => null, isValidApiKey: async () => true,
  getProviderCredentials: state.getProviderCredentials,
  markAccountUnavailable: state.markAccountUnavailable,
  clearAccountError: state.clearAccountError,
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({ checkAndRefreshToken: state.checkAndRefreshToken, updateProviderCredentials: state.updateProviderCredentials }));
vi.mock("@/sse/services/model.js", () => ({ getModelInfo: async () => ({ provider: state.provider, model: "synthetic-image" }), getComboModels: async () => state.comboModels }));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => ({}), isApiKeyRequired: () => false }));
vi.mock("@/lib/usageDb.js", () => ({ enqueueRequestUsage: async () => ({ accepted: true }) }));
vi.mock("@/sse/utils/logger.js", () => ({ request() {}, debug() {}, info() {}, warn() {}, error() {} }));
vi.mock("node:dns/promises", async importOriginal => ({
  ...await importOriginal(),
  lookup: async hostname => hostname === "image-fixture.example" ? [{ address: "8.8.8.8", family: 4 }] : [],
}));
vi.mock("undici", async importOriginal => ({ ...await importOriginal(), fetch: (...args) => state.imageFetch(...args) }));

import { handleImageGenerationCore } from "open-sse/handlers/imageGenerationCore.js";
import { handleImageGeneration } from "@/sse/handlers/imageGeneration.js";
import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";
import { readImageUrl } from "open-sse/handlers/imageProviders/_base.js";
import { AntigravityExecutor } from "open-sse/executors/antigravity.js";

const servers = [];
let direct;
const log = { debug() {}, info() {}, warn() {}, error() {} };
const tokens = { input_tokens: 3, output_tokens: 5, total_tokens: 8 };
const inline = { created: 1, data: [{ b64_json: "iVBORw0KGgo=" }] };
const invoke = (provider = "openai", extra = {}) => handleImageGenerationCore({
  body: { prompt: "synthetic prompt" }, modelInfo: { provider, model: "synthetic-image" },
  credentials: state.credentials, log, ...extra,
});

beforeEach(() => {
  direct = [];
  for (const value of Object.values(state)) if (vi.isMockFunction(value)) value.mockReset();
  state.executor = { noAuth: true };
  state.provider = "openai";
  state.comboModels = null;
  state.credentials = { connectionId: "synthetic-image-account", apiKey: "synthetic-image-key", providerSpecificData: {} };
  state.getProviderCredentials.mockImplementation(async () => state.credentials);
  state.checkAndRefreshToken.mockImplementation(async (_provider, credentials) => credentials);
  state.markAccountUnavailable.mockResolvedValue({ shouldFallback: true });
  for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(name, "");
  vi.stubEnv("DISABLE_MITM_BYPASS", "1");
  vi.stubGlobal("fetch", (url, init) => {
    if (new URL(String(url)).hostname !== "127.0.0.1") {
      direct.push(String(url));
      throw new Error("Unexpected direct image egress");
    }
    return state.nativeFetch(url, init);
  });
});
afterEach(async () => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

async function relay(handler) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const entry = {
      target: request.headers["x-relay-target"], path: request.headers["x-relay-path"],
      headers: request.headers, method: request.method, body: Buffer.concat(chunks).toString(),
    };
    requests.push(entry);
    response.setHeader("content-type", "application/json");
    handler(entry, response, requests);
  });
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const proxyOptions = { strictProxy: true, vercelRelayUrl: `http://127.0.0.1:${server.address().port}` };
  state.credentials.providerSpecificData = proxyOptions;
  return { requests, proxyOptions };
}

describe("image account route", () => {
  it.each(["openai", "minimax", "openrouter", "recraft", "vercel-ai-gateway", "xai", "tokenrouter"])("submits %s JSON through the selected strict relay", async provider => {
    const route = await relay((_entry, response) => response.end(JSON.stringify(inline)));
    const result = await invoke(provider);
    expect(result.success).toBe(true);
    expect(await result.response.json()).toEqual(inline);
    expect(route.requests).toHaveLength(1);
    expect(route.requests[0].headers.authorization).toBe("Bearer synthetic-image-key");
    expect(JSON.parse(route.requests[0].body).prompt).toBe("synthetic prompt");
    expect(direct).toEqual([]);
  });

  it("fails an unavailable account route before credential dispatch or account mutation", async () => {
    state.credentials.providerSpecificData = { strictProxy: true, connectionProxyEnabled: true, connectionProxyUrl: "", proxyPoolId: "missing" };
    const response = await handleImageGeneration(new Request("http://localhost/v1/images/generations", {
      method: "POST", body: JSON.stringify({ model: "openai/synthetic-image", prompt: "synthetic" }),
    }));
    expect(response.status).toBe(502);
    expect(direct).toEqual([]);
    expect(state.getProviderCredentials).toHaveBeenCalledTimes(1);
    expect(state.markAccountUnavailable).not.toHaveBeenCalled();
    expect(state.clearAccountError).not.toHaveBeenCalled();
    expect(state.checkAndRefreshToken.mock.calls[0][2].proxyOptions).toMatchObject({ strictProxy: true, connectionProxyEnabled: true });
  });

  it("uses the same frozen route for 401 refresh and the single authorized resend", async () => {
    const route = await relay((entry, response, requests) => {
      if (entry.path === "/synthetic-token") response.end('{"access_token":"synthetic-rotated-image-token"}');
      else if (requests.length === 1) { response.statusCode = 401; response.end('{"error":{"message":"expired"}}'); }
      else response.end(JSON.stringify(inline));
    });
    state.executor = {
      refreshCredentials: vi.fn(async (_credentials, _log, policy, signal) => {
        expect(Object.isFrozen(policy)).toBe(true);
        const response = await proxyAwareFetch("https://image-auth.example/synthetic-token", { method: "POST", signal }, policy);
        return { accessToken: (await response.json()).access_token, apiKey: "synthetic-rotated-image-token", providerSpecificData: { strictProxy: true } };
      }),
    };
    const commit = vi.fn();
    const result = await invoke("openai", { onCredentialsRefreshed: commit });
    expect(result.success).toBe(true);
    expect(route.requests.map(({ path }) => path)).toEqual(["/v1/images/generations", "/synthetic-token", "/v1/images/generations"]);
    expect(route.requests[2].headers.authorization).toBe("Bearer synthetic-rotated-image-token");
    expect(commit).toHaveBeenCalledOnce();
    expect(direct).toEqual([]);
  });

  it("does not retry a rejected request whose reported usage was already incurred", async () => {
    const route = await relay((_entry, response) => {
      response.statusCode = 401;
      response.end(JSON.stringify({ error: { message: "expired after work" }, usage: tokens }));
    });
    state.executor = { refreshCredentials: vi.fn() };
    const onUsage = vi.fn();
    const result = await invoke("openai", { onUsage });
    expect(result).toMatchObject({ success: false, status: 401 });
    expect(onUsage).toHaveBeenCalledOnce();
    expect(state.executor.refreshCredentials).not.toHaveBeenCalled();
    expect(route.requests).toHaveLength(1);
  });

  it("forwards policy and caller signal through the Antigravity executor boundary", async () => {
    const route = await relay((_entry, response) => response.end(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" } }] } }],
    })));
    const caller = new AbortController();
    state.executor = { execute: vi.fn(async ({ proxyOptions, signal, transport }) => {
      expect(proxyOptions).toMatchObject(route.proxyOptions);
      expect(signal).toBe(caller.signal);
      expect(transport.proxyOptions).toBe(proxyOptions);
      return { response: await transport.fetch("https://image-executor.example/generate", { method: "POST", headers: { authorization: "Bearer synthetic-executor-token" }, signal }) };
    }) };
    expect((await invoke("antigravity", { clientSignal: caller.signal })).success).toBe(true);
    expect(route.requests).toHaveLength(1);
    expect(route.requests[0].headers.authorization).toBe("Bearer synthetic-executor-token");
    expect(direct).toEqual([]);
  });

  it("uses the real Antigravity executor through a strict relay with its native envelope", async () => {
    const route = await relay((_entry, response) => response.end(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" } }] } }],
    })));
    state.executor = new AntigravityExecutor();
    state.credentials.projectId = "synthetic-image-project";
    state.credentials.accessToken = "synthetic-executor-token";
    const result = await invoke("antigravity");
    expect(result.success).toBe(true);
    expect(route.requests).toHaveLength(1);
    expect(route.requests[0].headers.authorization).toBe("Bearer synthetic-executor-token");
    expect(route.requests[0].path).toBe("/v1internal:generateContent");
    const envelope = JSON.parse(route.requests[0].body);
    expect(envelope.project).toBe("synthetic-image-project");
    expect(envelope.model).toContain("image");
    expect(envelope.request.contents[0].parts[0].text).toContain("synthetic prompt");
    expect(direct).toEqual([]);
  });

  it.each(["redirect", "network failure", "server error"])("never replays the real image executor submission after %s", async outcome => {
    const route = await relay((_entry, response) => {
      if (outcome === "redirect") { response.writeHead(302, { location: "https://credential-trap.example/image" }); response.end(); }
      else if (outcome === "network failure") response.destroy();
      else { response.statusCode = 503; response.end('{"error":{"message":"uncertain image job"}}'); }
    });
    state.executor = new AntigravityExecutor();
    state.credentials.projectId = "synthetic-image-project";
    state.credentials.accessToken = "synthetic-executor-token";
    const result = await invoke("antigravity");
    expect(result.success).toBe(false);
    expect(result.status).toBe(outcome === "server error" ? 503 : 502);
    if (outcome !== "server error") expect(result.localFailure).toBe(true);
    expect(route.requests).toHaveLength(1);
    expect(direct).toEqual([]);
  });

  it("cancels a late real Antigravity response without another URL or submission", async () => {
    const caller = new AbortController();
    let closed;
    const disconnected = new Promise(resolve => { closed = resolve; });
    const route = await relay((_entry, response) => {
      response.on("close", closed);
      response.flushHeaders();
    });
    const guardedFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (...args) => {
      const response = await guardedFetch(...args);
      caller.abort(new Error("synthetic late image cancellation"));
      return response;
    });
    state.executor = new AntigravityExecutor();
    state.credentials.projectId = "synthetic-image-project";
    expect(await invoke("antigravity", { clientSignal: caller.signal })).toMatchObject({ success: false, status: 499 });
    let timer;
    try {
      await Promise.race([disconnected, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Image socket did not close")), 1000); })]);
    } finally { clearTimeout(timer); }
    expect(route.requests).toHaveLength(1);
    expect(direct).toEqual([]);
  });
});

describe("image submissions are not replayed after uncertain or accepted work", () => {
  const requestImage = () => handleImageGeneration(new Request("http://localhost/v1/images/generations", {
    method: "POST", body: JSON.stringify({ model: "synthetic-image-route", prompt: "synthetic" }),
  }));

  it.each(["server error", "connection reset", "invalid success JSON", "invalid rejection JSON", "truncated rejection body"])("does not select a second account after %s", async outcome => {
    const route = await relay((_entry, response) => {
      if (outcome === "connection reset") { response.destroy(); return; }
      response.statusCode = outcome === "server error" ? 503 : outcome.includes("rejection") ? 429 : 200;
      if (outcome === "truncated rejection body") {
        response.write('{"error":{"message":"rate limit"');
        response.destroy();
      } else response.end(outcome === "server error" ? '{"error":{"message":"image job outcome uncertain"}}' : "{broken JSON");
    });
    const response = await requestImage();
    expect(response.status).toBe(outcome === "server error" ? 503 : outcome === "invalid rejection JSON" ? 429 : 502);
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(state.getProviderCredentials).toHaveBeenCalledOnce();
    expect(route.requests).toHaveLength(1);
    expect(direct).toEqual([]);
  });

  it.each([
    ["reported incurred usage", { usage: tokens }],
    ["an accepted job identifier", { id: "synthetic-accepted-job" }],
  ])("does not rotate on a 429 that includes %s", async (_label, evidence) => {
    const route = await relay((_entry, response) => {
      response.statusCode = 429;
      response.end(JSON.stringify({ error: { message: "rate limit after work" }, ...evidence }));
    });
    const response = await requestImage();
    expect(response.status).toBe(429);
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(state.getProviderCredentials).toHaveBeenCalledOnce();
    expect(route.requests).toHaveLength(1);
  });

  it("does not replay an accepted BFL job when its status poll returns 429", async () => {
    state.provider = "black-forest-labs";
    const route = await relay((_entry, response, requests) => {
      if (requests.length === 1) response.end('{"polling_url":"https://api.bfl.ai/status"}');
      else { response.statusCode = 429; response.end('{"error":{"message":"rate limit"}}'); }
    });
    const response = await requestImage();
    expect(response.status).toBe(429);
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(state.getProviderCredentials).toHaveBeenCalledOnce();
    expect(route.requests.map(({ method }) => method)).toEqual(["POST", "GET"]);
    expect(direct).toEqual([]);
  });

  it("preserves account rotation after an explicit complete pre-work 429 rejection", async () => {
    const route = await relay((_entry, response, requests) => {
      if (requests.length === 1) { response.statusCode = 429; response.end('{"error":{"message":"rate limit"}}'); }
      else response.end(JSON.stringify(inline));
    });
    const first = state.credentials;
    state.getProviderCredentials.mockReset()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({ ...first, connectionId: "synthetic-second-account", apiKey: "synthetic-second-key" })
      .mockResolvedValue(null);
    const response = await requestImage();
    expect(response.status).toBe(200);
    expect(state.getProviderCredentials).toHaveBeenCalledTimes(2);
    expect(state.getProviderCredentials.mock.calls[1][1].has(first.connectionId)).toBe(true);
    expect(route.requests.map(({ headers }) => headers.authorization)).toEqual(["Bearer synthetic-image-key", "Bearer synthetic-second-key"]);
    expect(state.markAccountUnavailable).toHaveBeenCalledOnce();
    expect(direct).toEqual([]);
  });

  it("retains the existing non-retryable account decision even after a pre-work 429", async () => {
    const route = await relay((_entry, response) => { response.statusCode = 429; response.end('{"error":{"message":"rate limit"}}'); });
    state.markAccountUnavailable.mockResolvedValue({ shouldFallback: false });
    expect((await requestImage()).headers.get("x-should-retry")).toBe("false");
    expect(state.getProviderCredentials).toHaveBeenCalledOnce();
    expect(route.requests).toHaveLength(1);
  });

  it("does not treat quota words in a quoted rejected value as a pre-work availability rejection", async () => {
    const route = await relay((_entry, response) => {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: { message: 'Invalid prompt value "quota exceeded with usage: {input_tokens: 3, output_tokens: 5}"' } }));
    });
    expect((await requestImage()).status).toBe(400);
    expect(state.getProviderCredentials).toHaveBeenCalledOnce();
    expect(route.requests).toHaveLength(1);
  });

  it("stops image combo fallback after an uncertain accepted attempt", async () => {
    state.comboModels = ["openai/synthetic-first", "openai/synthetic-second"];
    const route = await relay((_entry, response) => { response.statusCode = 503; response.end('{"error":{"message":"job outcome uncertain"}}'); });
    const response = await requestImage();
    expect(response.status).toBe(503);
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(state.getProviderCredentials).toHaveBeenCalledOnce();
    expect(route.requests).toHaveLength(1);
  });

  it.each([401, 403, 429])("marks real Antigravity HTTP %s as an explicit pre-work rejection", async status => {
    const route = await relay((_entry, response) => { response.statusCode = status; response.end('{"error":{"message":"request rejected"}}'); });
    state.executor = new AntigravityExecutor();
    state.credentials.projectId = "synthetic-image-project";
    expect(await invoke("antigravity")).toMatchObject({ success: false, status, allowAccountFallback: true });
    expect(route.requests).toHaveLength(1);
    expect(direct).toEqual([]);
  });
});

describe("image async polling routes", () => {
  it.each([
    ["black-forest-labs", "http://api.bfl.ai/poll"],
    ["black-forest-labs", "https://api.bfl.ai.evil.example/poll"],
    ["black-forest-labs", "https://api.bfl.ai@evil.example/poll"],
    ["black-forest-labs", "https://evil@api.bfl.ai/poll"],
    ["black-forest-labs", "https://127.0.0.1/private"],
    ["black-forest-labs", "https://169.254.169.254/metadata"],
    ["fal-ai", "http://queue.fal.run/status"],
    ["fal-ai", "https://queue.fal.run.evil.example/status"],
    ["fal-ai", "https://queue.fal.run@evil.example/status"],
    ["fal-ai", "https://evil@queue.fal.run/status"],
    ["fal-ai", "https://127.0.0.1/private"],
  ])("rejects a credentialed %s poll outside the official HTTPS origins: %s", async (provider, url) => {
    const route = await relay((_entry, response) => response.end(JSON.stringify({
      polling_url: url, status_url: url, response_url: "https://queue.fal.run/result", usage: tokens,
    })));
    const onUsage = vi.fn(), onRequestSuccess = vi.fn();
    expect(await invoke(provider, { onUsage, onRequestSuccess })).toMatchObject({ success: false, status: 502, localFailure: true });
    expect(route.requests).toHaveLength(1);
    expect(onUsage).toHaveBeenCalledOnce();
    expect(onRequestSuccess).not.toHaveBeenCalled();
    expect(direct).toEqual([]);
  });

  it("validates the Fal result origin before making even its first authenticated status request", async () => {
    const route = await relay((_entry, response) => response.end(JSON.stringify({
      status_url: "https://queue.fal.run/status", response_url: "https://credential-trap.example/result",
    })));
    expect(await invoke("fal-ai")).toMatchObject({ success: false, status: 502, localFailure: true });
    expect(route.requests).toHaveLength(1);
    expect(direct).toEqual([]);
  });

  it("refuses a real credential-bearing redirect before forwarding its x-key", async () => {
    const requests = [];
    const server = createServer((request, response) => {
      requests.push({ url: request.url, key: request.headers["x-key"] });
      if (request.url === "/submit") { response.writeHead(302, { location: "/credential-trap" }); response.end(); }
      else response.end(JSON.stringify(inline));
    });
    servers.push(server);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const endpoint = `http://127.0.0.1:${server.address().port}/submit`;
    vi.stubGlobal("fetch", (_url, init) => state.nativeFetch(endpoint, init));
    expect(await invoke("black-forest-labs")).toMatchObject({ success: false, status: 502, localFailure: true });
    expect(requests).toEqual([{ url: "/submit", key: "synthetic-image-key" }]);
  });

  it.each([
    ["black-forest-labs", "https://api.bfl.ai"],
    ["black-forest-labs", "https://api.eu.bfl.ai"],
    ["black-forest-labs", "https://api.us.bfl.ai"],
    ["fal-ai", "https://queue.fal.run"],
    ["nanobanana", null], ["runwayml", null],
  ])("keeps %s polling and result requests on the selected relay (%s)", async (provider, pollOrigin) => {
    const route = await relay((entry, response, requests) => {
      if (requests.length === 1) {
        const submitted = provider === "black-forest-labs" ? { polling_url: `${pollOrigin}/status` }
          : provider === "fal-ai" ? { status_url: "https://queue.fal.run/status", response_url: "https://queue.fal.run/result" }
            : provider === "nanobanana" ? { code: 200, data: { taskId: "synthetic-job" } } : { id: "synthetic-job" };
        response.end(JSON.stringify(submitted));
      } else {
        const completed = provider === "black-forest-labs" ? { status: "Ready", result: { sample: "https://image-fixture.example/generated.png" } }
          : provider === "fal-ai" ? entry.path === "/status" ? { status: "COMPLETED" } : { images: [{ url: "https://image-fixture.example/generated.png" }] }
            : provider === "nanobanana" ? { data: { successFlag: 1, response: { resultImageUrl: "https://image-fixture.example/generated.png" } } }
              : { status: "SUCCEEDED", output: ["https://image-fixture.example/generated.png"] };
        response.end(JSON.stringify(completed));
      }
    });
    const result = await invoke(provider);
    expect(result.success).toBe(true);
    expect((await result.response.json()).data[0].url).toBe("https://image-fixture.example/generated.png");
    expect(route.requests).toHaveLength(provider === "fal-ai" ? 3 : 2);
    for (const request of route.requests.slice(1)) {
      expect(request.method).toBe("GET");
      expect(request.headers.authorization || request.headers["x-key"]).toMatch(/synthetic-image-key/);
    }
    if (pollOrigin) expect(route.requests[1].target).toBe(pollOrigin);
    expect(direct).toEqual([]);
  });

  it("stops polling after caller cancellation and retains incurred usage once", async () => {
    const caller = new AbortController();
    const route = await relay((_entry, response) => {
      response.end(JSON.stringify({ polling_url: "https://api.bfl.ai/status", usage: tokens }));
    });
    const guardedFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (...args) => {
      const response = await guardedFetch(...args);
      const parse = response.json.bind(response);
      response.json = async () => {
        const body = await parse();
        // The complete submit response incurred usage; abort at its delivery
        // boundary, before the adapter can start its first polling delay.
        caller.abort(new Error("synthetic image caller left"));
        return body;
      };
      return response;
    });
    const onUsage = vi.fn();
    expect(await invoke("black-forest-labs", { clientSignal: caller.signal, onUsage })).toMatchObject({ success: false, status: 499 });
    expect(route.requests).toHaveLength(1);
    expect(direct).toEqual([]);
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ prompt_tokens: 3, completion_tokens: 5 }), { status: "aborted" });
  });

  it("does not replay a submission when its relay fails during a poll", async () => {
    const route = await relay((_entry, response, requests) => {
      if (requests.length === 1) response.end(JSON.stringify({ polling_url: "https://api.bfl.ai/status", usage: tokens }));
      else response.destroy();
    });
    const onUsage = vi.fn();
    expect(await invoke("black-forest-labs", { onUsage })).toMatchObject({ success: false, status: 502, localFailure: true });
    expect(route.requests).toHaveLength(2);
    expect(route.requests.filter(({ method }) => method === "POST")).toHaveLength(1);
    expect(onUsage).toHaveBeenCalledOnce();
    expect(direct).toEqual([]);
  });
});

describe("remote image assets retain the guarded download boundary", () => {
  it("allows inline Cloudflare references through the strict account relay", async () => {
    const route = await relay((_entry, response) => response.end(JSON.stringify({ result: { image: "iVBORw0KGgo=" } })));
    state.credentials.providerSpecificData.accountId = "synthetic-cloudflare-account";
    const result = await invoke("cloudflare-ai", { body: { prompt: "synthetic", image: "data:image/png;base64,iVBORw0KGgo=" } });
    expect(result.success).toBe(true);
    expect(route.requests).toHaveLength(1);
    expect(JSON.parse(route.requests[0].body).image_b64).toBe("iVBORw0KGgo=");
    expect(state.imageFetch).not.toHaveBeenCalled();
    expect(direct).toEqual([]);
  });

  it.each(["cloudflare-ai", "antigravity"])("fails closed for a remote %s reference under an explicit proxy", async provider => {
    await relay((_entry, response) => response.end(JSON.stringify(inline)));
    state.credentials.providerSpecificData.accountId = "synthetic-cloudflare-account";
    state.executor = { execute: vi.fn() };
    const result = await invoke(provider, { body: { prompt: "synthetic", image: "https://image-fixture.example/reference.png" } });
    expect(result).toMatchObject({ success: false, status: 502, localFailure: true });
    expect(state.imageFetch).not.toHaveBeenCalled();
    expect(state.executor.execute).not.toHaveBeenCalled();
    expect(direct).toEqual([]);
  });

  it("does not mark a URL response healthy when binary download cannot honor its account proxy", async () => {
    const route = await relay((_entry, response) => response.end(JSON.stringify({ created: 1, data: [{ url: "https://image-fixture.example/generated.png" }], usage: tokens })));
    const onUsage = vi.fn(), onRequestSuccess = vi.fn();
    expect(await invoke("openai", { binaryOutput: true, onUsage, onRequestSuccess })).toMatchObject({ success: false, status: 502, localFailure: true });
    expect(route.requests).toHaveLength(1);
    expect(onUsage).toHaveBeenCalledOnce();
    expect(onRequestSuccess).not.toHaveBeenCalled();
    expect(state.imageFetch).not.toHaveBeenCalled();
    expect(direct).toEqual([]);
  });

  it("rejects loopback/metadata output URLs before any image transport dispatch", async () => {
    for (const url of ["http://127.0.0.1/private.png", "http://169.254.169.254/metadata.png"]) {
      await expect(readImageUrl(url)).rejects.toThrow(/rejected or unavailable/);
    }
    expect(state.imageFetch).not.toHaveBeenCalled();
  });

  it("does not mutate account health when the guarded binary output download is rejected", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ created: 1, data: [{ url: "http://169.254.169.254/metadata" }] }));
    const response = await handleImageGeneration(new Request("http://localhost/v1/images/generations?response_format=binary", {
      method: "POST", body: JSON.stringify({ model: "openai/synthetic-image", prompt: "synthetic" }),
    }));
    expect(response.status).toBe(502);
    expect(response.headers.get("x-should-retry")).toBe("false");
    expect(state.getProviderCredentials).toHaveBeenCalledOnce();
    expect(state.markAccountUnavailable).not.toHaveBeenCalled();
    expect(state.clearAccountError).not.toHaveBeenCalled();
    expect(state.imageFetch).not.toHaveBeenCalled();
  });

  it("retains actual image MIME when a guarded JPEG download fulfills a binary response", async () => {
    const jpeg = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]);
    state.imageFetch.mockImplementationOnce(async (_url, options) => {
      expect(options.redirect).toBe("manual");
      expect(options.dispatcher).toBeDefined();
      return new Response(jpeg, { headers: { "content-type": "application/octet-stream" } });
    });
    vi.stubGlobal("fetch", async () => Response.json({ created: 1, data: [{ url: "https://image-fixture.example/generated.png" }] }));
    const result = await invoke("openai", { binaryOutput: true });
    expect(result.success).toBe(true);
    expect(result.response.headers.get("content-type")).toBe("image/jpeg");
    expect(result.response.headers.get("content-disposition")).toContain("image.jpeg");
    expect(new Uint8Array(await result.response.arrayBuffer())).toEqual(jpeg);
    expect(state.imageFetch).toHaveBeenCalledOnce();
  });

  it("rejects disguised non-image bytes instead of changing binary output into JSON", async () => {
    state.imageFetch.mockResolvedValueOnce(new Response("not an image", { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", async () => Response.json({ created: 1, data: [{ url: "https://image-fixture.example/disguised.png" }] }));
    const onRequestSuccess = vi.fn();
    expect(await invoke("openai", { binaryOutput: true, onRequestSuccess })).toMatchObject({ success: false, status: 502 });
    expect(onRequestSuccess).not.toHaveBeenCalled();
    expect(state.imageFetch).toHaveBeenCalledOnce();
  });
});
