import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { constants, zstdCompressSync } from "node:zlib";

// Keep the inbound handler, parser, error formatting, correlation and limiter
// real. Storage/provider boundaries cannot read local state or send traffic.
const fixture = vi.hoisted(() => ({
  settings: {},
  settingsReads: 0,
  validate: vi.fn(),
  select: vi.fn(),
  health: vi.fn(),
  dispatch: vi.fn(),
  combos: vi.fn(),
  modelInfo: vi.fn(),
  zstdAvailable: true,
  decoders: [],
  decoderWrites: 0,
}));
vi.mock("node:zlib", async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    get createZstdDecompress() {
      if (!fixture.zstdAvailable) return undefined;
      return options => {
        const decoder = actual.createZstdDecompress(options);
        const write = decoder.write;
        decoder.write = function (...args) { fixture.decoderWrites++; return write.apply(this, args); };
        fixture.decoders.push(decoder);
        return decoder;
      };
    },
  };
});
vi.mock("open-sse/index.js", () => ({}));
vi.mock("@/lib/localDb", () => ({
  getSettings: async () => { fixture.settingsReads++; return fixture.settings; },
  isApiKeyRequired: settings => settings.requireApiKey === true,
}));
vi.mock("@/sse/services/auth.js", () => ({
  extractApiKey: request => request.headers.get("authorization")?.replace(/^Bearer /, "") || request.headers.get("x-api-key") || null,
  isValidApiKey: fixture.validate,
  getProviderCredentials: fixture.select,
  markAccountUnavailable: fixture.health,
  clearAccountError: vi.fn(),
}));
vi.mock("@/sse/services/model.js", () => ({
  getComboModels: fixture.combos,
  getModelInfo: fixture.modelInfo,
  resolveModelCapabilities: async () => new Map(),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledByProvider: async () => [] }));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: async (_provider, credentials) => credentials,
  updateProviderCredentials: vi.fn(),
}));
vi.mock("@/sse/services/antigravityQuota.js", () => ({
  handleAntigravityQuotaError: vi.fn(), clearAntigravityStrikes: vi.fn(),
}));
vi.mock("open-sse/services/projectId.js", () => ({ getProjectIdForConnection: vi.fn() }));
vi.mock("open-sse/handlers/chatCore.js", () => ({ handleChatCore: fixture.dispatch }));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: async () => null }));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent() {} }));
vi.mock("@/sse/utils/logger.js", () => ({
  debug() {}, info() {}, warn() {}, error() {}, errorLine() {}, maskKey: () => "offline",
}));

import { handleChat } from "../../src/sse/handlers/chat.js";
import { consume, rateLimitKey, resetRateLimiter, RATE_LIMIT_BURST } from "../../src/lib/rateLimit/v1Limiter.js";

function request(body, encoding, { path = "/v1/responses", headers = {}, signal } = {}) {
  return new Request(`http://localhost${path}`, {
    method: "POST", body, signal, duplex: "half",
    headers: { "content-type": "application/json", ...(encoding ? { "content-encoding": encoding } : {}), ...headers },
  });
}

function unreadBody() {
  let reads = 0;
  const stream = new ReadableStream({
    pull(controller) { reads++; controller.enqueue(Buffer.from("broken")); controller.close(); },
  }, { highWaterMark: 0 });
  return { stream, reads: () => reads };
}

async function expectError(response, status, code) {
  expect(response.status).toBe(status);
  expect(response.headers.get("x-request-id")).toBeTruthy();
  const payload = await response.json();
  expect(payload).toMatchObject({ error: { type: "invalid_request_error", code } });
  expect(fixture.select).not.toHaveBeenCalled();
  expect(fixture.dispatch).not.toHaveBeenCalled();
  expect(fixture.health).not.toHaveBeenCalled();
  return payload;
}

