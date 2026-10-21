import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zstdCompressSync } from "node:zlib";

// Exercise the real route, handler, auth, decoder, correlation and limiter.
// Replace only storage, provider execution and side-effectful startup/I/O.
const state = vi.hoisted(() => ({
  settings: {}, settingsReads: 0, accountReads: 0,
  validate: vi.fn(), update: vi.fn(), dispatch: vi.fn(),
  getAdapter: vi.fn(() => { throw new Error("unexpected database access"); }),
  fetch: vi.fn(() => { throw new Error("unexpected network access"); }),
}));
vi.mock("open-sse/index.js", () => ({}));
vi.mock("open-sse/translator/index.js", () => ({ initTranslators: async () => {} }));
vi.mock("@/lib/localDb", () => ({
  getSettings: async () => { state.settingsReads++; return state.settings; },
  isApiKeyRequired: settings => settings.requireApiKey === true,
  validateApiKey: state.validate,
  getProviderConnections: async () => {
    state.accountReads++;
    return [{ id: "offline-account", provider: "codex", authType: "apikey", apiKey: "offline-provider-key", isActive: true, providerSpecificData: {} }];
  },
  getProviderConnectionById: async () => null,
  updateProviderConnection: state.update,
  getProxyPools: async () => [], getProviderNodes: async () => [],
  getModelAliases: async () => ({}), getComboByName: async () => null,
}));
vi.mock("../../src/lib/db/driver.js", () => ({ getAdapter: state.getAdapter, getAdapterSync: state.getAdapter }));
vi.mock("../../src/lib/db/repos/aliasRepo.js", () => ({ getCustomModels: async () => [] }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: async () => ({}), pickProxyPoolId: vi.fn() }));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledByProvider: async () => [] }));
vi.mock("@/sse/services/model.js", () => ({
  getComboModels: async () => null,
  getModelInfo: async () => ({ provider: "codex", model: "fixture" }),
  resolveModelCapabilities: async () => new Map(),
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: async (_provider, credentials) => credentials, updateProviderCredentials: vi.fn(),
}));
vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest() {}, appendRequestLog: async () => {},
  saveRequestDetail: async () => {}, saveRequestUsage: async () => {},
}));
vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: state.fetch }));
vi.mock("open-sse/handlers/chatCore.js", () => ({ handleChatCore: state.dispatch }));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: async () => null }));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent() {} }));
vi.mock("@/sse/utils/logger.js", () => ({
  debug() {}, info() {}, warn() {}, error() {}, errorLine() {}, maskKey: () => "offline",
}));

import { POST } from "../../src/app/api/v1/responses/compact/route.js";
import { consume, rateLimitKey, resetRateLimiter, RATE_LIMIT_RPM, RATE_LIMIT_BURST } from "../../src/lib/rateLimit/v1Limiter.js";

function request(body, { encoding, signal, headers = {} } = {}) {
  return new Request("http://localhost/v1/responses/compact", {
    method: "POST", body, signal, duplex: "half",
    headers: { "content-type": "application/json", authorization: "Bearer allowed-fixture",
      ...(encoding ? { "content-encoding": encoding } : {}), ...headers },
  });
}
function upload(bytes = Buffer.from("broken")) {
  let reads = 0, cancellations = 0;
  const stream = new ReadableStream({
    pull(controller) { reads++; controller.enqueue(bytes); controller.close(); },
    cancel() { cancellations++; },
  }, { highWaterMark: 0 });
  return { stream, reads: () => reads, cancellations: () => cancellations };
}
async function expectError(response, status, code) {
  expect(response.status).toBe(status);
  expect(response.headers.get("x-request-id")).toBeTruthy();
  const payload = await response.json();
  expect(payload.error.code).toBe(code);
  expect(state.accountReads).toBe(0);
  expect(state.dispatch).not.toHaveBeenCalled();
  return payload;
}
async function within(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(null), 500); })]);
  } finally {
    clearTimeout(timer);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimiter();
  state.settingsReads = 0;
  state.accountReads = 0;
  state.settings = { requireApiKey: true, quotaAwareSelection: false, fallbackStrategy: "fill-first" };
  state.validate.mockImplementation(async key => key === "allowed-fixture");
  state.dispatch.mockImplementation(async ({ body }) => ({ success: true, response: Response.json(body) }));
});
afterEach(() => {
  vi.useRealTimers();
  expect(state.getAdapter).not.toHaveBeenCalled();
  expect(state.fetch).not.toHaveBeenCalled();
  expect(state.update).not.toHaveBeenCalled();
});

