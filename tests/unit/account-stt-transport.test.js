import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

const auth = vi.hoisted(() => ({
  getProviderCredentials: vi.fn(), markAccountUnavailable: vi.fn(),
  sleepStarted: null,
}));
vi.mock("node:timers/promises", async importOriginal => {
  const timers = await importOriginal();
  return { ...timers, setTimeout: (...args) => { auth.sleepStarted?.(); return timers.setTimeout(...args); } };
});
vi.mock("@/sse/services/auth.js", () => ({
  ...auth, extractApiKey: () => null, isValidApiKey: async () => true,
}));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => ({}), isApiKeyRequired: () => false }));
vi.mock("@/sse/services/model.js", () => ({ getModelInfo: async () => ({ provider: "openai", model: "whisper-1" }) }));
vi.mock("@/lib/rateLimit/inferenceLimit.js", () => ({ withInferenceLimit: (_request, _key, run) => run() }));
vi.mock("@/sse/utils/logger.js", () => ({ request() {}, info() {}, warn() {}, error() {} }));

const nativeFetch = globalThis.fetch;
const NativeFormData = globalThis.FormData;
const NativeFile = globalThis.File;
const NativeRequest = globalThis.Request;
const NativeResponse = globalThis.Response;
const stateKeys = [Symbol.for("kitsunerouter.proxy-fetch.v1"), Symbol.for("kitsunerouter.upstream-transport.v1")];
const proxyEnv = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"];
const audio = Uint8Array.of(0, 1, 128, 255);
let previousStates;
let servers;
let proxyModule;
let handleSttCore;
let handleStt;
let direct;
let directHits;

async function listen(respond) {
  const server = createServer(respond);
  servers.push(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("fetch", nativeFetch);
  for (const key of proxyEnv) vi.stubEnv(key, "");
  previousStates = new Map(stateKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of stateKeys) delete globalThis[key];
  servers = [];
  directHits = 0;
  direct = await listen((_request, response) => { directHits++; response.writeHead(500); response.end("Direct egress trap"); });
  ({ handleSttCore } = await import("../../open-sse/handlers/sttCore.js"));
  ({ handleStt } = await import("../../src/sse/handlers/stt.js"));
  proxyModule = await import("../../open-sse/utils/proxyFetch.js");
  auth.getProviderCredentials.mockReset();
  auth.markAccountUnavailable.mockReset().mockResolvedValue({ shouldFallback: true });
  auth.sleepStarted = null;
});

afterEach(async () => {
  await proxyModule?.closeUpstreamPools();
  for (const server of servers) server.closeAllConnections();
  await Promise.all(servers.filter(server => server.listening).map(server => new Promise(resolve => server.close(resolve))));
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const key of stateKeys) {
    const previous = previousStates.get(key);
    if (previous) Object.defineProperty(globalThis, key, previous);
    else delete globalThis[key];
  }
});

function inputForm() {
  const form = new NativeFormData();
  form.set("model", "openai/whisper-1");
  form.set("file", new NativeFile([audio], "speech.wav", { type: "audio/wav" }));
  form.set("language", "id");
  return form;
}

function credentials(policy = {}) {
  return { connectionId: "stt-fixture-account", apiKey: "synthetic-stt-credential", providerSpecificData: policy };
}

