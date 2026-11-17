import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

const state = vi.hoisted(() => ({
  nativeFetch: globalThis.fetch,
  credentials: null,
  secondCredentials: null,
  executor: null,
  getProviderCredentials: vi.fn(),
  markAccountUnavailable: vi.fn(),
  clearAccountError: vi.fn(),
  checkAndRefreshToken: vi.fn(),
  updateProviderCredentials: vi.fn(),
  enqueueRequestUsage: vi.fn(),
  refreshCredentials: vi.fn(),
}));

vi.mock("open-sse/executors/index.js", () => ({ getExecutor: () => state.executor }));
vi.mock("@/sse/services/auth.js", () => ({
  extractApiKey: () => null,
  isValidApiKey: async () => true,
  getProviderCredentials: state.getProviderCredentials,
  markAccountUnavailable: state.markAccountUnavailable,
  clearAccountError: state.clearAccountError,
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: state.checkAndRefreshToken,
  updateProviderCredentials: state.updateProviderCredentials,
}));
vi.mock("@/sse/services/model.js", () => ({
  getModelInfo: async route => ({ provider: "codex", model: route.split("/").slice(1).join("/") }),
  getComboModels: async () => null,
}));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => ({}), isApiKeyRequired: () => false }));
vi.mock("@/lib/usageDb.js", () => ({ enqueueRequestUsage: state.enqueueRequestUsage }));
vi.mock("@/sse/utils/logger.js", () => ({ request() {}, debug() {}, info() {}, warn() {}, error() {} }));

import { handleImageGenerationCore } from "open-sse/handlers/imageGenerationCore.js";
import { handleImageGeneration } from "@/sse/handlers/imageGeneration.js";

const servers = [];
const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQWQAAAAASUVORK5CYII=";
const responseBody = {
  created: 1794888000,
  data: [{ b64_json: image, generation_id: "synthetic-native-generation-1" }],
};
let unexpectedEgress;

const invoke = (model = "gpt-image-2", extra = {}) => handleImageGenerationCore({
  body: { prompt: "Draw one red square", n: 1, output_format: "png" },
  modelInfo: { provider: "codex", model },
  credentials: state.credentials,
  ...extra,
});

