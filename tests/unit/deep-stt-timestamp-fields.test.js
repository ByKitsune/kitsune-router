import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import edgePrimitives from "next/dist/compiled/@edge-runtime/primitives/fetch.js";
import { handleSttCore } from "open-sse/handlers/sttCore.js";
import { PROVIDER_MEDIA } from "open-sse/providers/index.js";

const state = vi.hoisted(() => ({ nativeFetch: globalThis.fetch }));
const NativeFormData = globalThis.FormData;
const NativeResponse = globalThis.Response;
const NativeFile = globalThis.File;
const audio = Uint8Array.of(0, 1, 2, 127, 128, 255);
const transcription = {
  text: "one word",
  language: "indonesian",
  duration: 0,
  words: [{ word: "one", start: 0, end: 0.25 }, { word: "word", start: 0.25, end: 0.5 }],
  segments: [{ id: 0, start: 0, end: 0.5, text: "one word" }],
};
let server;
let requests;
let relayPolicy;
let unexpectedEgress;

beforeEach(async () => {
  requests = [];
  unexpectedEgress = [];
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"]) vi.stubEnv(key, "");
  vi.stubEnv("DISABLE_MITM_BYPASS", "1");
  vi.stubGlobal("fetch", (url, init) => {
    if (new URL(String(url)).hostname !== "127.0.0.1") {
      unexpectedEgress.push(String(url));
      throw new Error("Unexpected non-fixture STT request");
    }
    return state.nativeFetch(url, init);
  });
  server = createServer(async (request, response) => {
    const pieces = [];
    for await (const piece of request) pieces.push(piece);
    requests.push({ headers: request.headers, body: Buffer.concat(pieces) });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(transcription));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  relayPolicy = { strictProxy: true, vercelRelayUrl: `http://127.0.0.1:${server.address().port}` };
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

function input(Form = NativeFormData) {
  const form = new Form();
  form.append("file", new NativeFile([audio], "speech-ä.wav", { type: "audio/wav" }));
  form.append("language", "id");
  form.append("prompt", "Keep both the supplied prompt and time offsets.");
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  return form;
}

const transcribe = (provider, formData, credentials = {}) => handleSttCore({
  provider,
  model: provider === "groq" ? "whisper-large-v3" : "whisper-1",
  formData,
  credentials: { apiKey: "synthetic-timestamp-token", providerSpecificData: relayPolicy, ...credentials },
  sttConfig: PROVIDER_MEDIA[provider].sttConfig,
});

async function receivedForm(index = 0) {
  const request = requests[index];
  expect(request.headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
  expect(request.headers.authorization).toBe("Bearer synthetic-timestamp-token");
  const form = await new NativeResponse(request.body, {
    headers: { "content-type": request.headers["content-type"] },
  }).formData();
  const file = form.get("file");
  expect(file.name).toBe("speech-ä.wav");
  expect(file.type).toBe("audio/wav");
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(audio);
  expect(form.get("language")).toBe("id");
  expect(form.get("prompt")).toBe("Keep both the supplied prompt and time offsets.");
  expect(form.get("response_format")).toBe("verbose_json");
  expect(form.get("temperature")).toBe("0");
  return form;
}

describe("OpenAI-compatible STT timestamp multipart fields", () => {
  it.each(["openai", "groq"])("forwards every repeated timestamp granularity to %s without replacing returned offsets", async provider => {
    const form = input();
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");
    const result = await transcribe(provider, form);
    expect(result.success, result.error).toBe(true);
    expect(await result.response.json()).toEqual(transcription);
    expect(requests).toHaveLength(1);
    const outgoing = await receivedForm();
    expect(outgoing.getAll("timestamp_granularities[]")).toEqual(["word", "segment"]);
    expect(outgoing.get("model")).toBe(provider === "groq" ? "whisper-large-v3" : "whisper-1");
    expect(unexpectedEgress).toEqual([]);
  });

  it("canonicalizes the common unbracketed alias into the upstream array field", async () => {
    const form = input();
    form.append("timestamp_granularities", "word");
    expect((await transcribe("groq", form)).success).toBe(true);
    const outgoing = await receivedForm();
    expect(outgoing.getAll("timestamp_granularities[]")).toEqual(["word"]);
    expect(outgoing.has("timestamp_granularities")).toBe(false);
    expect(form.getAll("timestamp_granularities")).toEqual(["word"]);
    expect(form.has("timestamp_granularities[]")).toBe(false);
  });

  it("retains original order when both accepted field spellings are repeated", async () => {
    const form = input();
    form.append("timestamp_granularities", "word");
    form.append("timestamp_granularities[]", "segment");
    form.append("timestamp_granularities", "word");
    expect((await transcribe("groq", form)).success).toBe(true);
    expect((await receivedForm()).getAll("timestamp_granularities[]")).toEqual(["word", "segment", "word"]);
  });

  it("retains repeated fields across the real Next FormData and package serializer boundary", async () => {
    vi.stubGlobal("FormData", edgePrimitives.FormData);
    const form = input(edgePrimitives.FormData);
    form.append("timestamp_granularities[]", "segment");
    form.append("timestamp_granularities[]", "word");
    expect((await transcribe("groq", form)).success).toBe(true);
    expect((await receivedForm()).getAll("timestamp_granularities[]")).toEqual(["segment", "word"]);
    expect(requests).toHaveLength(1);
  });

  it("rebuilds every account attempt without consuming or mutating the caller's array values", async () => {
    const form = input();
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");
    const initial = [...form.entries()];
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await transcribe("groq", form)).success).toBe(true);
      expect((await receivedForm(attempt)).getAll("timestamp_granularities[]")).toEqual(["word", "segment"]);
    }
    expect(requests).toHaveLength(2);
    expect([...form.entries()]).toEqual(initial);
    expect(unexpectedEgress).toEqual([]);
  });

  it("keeps the existing allowlist instead of forwarding unrelated client fields", async () => {
    const form = input();
    form.append("synthetic_private_field", "must stay local");
    expect((await transcribe("openai", form)).success).toBe(true);
    const outgoing = await receivedForm();
    expect(outgoing.has("synthetic_private_field")).toBe(false);
    expect(outgoing.has("timestamp_granularities[]")).toBe(false);
    expect(outgoing.get("response_format")).toBe("verbose_json");
  });
});