beforeEach(() => {
  resetRateLimiter();
  vi.clearAllMocks();
  fixture.settings = { requireApiKey: false };
  fixture.settingsReads = 0;
  fixture.zstdAvailable = true;
  fixture.decoders = [];
  fixture.decoderWrites = 0;
  fixture.validate.mockResolvedValue(true);
  fixture.select.mockResolvedValue({ connectionId: "offline", apiKey: "fixture" });
  fixture.combos.mockResolvedValue(null);
  fixture.modelInfo.mockImplementation(async name => ({ provider: "codex", model: name.split("/").at(-1) }));
  fixture.dispatch.mockImplementation(async ({ body }) => ({ success: true, response: Response.json(body) }));
});

describe("shared chat fusion signal handoff", () => {
  it.each([false, true])("scopes each panel to its timeout while preserving caller metadata (late combo=%s)", async late => {
    const models = ["codex/panel-a", "codex/panel-b", "codex/straggler"];
    let lookups = 0;
    fixture.combos.mockImplementation(async name => name === "fusion-fixture" && (!late || ++lookups > 1) ? models : null);
    fixture.modelInfo.mockImplementation(async name => name === "fusion-fixture" ? { provider: null } : { provider: "codex", model: name.split("/").at(-1) });
    fixture.settings = { comboStrategy: "fusion", comboStrategies: { "fusion-fixture": {
      judgeModel: "codex/judge", fusionTuning: { minPanel: 2, stragglerGraceMs: 10, panelHardTimeoutMs: 300 },
    } } };
    let stragglerSignal;
    fixture.dispatch.mockImplementation(async ({ modelInfo, clientSignal }) => {
      if (modelInfo.model === "straggler") {
        stragglerSignal = clientSignal;
        return await new Promise(resolve => clientSignal.addEventListener("abort", () => resolve({
          success: false, status: 499, error: "client_aborted", response: Response.json({ error: { code: "client_aborted" } }, { status: 499 }),
        }), { once: true }));
      }
      return { success: true, response: Response.json({ choices: [{ message: { content: "offline answer" } }] }) };
    });
    const caller = new AbortController();
    const inbound = request(JSON.stringify({ model: "fusion-fixture", messages: [{ role: "user", content: "hello" }], max_tokens: 37 }), undefined, {
      path: "/v1/chat/completions", signal: caller.signal,
      headers: { authorization: "Bearer fusion-fixture", "x-connection-id": "pinned-fixture", "user-agent": "offline-agent" },
    });
    try {
      const response = await handleChat(inbound);
      expect(response.status).toBe(200);
      expect(stragglerSignal).not.toBe(inbound.signal);
      expect(stragglerSignal?.aborted).toBe(true);
      expect(inbound.signal.aborted).toBe(false);
      expect(fixture.select.mock.calls.every(([, , , options]) => options.preferredConnectionId === "pinned-fixture")).toBe(true);
      expect(fixture.dispatch.mock.calls.every(([options]) => options.userAgent === "offline-agent" && options.clientRawRequest.endpoint === "/v1/chat/completions")).toBe(true);
      expect(fixture.health).not.toHaveBeenCalled();
    } finally {
      caller.abort();
    }
  });

  it("passes caller cancellation to fusion rather than collapsing cancelled panels into 503", async () => {
    fixture.combos.mockImplementation(async name => name === "fusion-fixture" ? ["codex/panel-a", "codex/panel-b"] : null);
    fixture.settings = { comboStrategy: "fusion" };
    let started;
    const panelsStarted = new Promise(resolve => { started = resolve; });
    let panels = 0;
    fixture.dispatch.mockImplementation(async ({ clientSignal }) => {
      if (++panels === 2) started();
      return await new Promise(resolve => clientSignal.addEventListener("abort", () => resolve({
        success: false, status: 499, error: "client_aborted", response: Response.json({ error: { code: "client_aborted" } }, { status: 499 }),
      }), { once: true }));
    });
    const caller = new AbortController();
    const pending = handleChat(request('{"model":"fusion-fixture","messages":[]}', undefined, { signal: caller.signal }));
    await panelsStarted;
    caller.abort(new Error("caller left"));
    const response = await pending;
    expect(response.status).toBe(499);
    expect((await response.json()).error.code).toBe("client_aborted");
    expect(fixture.health).not.toHaveBeenCalled();
  });
});
afterEach(() => { vi.useRealTimers(); });