beforeEach(() => {
  unexpectedEgress = [];
  for (const value of Object.values(state)) if (vi.isMockFunction(value)) value.mockReset();
  state.credentials = {
    connectionId: "synthetic-codex-native-account",
    accessToken: "synthetic-codex-native-access-token",
    providerSpecificData: { chatgptAccountId: "synthetic-codex-native-workspace" },
  };
  state.secondCredentials = {
    connectionId: "synthetic-codex-other-account",
    accessToken: "synthetic-codex-other-access-token",
    providerSpecificData: { chatgptAccountId: "synthetic-codex-other-workspace" },
  };
  let selection = 0;
  state.getProviderCredentials.mockImplementation(async () => [state.credentials, state.secondCredentials, null][selection++]);
  state.checkAndRefreshToken.mockImplementation(async (_provider, credentials) => credentials);
  state.markAccountUnavailable.mockResolvedValue({ shouldFallback: true });
  state.refreshCredentials.mockResolvedValue(null);
  state.enqueueRequestUsage.mockResolvedValue({ accepted: true });
  state.executor = { refreshCredentials: state.refreshCredentials };
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(key, "");
  vi.stubEnv("DISABLE_MITM_BYPASS", "1");
  vi.stubGlobal("fetch", (url, init) => {
    if (new URL(String(url)).hostname !== "127.0.0.1") {
      unexpectedEgress.push(String(url));
      throw new Error("Unexpected non-fixture Codex image request");
    }
    return state.nativeFetch(url, init);
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

async function relay(handler = (_request, response) => response.end(JSON.stringify(responseBody))) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const received = {
      method: request.method,
      path: request.headers["x-relay-path"],
      target: request.headers["x-relay-target"],
      headers: request.headers,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    };
    requests.push(received);
    response.setHeader("content-type", "application/json");
    handler(received, response, requests);
  });
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const policy = { strictProxy: true, vercelRelayUrl: `http://127.0.0.1:${server.address().port}` };
  Object.assign(state.credentials.providerSpecificData, policy);
  Object.assign(state.secondCredentials.providerSpecificData, policy);
  return { requests, server };
}

describe("Codex native Images API rather than a guessed text-model Responses request", () => {
  it.each([false, 0, ""])("rejects an explicitly supplied invalid singular reference (%s) before submission", async supplied => {
    const route = await relay();
    const onUsage = vi.fn(), onRequestSuccess = vi.fn(), onCredentialsRefreshed = vi.fn();
    const result = await invoke("gpt-image-2", {
      body: { prompt: "Edit the supplied reference", image: supplied },
      onUsage, onRequestSuccess, onCredentialsRefreshed,
    });
    expect(result).toMatchObject({ success: false, status: 400 });
    expect((await result.response.json()).error.message).toContain("Invalid reference image");
    expect(route.requests).toEqual([]);
    expect(state.refreshCredentials).not.toHaveBeenCalled();
    expect(onCredentialsRefreshed).not.toHaveBeenCalled();
    expect(onUsage).not.toHaveBeenCalled();
    expect(onRequestSuccess).not.toHaveBeenCalled();
    expect(unexpectedEgress).toEqual([]);
  });

  it.each([["frame_count", 16], ["frame_duration_ms", 200]])("rejects unsupported explicit GIF control %s rather than silently using a default", async (control, value) => {
    const route = await relay();
    const onUsage = vi.fn(), onRequestSuccess = vi.fn(), onCredentialsRefreshed = vi.fn();
    const result = await invoke("gpt-image-2", {
      body: { prompt: "Synthetic animated image", output_format: "gif", [control]: value },
      onUsage, onRequestSuccess, onCredentialsRefreshed,
    });
    expect(result).toMatchObject({ success: false, status: 400 });
    expect((await result.response.json()).error.message).toContain(`Unsupported upstream image control: ${control}`);
    expect(route.requests).toEqual([]);
    expect(state.refreshCredentials).not.toHaveBeenCalled();
    expect(onCredentialsRefreshed).not.toHaveBeenCalled();
    expect(onUsage).not.toHaveBeenCalled();
    expect(onRequestSuccess).not.toHaveBeenCalled();
    expect(unexpectedEgress).toEqual([]);
  });

  it.each([null, undefined])("keeps omitted/null singular references and GIF controls optional (%s)", async supplied => {
    const route = await relay();
    const result = await invoke("gpt-image-2", {
      body: { prompt: "Generate an image", image: supplied, frame_count: supplied, frame_duration_ms: supplied },
    });
    expect(result.success).toBe(true);
    expect(route.requests).toHaveLength(1);
    expect(route.requests[0].path).toBe("/backend-api/codex/images/generations");
    expect(route.requests[0].body).toEqual({ model: "gpt-image-2", prompt: "Generate an image", n: 1 });
  });

  it.each(["gpt-image-2", "gpt-5.5-image", "gpt-5.4-image", "gpt-5.3-image"])("sends %s to the image model through one account relay", async model => {
    const route = await relay();
    const onUsage = vi.fn();
    const onRequestSuccess = vi.fn();
    const result = await invoke(model, {
      body: { prompt: "Draw one red square", n: 1, size: "1024x1536", quality: "high", background: "transparent", output_format: "png" },
      onUsage, onRequestSuccess,
    });
    expect(result.success).toBe(true);
    expect(await result.response.json()).toEqual(responseBody);
    expect(route.requests).toHaveLength(1);
    expect(route.requests[0]).toMatchObject({
      method: "POST", target: "https://chatgpt.com", path: "/backend-api/codex/images/generations",
      headers: { authorization: "Bearer synthetic-codex-native-access-token", "chatgpt-account-id": "synthetic-codex-native-workspace" },
    });
    expect(route.requests[0].body).toEqual({
      model: "gpt-image-2", prompt: "Draw one red square", n: 1,
      size: "1024x1536", quality: "high", background: "transparent", output_format: "png",
    });
    expect(onRequestSuccess).toHaveBeenCalledOnce();
    expect(onUsage).not.toHaveBeenCalled();
    expect(state.refreshCredentials).not.toHaveBeenCalled();
    expect(unexpectedEgress).toEqual([]);
  });

  it("uses JSON image references for edits without losing order or silently generating instead", async () => {
    const route = await relay();
    const first = `data:image/png;base64,${image}`;
    const second = `data:image/png;base64,${Buffer.from("synthetic-second-reference").toString("base64")}`;
    const result = await invoke("gpt-5.5-image", {
      body: { prompt: "Keep the first image and use the second as a palette", images: [first, second], n: 1, output_format: "png" },
    });
    expect(result.success).toBe(true);
    expect(await result.response.json()).toEqual(responseBody);
    expect(route.requests).toHaveLength(1);
    expect(route.requests[0].path).toBe("/backend-api/codex/images/edits");
    expect(route.requests[0].body).toEqual({
      model: "gpt-image-2", prompt: "Keep the first image and use the second as a palette",
      images: [{ image_url: first }, { image_url: second }], n: 1, output_format: "png",
    });
    expect(unexpectedEgress).toEqual([]);
  });

  it("also routes a singular inline image to the native edits endpoint", async () => {
    const route = await relay();
    const reference = `data:image/png;base64,${image}`;
    const result = await invoke("gpt-image-2", { body: { prompt: "Make this square blue", image: reference } });
    expect(result.success).toBe(true);
    expect(route.requests).toHaveLength(1);
    expect(route.requests[0].path).toBe("/backend-api/codex/images/edits");
    expect(route.requests[0].body.images).toEqual([{ image_url: reference }]);
    expect(route.requests[0].body).not.toHaveProperty("tools");
    expect(route.requests[0].body).not.toHaveProperty("instructions");
    expect(route.requests[0].body).not.toHaveProperty("stream");
  });

  it("retains every native result and generation ID instead of returning only the first image", async () => {
    const payload = { ...responseBody, data: [...responseBody.data, { b64_json: image, generation_id: "synthetic-native-generation-2" }] };
    const route = await relay((_request, response) => response.end(JSON.stringify(payload)));
    const result = await invoke("gpt-image-2", { body: { prompt: "Two squares", n: 2 } });
    expect(result.success).toBe(true);
    expect(await result.response.json()).toEqual(payload);
    expect(route.requests[0].body.n).toBe(2);
    expect(route.requests).toHaveLength(1);
  });

  it("wraps a native JSON result in a client SSE done event without putting stream on the upstream wire", async () => {
    const route = await relay();
    const onRequestSuccess = vi.fn();
    const result = await invoke("gpt-5.5-image", { streamToClient: true, onRequestSuccess });
    expect(result.success).toBe(true);
    expect(result.response.headers.get("content-type")).toContain("text/event-stream");
    const text = await result.response.text();
    const done = text.split(/\r?\n\r?\n/).find(frame => /^event: done$/m.test(frame));
    expect(done).toBeTruthy();
    const dataLine = done.split(/\r?\n/).find(line => line.startsWith("data: "));
    expect(JSON.parse(dataLine.slice(6))).toEqual(responseBody);
    expect(text).not.toContain("event: error");
    expect(onRequestSuccess).toHaveBeenCalledOnce();
    expect(route.requests).toHaveLength(1);
    expect(route.requests[0].path).toBe("/backend-api/codex/images/generations");
    expect(route.requests[0].body).not.toHaveProperty("stream");
  });

  it("accepts exact native usage once without replacing it with an image/token estimate", async () => {
    const usage = { input_tokens: 7, output_tokens: 11, total_tokens: 18 };
    const route = await relay((_request, response) => response.end(JSON.stringify({ ...responseBody, usage })));
    const onUsage = vi.fn();
    const result = await invoke("gpt-image-2", { onUsage });
    expect(result.success).toBe(true);
    await result.response.json();
    expect(onUsage).toHaveBeenCalledOnce();
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ prompt_tokens: 7, completion_tokens: 11, total_tokens: 18 }), { status: "success" });
    expect(route.requests).toHaveLength(1);
  });

  it("returns the actual generated binary bytes when the caller requests binary output", async () => {
    await relay();
    const result = await invoke("gpt-image-2", { binaryOutput: true });
    expect(result.success).toBe(true);
    expect(result.response.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await result.response.arrayBuffer())).toEqual(Buffer.from(image, "base64"));
  });

  it("does not submit after the caller has already cancelled", async () => {
    const route = await relay();
    const caller = new AbortController();
    caller.abort(new Error("synthetic image caller left"));
    const result = await invoke("gpt-image-2", { clientSignal: caller.signal });
    expect(result).toMatchObject({ success: false, status: 499 });
    expect(route.requests).toEqual([]);
  });

  it("closes a pending native JSON body on caller abort without another paid submission", async () => {
    const caller = new AbortController();
    let received;
    const started = new Promise(resolve => { received = resolve; });
    let closed;
    const disconnected = new Promise(resolve => { closed = resolve; });
    const route = await relay((_request, response) => {
      response.on("close", closed);
      response.flushHeaders();
      response.write('{"created":1794888000,"data":[');
      received();
    });
    const pending = invoke("gpt-image-2", { clientSignal: caller.signal });
    await started;
    caller.abort(new Error("synthetic image caller disconnected"));
    expect(await pending).toMatchObject({ success: false, status: 499 });
    let timer;
    try {
      await Promise.race([disconnected, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Pending native image response did not close")), 1000); })]);
    } finally { clearTimeout(timer); }
    expect(route.requests).toHaveLength(1);
    expect(state.refreshCredentials).not.toHaveBeenCalled();
    expect(unexpectedEgress).toEqual([]);
  });

  it("does not count an accepted but empty image response as success or replay it", async () => {
    const route = await relay((_request, response) => response.end('{"created":1794888000,"data":[]}'));
    const onRequestSuccess = vi.fn();
    const result = await invoke("gpt-image-2", { onRequestSuccess });
    expect(result).toMatchObject({ success: false, status: 502, allowAccountFallback: false });
    expect(onRequestSuccess).not.toHaveBeenCalled();
    expect(route.requests).toHaveLength(1);
    expect(state.refreshCredentials).not.toHaveBeenCalled();
  });
});