function core(format, policy, signal = null) {
  return handleSttCore({
    provider: "offline", model: "fixture-transcriber", formData: inputForm(), signal,
    credentials: credentials(policy),
    sttConfig: { baseUrl: `${direct}/transcribe`, authType: "bearer", authHeader: "bearer", format },
  });
}

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function json(response, value) {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

describe("account STT routing policy", () => {
  it.each(["openai", "nvidia-asr", "deepgram", "huggingface-asr", "gemini-stt"])("keeps %s requests on the selected relay with exact audio and no direct egress", async format => {
    const requests = [];
    const relay = await listen(async (request, response) => {
      requests.push({ headers: request.headers, bytes: await body(request) });
      if (format === "deepgram") return json(response, { results: { channels: [{ alternatives: [{ transcript: "relay transcript" }] }] } });
      if (format === "gemini-stt") return json(response, { candidates: [{ content: { parts: [{ text: "relay transcript" }] } }] });
      return json(response, { text: "relay transcript" });
    });
    const result = await core(format, { vercelRelayUrl: relay, strictProxy: true });
    expect(result.success).toBe(true);
    expect(await result.response.json()).toEqual({ text: "relay transcript" });
    expect(directHits).toBe(0);
    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request.headers["x-relay-target"]).toBe(direct);
    if (format === "openai" || format === "nvidia-asr") {
      expect(request.headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
      const multipart = await new NativeResponse(request.bytes, { headers: { "content-type": request.headers["content-type"] } }).formData();
      const file = multipart.get("file");
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(audio);
      expect(file.name).toBe("speech.wav");
      expect(file.type).toBe("audio/wav");
      expect(multipart.get("model")).toBe("fixture-transcriber");
      expect(request.headers.authorization).toBe("Bearer synthetic-stt-credential");
    } else if (format === "gemini-stt") {
      const content = JSON.parse(request.bytes).contents[0].parts;
      expect(content[1]).toEqual({ inline_data: { mime_type: "audio/wav", data: Buffer.from(audio).toString("base64") } });
      expect(request.headers["x-relay-path"]).toContain("/fixture-transcriber:generateContent?key=synthetic-stt-credential");
    } else {
      expect(new Uint8Array(request.bytes)).toEqual(audio);
      expect(request.headers["content-type"]).toBe("audio/wav");
      expect(request.headers.authorization).toBe("Bearer synthetic-stt-credential");
    }
  });

  it("uses the same selected relay for AssemblyAI upload, submit and poll", async () => {
    const requests = [];
    const relay = await listen(async (request, response) => {
      const bytes = await body(request);
      requests.push({ headers: request.headers, method: request.method, bytes });
      const path = request.headers["x-relay-path"];
      if (path === "/v2/upload") return json(response, { upload_url: "https://storage.example.test/audio-fixture" });
      if (request.method === "POST") return json(response, { id: "transcript-fixture" });
      return json(response, { status: "completed", text: "relay transcript" });
    });
    const result = await core("assemblyai", { vercelRelayUrl: relay, strictProxy: true });
    expect(result.success).toBe(true);
    expect(await result.response.json()).toEqual({ text: "relay transcript" });
    expect(directHits).toBe(0);
    expect(requests.map(request => [request.method, request.headers["x-relay-target"], request.headers["x-relay-path"]])).toEqual([
      ["POST", "https://api.assemblyai.com", "/v2/upload"],
      ["POST", direct, "/transcribe"],
      ["GET", direct, "/transcribe/transcript-fixture"],
    ]);
    expect(new Uint8Array(requests[0].bytes)).toEqual(audio);
    expect(JSON.parse(requests[1].bytes)).toEqual({ audio_url: "https://storage.example.test/audio-fixture", speech_models: ["fixture-transcriber"], language_detection: true });
    for (const request of requests) expect(request.headers.authorization).toBe("Bearer synthetic-stt-credential");
  });

  it("fails locally when strict routing has no usable proxy and never contacts the direct target", async () => {
    const result = await core("openai", { strictProxy: true });
    expect(result).toMatchObject({ success: false, status: 502, localFailure: true });
    expect(directHits).toBe(0);
  });

  it("does not fall back to direct egress when the selected relay fails", async () => {
    const relay = await listen((_request, response) => { response.destroy(); });
    const result = await core("deepgram", { vercelRelayUrl: relay, strictProxy: true });
    expect(result).toMatchObject({ success: false, status: 502, localFailure: true });
    expect(directHits).toBe(0);
  });

  it("aborts AssemblyAI's poll wait without sending another request", async () => {
    const controller = new AbortController();
    let submitted;
    const submission = new Promise(resolve => { submitted = resolve; });
    let sleeping;
    const pollWait = new Promise(resolve => { sleeping = resolve; });
    auth.sleepStarted = sleeping;
    const requests = [];
    const relay = await listen(async (request, response) => {
      await body(request);
      requests.push(request.headers["x-relay-path"]);
      if (requests.length === 1) return json(response, { upload_url: "https://storage.example.test/audio-fixture" });
      json(response, { id: "transcript-fixture" });
      submitted();
    });
    const running = core("assemblyai", { vercelRelayUrl: relay, strictProxy: true }, controller.signal);
    await submission;
    await pollWait;
    controller.abort(new Error("caller stopped transcription"));
    let timer;
    try {
      const result = await Promise.race([running, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Cancellation did not interrupt the poll wait")), 1000);
      })]);
      expect(result).toMatchObject({ success: false, status: 499 });
    } finally { clearTimeout(timer); }
    expect(requests).toHaveLength(2);
    expect(directHits).toBe(0);
  });
});

describe("STT application cancellation and account health", () => {
  const request = signal => new NativeRequest("http://localhost/v1/audio/transcriptions", { method: "POST", body: inputForm(), signal });

  it("does not mark accounts unavailable or select a fallback for a local routing failure", async () => {
    auth.getProviderCredentials.mockResolvedValue(credentials({ strictProxy: true, baseUrl: `${direct}/transcribe` }));
    const response = await handleStt(request());
    expect(response.status).toBe(502);
    expect(auth.getProviderCredentials).toHaveBeenCalledTimes(1);
    expect(auth.markAccountUnavailable).not.toHaveBeenCalled();
    expect(directHits).toBe(0);
  });

  it("stops an in-flight relay request on caller abort without account health changes or fallback", async () => {
    let reached;
    const incoming = new Promise(resolve => { reached = resolve; });
    let closed = false;
    const relay = await listen(async (httpRequest, response) => {
      response.once("close", () => { closed = true; });
      await body(httpRequest); reached();
    });
    auth.getProviderCredentials.mockResolvedValue(credentials({ vercelRelayUrl: relay, strictProxy: true, baseUrl: `${direct}/transcribe` }));
    const controller = new AbortController();
    const running = handleStt(request(controller.signal));
    await incoming;
    controller.abort(new Error("caller stopped transcription"));
    expect((await running).status).toBe(499);
    await vi.waitFor(() => expect(closed).toBe(true));
    expect(auth.getProviderCredentials).toHaveBeenCalledTimes(1);
    expect(auth.markAccountUnavailable).not.toHaveBeenCalled();
    expect(directHits).toBe(0);
  });

  it("does not select credentials for an already-aborted request", async () => {
    const controller = new AbortController();
    controller.abort(new Error("caller left before dispatch"));
    expect((await handleStt(request(controller.signal))).status).toBe(499);
    expect(auth.getProviderCredentials).not.toHaveBeenCalled();
    expect(auth.markAccountUnavailable).not.toHaveBeenCalled();
    expect(directHits).toBe(0);
  });
});