describe("compact request transport", () => {
  it.each([undefined, "identity", "zstd"])("decodes %s compact once without cloning or reencoding", async encoding => {
    const body = {
      model: "codex/fixture", max_output_tokens: 37, _compact: false,
      input: [{ role: "user", content: [{ type: "input_image", image_url: "data:image/png;base64,AAEC" }] }],
    };
    const text = JSON.stringify(body);
    const bytes = encoding === "zstd" ? zstdCompressSync(text) : Buffer.from(text);
    const caller = new AbortController();
    const inbound = request(bytes, { encoding, signal: caller.signal, headers: {
      "content-length": String(bytes.byteLength), "x-connection-id": "offline-account", "user-agent": "offline-compact-agent",
    } });
    const json = vi.spyOn(inbound, "json");
    const arrayBuffer = vi.spyOn(inbound, "arrayBuffer");
    const clone = vi.spyOn(inbound, "clone");
    state.dispatch.mockImplementation(async options => {
      expect(options.clientSignal).toBe(inbound.signal);
      expect(options.apiKey).toBe("allowed-fixture");
      expect(options.userAgent).toBe("offline-compact-agent");
      expect(options.credentials.connectionId).toBe("offline-account");
      expect(options.clientRawRequest).toMatchObject({ endpoint: "/v1/responses/compact", headers: {
        authorization: "Bearer allowed-fixture", "content-length": String(bytes.byteLength), "x-connection-id": "offline-account",
      }, body: { ...body, _compact: true } });
      if (encoding) expect(options.clientRawRequest.headers["content-encoding"]).toBe(encoding);
      return { success: true, response: Response.json(options.body) };
    });
    const response = await POST(inbound);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...body, _compact: true });
    expect(json).not.toHaveBeenCalled();
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
    expect(state.validate).toHaveBeenCalledExactlyOnceWith("allowed-fixture");
    expect(state.dispatch).toHaveBeenCalledTimes(1);
    expect(response.headers.get("x-ratelimit-remaining")).toBe(String(RATE_LIMIT_RPM - 1));
    expect(consume(rateLimitKey("allowed-fixture")).remaining).toBe(RATE_LIMIT_RPM - 2);
  });

  it("sends a valid compressed empty object to the same missing-model validation", async () => {
    const response = await POST(request(zstdCompressSync("{}"), { encoding: "zstd" }));
    const payload = await expectError(response, 400, "bad_request");
    expect(payload.error.message).toBe("Missing model");
  });

  it.each([undefined, "Bearer rejected-fixture"])("rejects %s authorization without reading compressed input", async authorization => {
    const source = upload();
    const inbound = request(source.stream, { encoding: "zstd" });
    if (authorization) inbound.headers.set("authorization", authorization);
    else inbound.headers.delete("authorization");
    const payload = await expectError(await POST(inbound), 401, "invalid_api_key");
    expect(payload.error.message).toBe(authorization ? "Invalid API key" : "Missing API key");
    expect(source.reads()).toBe(0);
  });

  it("waits for authentication before starting a compressed upload", async () => {
    let allow, validationStarted;
    const validating = new Promise(resolve => { validationStarted = resolve; });
    state.validate.mockImplementation(() => { validationStarted(); return new Promise(resolve => { allow = resolve; }); });
    const source = upload(zstdCompressSync("{}"));
    const pending = POST(request(source.stream, { encoding: "zstd" })).catch(error => error);
    await within(validating);
    const earlyReads = source.reads();
    allow?.(true);
    expect((await pending).status).toBe(400);
    expect(earlyReads).toBe(0);
    expect(source.reads()).toBe(1);
  });

  it("refuses a rate-limited caller without reading compressed input", async () => {
    vi.useFakeTimers();
    for (let index = 0; index < RATE_LIMIT_BURST; index++) consume(rateLimitKey("allowed-fixture"));
    const source = upload();
    await expectError(await POST(request(source.stream, { encoding: "zstd" })), 429, "rate_limit_exceeded");
    expect(source.reads()).toBe(0);
  });

  it.each(["gzip", "zstd, identity"])("keeps unsupported %s decoding a structured 415", async encoding => {
    const source = upload();
    await expectError(await POST(request(source.stream, { encoding })), 415, "unsupported_content_encoding");
    expect(source.reads()).toBe(0);
  });

  it("keeps corrupt compressed input a structured client error", async () => {
    await expectError(await POST(request("broken", { encoding: "zstd" })), 400, "invalid_compressed_body");
  });

  it.each([[null], [[]], ["hello"], [0], [true]])("rejects non-object compact JSON without crashing: %j", async value => {
    for (const encoding of [undefined, "zstd"]) {
      const text = JSON.stringify(value);
      const payload = await expectError(await POST(request(encoding ? zstdCompressSync(text) : text, { encoding })), 400, "bad_request");
      expect(payload.error).toMatchObject({ param: "body", message: expect.stringContaining("object") });
    }
  });

  it("does not consume a pre-aborted request even before authentication", async () => {
    const source = upload();
    await expectError(await POST(request(source.stream, { encoding: "zstd", signal: AbortSignal.abort(new Error("already left")) })), 499, "client_aborted");
    expect(source.reads()).toBe(0);
    expect(state.settingsReads).toBe(0);
    expect(state.validate).not.toHaveBeenCalled();
  });

  it("cancels a compressed upload when the original caller leaves", async () => {
    const caller = new AbortController();
    let started;
    const reading = new Promise(resolve => { started = resolve; });
    let cancellations = 0;
    const body = new ReadableStream({ pull() { started(); }, cancel() { cancellations++; } }, { highWaterMark: 0 });
    const pending = POST(request(body, { encoding: "zstd", signal: caller.signal }));
    await reading;
    caller.abort(new Error("caller left mid-upload"));
    const response = await within(pending);
    expect(response?.status).toBe(499);
    if (response) await expectError(response, 499, "client_aborted");
    expect(cancellations).toBe(1);
    expect(body.locked).toBe(false);
  });

  it("retains caller cancellation during provider dispatch while adding only the compact marker", async () => {
    const caller = new AbortController();
    const body = {
      model: "codex/fixture", max_output_tokens: 37,
      input: [{ role: "user", content: [{ type: "input_image", image_url: "data:image/png;base64,AAEC" }] }],
    };
    const inbound = request(JSON.stringify(body), { signal: caller.signal });
    state.dispatch.mockImplementation(async ({ clientSignal }) => {
      expect(clientSignal).toBe(inbound.signal);
      caller.abort(new Error("caller left during dispatch"));
      return { success: false, status: 499, error: "client_aborted", response: Response.json({
        error: { message: "Client Closed Request", type: "invalid_request_error", code: "client_aborted" },
      }, { status: clientSignal.aborted ? 499 : 200 }) };
    });
    const response = await POST(inbound);
    expect(response.status).toBe(499);
    expect((await response.json()).error.code).toBe("client_aborted");
    expect(state.dispatch.mock.calls[0][0].body).toEqual({ ...body, _compact: true });
  });

  it.each([undefined, "zstd"])("retains >2 MiB typed media and explicit caps in %s compact input", async encoding => {
    const body = { model: "codex/fixture", max_output_tokens: 37, input: [
      { role: "user", content: [{ type: "input_image", image_url: `data:image/png;base64,${"A".repeat(3 * 1024 * 1024)}` }] },
    ] };
    const text = JSON.stringify(body);
    const response = await POST(request(encoding ? zstdCompressSync(text) : text, { encoding }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...body, _compact: true });
  });

  it("checks wire Content-Length before reading compact input", async () => {
    const source = upload();
    await expectError(await POST(request(source.stream, { encoding: "zstd", headers: { "content-length": "33554433" } })), 413, "request_body_too_large");
    expect(source.reads()).toBe(0);
  });

  it("bounds expanded compact input before applying its marker or selecting an account", async () => {
    const text = Buffer.alloc(65 * 1024 * 1024, 32);
    text.write("{}");
    await expectError(await POST(request(zstdCompressSync(text), { encoding: "zstd" })), 413, "request_body_too_large");
  });

  it("times out a stalled compact upload within the shared total deadline", async () => {
    vi.useFakeTimers();
    let cancellations = 0;
    const body = new ReadableStream({ cancel() { cancellations++; } }, { highWaterMark: 0 });
    const pending = POST(request(body));
    await vi.advanceTimersByTimeAsync(30_001);
    const response = await Promise.race([pending, Promise.resolve(null)]);
    expect(response?.status).toBe(408);
    if (response) await expectError(response, 408, "request_body_timeout");
    expect(cancellations).toBe(1);
    expect(body.locked).toBe(false);
  });
});