describe("Codex model and entitlement errors stay terminal on the public image route", () => {
  it.each([
    { status: 400, publicStatus: 400, code: "model_not_supported", publicCode: "model_not_supported", message: "The gpt-image-2 model is not supported for this ChatGPT account." },
    { status: 403, publicStatus: 403, code: "model_access_denied", publicCode: "model_access_denied", message: "This account is not enabled for image generation." },
    { status: 403, publicStatus: 429, code: "insufficient_quota", publicCode: "rate_limit_exceeded", message: "The image quota is exhausted." },
  ])("preserves $code without refreshing, switching model or choosing another account", async error => {
    // If the forbidden refresh path runs, return immediately so its extra
    // image submission is observed instead of timing out in refresh backoff.
    state.refreshCredentials.mockResolvedValue({ accessToken: "synthetic-refreshed-codex-access-token" });
    const route = await relay((_request, response) => {
      response.statusCode = error.status;
      response.end(JSON.stringify({ error: { type: "invalid_request_error", code: error.code, message: error.message } }));
    });
    const caller = new AbortController();
    const pending = handleImageGeneration(new Request("http://localhost/v1/images/generations", {
      method: "POST", signal: caller.signal,
      body: JSON.stringify({ model: "cx/gpt-5.5-image", prompt: "Draw one red square" }),
    }));
    try {
      const response = await pending;
      expect(response.status).toBe(error.publicStatus);
      const payload = await response.json();
      expect(payload.error.message).toContain(error.message);
      expect(payload.error.code).toBe(error.publicCode);
      expect(response.headers.get("x-should-retry")).toBe("false");
      expect(state.getProviderCredentials).toHaveBeenCalledOnce();
      expect(state.refreshCredentials).not.toHaveBeenCalled();
      expect(route.requests).toHaveLength(1);
      expect(route.requests[0].path).toBe("/backend-api/codex/images/generations");
      expect(route.requests[0].body.model).toBe("gpt-image-2");
      expect(state.clearAccountError).not.toHaveBeenCalled();
      expect(state.enqueueRequestUsage).not.toHaveBeenCalled();
      expect(unexpectedEgress).toEqual([]);
    } finally {
      caller.abort(new Error("Synthetic image fixture cleanup"));
      await pending.catch(() => {});
    }
  });
});