describe("G07 compressed JSON at the shared chat boundary", () => {
  it.each([[null], [[]], ["hello"], [0], [true]])("rejects non-object JSON before model access: %j", async value => {
    for (const encoding of [undefined, "zstd"]) {
      for (const path of ["/v1/responses", "/v1/chat/completions"]) {
        const text = JSON.stringify(value);
        const response = await handleChat(request(encoding ? zstdCompressSync(text) : text, encoding, { path }));
        const payload = await expectError(response, 400, "bad_request");
        expect(payload.error).toMatchObject({ param: "body", message: expect.stringContaining("object") });
      }
    }
  });

  it("authenticates before rejecting a non-object JSON body", async () => {
    fixture.settings.requireApiKey = true;
    const response = await handleChat(request("null"));
    expect(response.status).toBe(401);
    expect((await response.json()).error.message).toBe("Missing API key");
    expect(fixture.select).not.toHaveBeenCalled();
  });

  it("uses only the literal internal compact option, not URL inference or a truthy option", async () => {
    const text = '{"model":"codex/fixture","input":[]}';
    const ordinary = await handleChat(request(text, undefined, { path: "/v1/responses/compact" }));
    expect(await ordinary.json()).not.toHaveProperty("_compact");
    const truthy = await handleChat(request(text), null, undefined, { compact: "true" });
    expect(await truthy.json()).not.toHaveProperty("_compact");
    const compact = await handleChat(request(text), null, undefined, { compact: true });
    expect(await compact.json()).toMatchObject({ _compact: true });
  });

  it.each([undefined, "identity"])("retains ordinary %s JSON validation", async encoding => {
    const response = await handleChat(request("{}", encoding));
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe("Missing model");
  });

  it.each(["/v1/responses", "/v1/chat/completions", "/v1/messages"])("decodes real zstd before model validation at %s", async path => {
    const response = await handleChat(request(zstdCompressSync("{}"), " ZSTD ", { path }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe("Missing model");
    expect(fixture.select).not.toHaveBeenCalled();
  });

  it("retains typed media, literal JSON and explicit output caps without compression-specific rewrites", async () => {
    const body = {
      model: "codex/fixture", max_output_tokens: 37, stream: false,
      input: [{ role: "user", content: [{ type: "input_image", image_url: "data:image/png;base64,AAEC" }, { type: "input_text", text: '{"literal":"zstd"}' }] }],
    };
    const response = await handleChat(request(zstdCompressSync(JSON.stringify(body)), "zstd"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    expect(fixture.health).not.toHaveBeenCalled();
  });

  it.each([
    [null, "Missing API key"],
    ["Bearer rejected-fixture", "Invalid API key"],
  ])("rejects %s authentication before touching a compressed upload", async (authorization, message) => {
    fixture.settings.requireApiKey = true;
    fixture.validate.mockResolvedValue(false);
    const upload = unreadBody();
    const response = await handleChat(request(upload.stream, "zstd", { headers: authorization ? { authorization } : {} }));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatchObject({ type: "authentication_error", code: "invalid_api_key", message });
    expect(upload.reads()).toBe(0);
    expect(fixture.select).not.toHaveBeenCalled();
  });

  it("waits for key validation before consuming any upload bytes", async () => {
    fixture.settings.requireApiKey = true;
    let allow;
    fixture.validate.mockReturnValue(new Promise(resolve => { allow = resolve; }));
    const upload = unreadBody();
    const pending = handleChat(request(upload.stream, "zstd", { headers: { authorization: "Bearer pending-fixture" } }));
    await new Promise(resolve => setImmediate(resolve));
    const readsBeforeAuth = upload.reads();
    allow?.(true);
    await pending;
    expect(readsBeforeAuth).toBe(0);
    expect(fixture.validate).toHaveBeenCalledWith("pending-fixture");
  });

  it("applies the attributable rate bucket before reading/decompressing", async () => {
    for (let index = 0; index < RATE_LIMIT_BURST; index++) consume(rateLimitKey("limited-fixture"));
    const upload = unreadBody();
    const response = await handleChat(request(upload.stream, "zstd", { headers: { authorization: "Bearer limited-fixture" } }));
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("rate_limit_exceeded");
    expect(upload.reads()).toBe(0);
  });

  it.each(["gzip", "br", "deflate", "unknown", "zstd, identity", "zstd, zstd"])("returns an honest 415 for undeclared/stacked support: %s", async encoding => {
    const upload = unreadBody();
    await expectError(await handleChat(request(upload.stream, encoding)), 415, "unsupported_content_encoding");
    expect(upload.reads()).toBe(0);
  });

  it("distinguishes corrupted zstd from invalid decoded JSON", async () => {
    await expectError(await handleChat(request("broken", "zstd")), 400, "invalid_compressed_body");
    await expectError(await handleChat(request(zstdCompressSync("not JSON"), "zstd")), 400, "bad_request");
  });

  it("rejects a truncated real frame rather than accepting its partial JSON", async () => {
    const frame = zstdCompressSync("{}", { params: { [constants.ZSTD_c_checksumFlag]: 1 } });
    await expectError(await handleChat(request(frame.subarray(0, -1), "zstd")), 400, "invalid_compressed_body");
  });

  it("returns 415 without consuming a real frame when the runtime has no streaming zstd API", async () => {
    fixture.zstdAvailable = false;
    const frame = zstdCompressSync("{}");
    let reads = 0;
    const stream = new ReadableStream({
      pull(controller) { reads++; controller.enqueue(frame); controller.close(); },
    }, { highWaterMark: 0 });
    await expectError(await handleChat(request(stream, "zstd")), 415, "unsupported_content_encoding");
    expect(reads).toBe(0);
    expect(fixture.decoders).toHaveLength(0);
    const plain = await handleChat(request("{}"));
    expect((await plain.json()).error.message).toBe("Missing model");
  });

  it("refuses a hostile declared zstd workspace before handing bytes to the native decoder", async () => {
    // RFC 8878: ordinary frame, unknown content size, 3.75 TiB window, last raw
    // block containing valid JSON. Only the advertised workspace is excessive.
    const bytes = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0, 0xff, 0x11, 0, 0, 0x7b, 0x7d]);
    await expectError(await handleChat(request(bytes, "zstd")), 413, "request_body_too_large");
    expect(fixture.decoders).toHaveLength(1);
    expect(fixture.decoderWrites).toBe(0);
  });

  it("cancels an in-flight compressed reader and closes its native decoder on caller abort", async () => {
    const caller = new AbortController();
    const frame = zstdCompressSync("{}");
    let reading;
    const stalled = new Promise(resolve => { reading = resolve; });
    let reads = 0, cancellations = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (++reads === 1) controller.enqueue(frame.subarray(0, 6));
        else reading();
      },
      cancel() { cancellations++; return new Promise(() => {}); },
    }, { highWaterMark: 0 });
    const pending = handleChat(request(stream, "zstd", { signal: caller.signal }));
    await stalled;
    caller.abort(new Error("offline caller left mid-upload"));
    let watchdog;
    const result = await Promise.race([pending, new Promise(resolve => { watchdog = setTimeout(() => resolve(null), 500); })]);
    clearTimeout(watchdog);
    expect(result?.status).toBe(499);
    if (result) await expectError(result, 499, "client_aborted");
    await new Promise(resolve => setImmediate(resolve));
    expect(cancellations).toBe(1);
    expect(stream.locked).toBe(false);
    expect(fixture.decoders).toHaveLength(1);
    expect(fixture.decoders[0].destroyed).toBe(true);
    expect(fixture.decoders[0].closed).toBe(true);
  });

  it.each([undefined, "zstd"])("accepts a >2 MiB typed media body without unbounded Fetch methods (%s)", async encoding => {
    const body = { model: "codex/fixture", input: [{ type: "input_image", image_url: `data:image/png;base64,${"A".repeat(3 * 1024 * 1024)}` }], max_output_tokens: 31 };
    const inbound = request(encoding ? zstdCompressSync(JSON.stringify(body)) : JSON.stringify(body), encoding);
    const json = vi.spyOn(inbound, "json");
    const arrayBuffer = vi.spyOn(inbound, "arrayBuffer");
    const response = await handleChat(inbound);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    expect(json).not.toHaveBeenCalled();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects oversized declared wire length before reading", async () => {
    const upload = unreadBody();
    await expectError(await handleChat(request(upload.stream, "zstd", { headers: { "content-length": "33554433" } })), 413, "request_body_too_large");
    expect(upload.reads()).toBe(0);
  });

  it("bounds plain wire bytes even without Content-Length", async () => {
    let chunks = 0;
    const chunk = Buffer.alloc(1024 * 1024, 32);
    const stream = new ReadableStream({
      pull(controller) { chunks++; controller.enqueue(chunk); if (chunks === 34) controller.close(); },
    }, { highWaterMark: 0 });
    await expectError(await handleChat(request(stream)), 413, "request_body_too_large");
    expect(chunks).toBeLessThan(34);
    expect(stream.locked).toBe(false);
  });

  it("bounds expanded bytes for a real zstd decompression bomb", async () => {
    const expanded = Buffer.alloc(65 * 1024 * 1024, 32);
    expanded.write("{}");
    const frame = zstdCompressSync(expanded);
    expect(frame.byteLength).toBeLessThan(64 * 1024);
    await expectError(await handleChat(request(frame, "zstd")), 413, "request_body_too_large");
  });

  it("reports a pre-aborted caller as 499, not malformed JSON or account failure", async () => {
    const caller = new AbortController();
    caller.abort(new Error("offline caller cancelled"));
    const upload = unreadBody();
    await expectError(await handleChat(request(upload.stream, "zstd", { signal: caller.signal })), 499, "client_aborted");
    expect(upload.reads()).toBe(0);
  });

  it("does no auth/storage work for a caller already cancelled at entry", async () => {
    fixture.settings.requireApiKey = true;
    const upload = unreadBody();
    await expectError(await handleChat(request(upload.stream, "zstd", { signal: AbortSignal.abort(new Error("already cancelled")) })), 499, "client_aborted");
    expect(upload.reads()).toBe(0);
    expect(fixture.settingsReads).toBe(0);
    expect(fixture.validate).not.toHaveBeenCalled();
  });

  it("enforces a total body deadline even while an ordinary JSON stream is stalled", async () => {
    vi.useFakeTimers();
    let cancellations = 0;
    const stream = new ReadableStream({ cancel() { cancellations++; } }, { highWaterMark: 0 });
    const pending = handleChat(request(stream));
    await vi.advanceTimersByTimeAsync(30_001);
    const result = await Promise.race([pending, Promise.resolve(null)]);
    if (!result) await stream.cancel().catch(() => {});
    expect(result?.status).toBe(408);
    if (result) await expectError(result, 408, "request_body_timeout");
    expect(cancellations).toBe(1);
    expect(stream.locked).toBe(false);
  });

  it("keeps JSON-only synthetic callers usable for already materialized identity input", async () => {
    const response = await handleChat({
      url: "http://localhost/v1/responses", headers: new Headers(), json: async () => ({}),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe("Missing model");
  });
});
