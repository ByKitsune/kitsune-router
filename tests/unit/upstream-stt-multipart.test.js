import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import edgePrimitives from "next/dist/compiled/@edge-runtime/primitives/fetch.js";
import { fetch as undiciFetch, Response as UndiciResponse } from "undici/index.js";

const NativeFormData = globalThis.FormData;
const NativeFile = globalThis.File;
const nativeFetch = globalThis.fetch;
const fetchStateKey = Symbol.for("kitsunerouter.proxy-fetch.v1");
const transportStateKey = Symbol.for("kitsunerouter.upstream-transport.v1");
const audio = Uint8Array.of(0, 1, 2, 127, 128, 255);
let server;
let origin;
let requests;
let proxyModule;
let previousFetchState;
let previousTransportState;
let handleSttCore;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("fetch", nativeFetch);
  previousFetchState = Object.getOwnPropertyDescriptor(globalThis, fetchStateKey);
  previousTransportState = Object.getOwnPropertyDescriptor(globalThis, transportStateKey);
  delete globalThis[fetchStateKey];
  delete globalThis[transportStateKey];
  requests = [];
  server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push({ headers: request.headers, body: Buffer.concat(chunks) });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ text: "transcribed fixture" }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  ({ handleSttCore } = await import("../../open-sse/handlers/sttCore.js"));
  proxyModule = await import("../../open-sse/utils/proxyFetch.js");
});

afterEach(async () => {
  await proxyModule?.closeUpstreamPools();
  proxyModule = null;
  server?.closeAllConnections();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  vi.unstubAllGlobals();
  if (previousFetchState) Object.defineProperty(globalThis, fetchStateKey, previousFetchState);
  else delete globalThis[fetchStateKey];
  if (previousTransportState) Object.defineProperty(globalThis, transportStateKey, previousTransportState);
  else delete globalThis[transportStateKey];
});

function inputForm() {
  const form = new NativeFormData();
  form.set("file", new NativeFile([audio], "speech-ä.wav", { type: "audio/wav" }));
  form.set("language", "id");
  form.set("prompt", "Keep the supplied prompt.");
  form.set("response_format", "verbose_json");
  form.set("temperature", "0");
  return form;
}

const transcribe = (format, formData = inputForm()) => handleSttCore({
  provider: "offline", model: "fixture-transcriber", formData,
  credentials: { apiKey: "synthetic-stt-fixture" },
  sttConfig: { format, authType: "bearer", authHeader: "bearer", baseUrl: origin },
});

async function expectMultipart(request, format) {
  expect(request.headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
  expect(request.headers.authorization).toBe("Bearer synthetic-stt-fixture");
  const form = await new UndiciResponse(request.body, { headers: { "content-type": request.headers["content-type"] } }).formData();
  expect(form.get("model")).toBe("fixture-transcriber");
  const file = form.get("file");
  expect(file.name).toBe("speech-ä.wav");
  expect(file.type).toBe("audio/wav");
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(audio);
  if (format === "openai") {
    expect(form.get("language")).toBe("id");
    expect(form.get("prompt")).toBe("Keep the supplied prompt.");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.get("temperature")).toBe("0");
  }
}

describe.each(["openai", "nvidia-asr"])("%s STT multipart on real HTTP transports", format => {
  it("keeps native FormData working through the Kitsune native-fetch proxy wrapper", async () => {
    proxyModule = await import("../../open-sse/utils/proxyFetch.js");
    const result = await transcribe(format);
    expect(result.success).toBe(true);
    expect(await result.response.json()).toEqual({ text: "transcribed fixture" });
    expect(requests).toHaveLength(1);
    await expectMultipart(requests[0], format);
  });

  it("serializes the actual Next FormData implementation through the native-fetch proxy wrapper", async () => {
    proxyModule = await import("../../open-sse/utils/proxyFetch.js");
    vi.stubGlobal("FormData", edgePrimitives.FormData);
    const result = await transcribe(format);
    expect(result.success).toBe(true);
    expect(requests).toHaveLength(1);
    await expectMultipart(requests[0], format);
  });

  it("keeps multipart boundaries when the fetch transport comes from package undici", async () => {
    vi.stubGlobal("fetch", undiciFetch);
    const result = await transcribe(format);
    expect(result.success).toBe(true);
    expect(requests).toHaveLength(1);
    await expectMultipart(requests[0], format);
  });
});

it("creates a fresh multipart stream for each account attempt using the same incoming file", async () => {
  proxyModule = await import("../../open-sse/utils/proxyFetch.js");
  vi.stubGlobal("FormData", edgePrimitives.FormData);
  const form = inputForm();
  for (let attempt = 0; attempt < 2; attempt++) expect((await transcribe("openai", form)).success).toBe(true);
  expect(requests).toHaveLength(2);
  for (const request of requests) await expectMultipart(request, "openai");
});
