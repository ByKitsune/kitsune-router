import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Keep the real provider routing, request serialization and catalog parsing;
// replace only the network boundary so no account or paid request is needed.
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => globalThis.fetch(...args),
}));
vi.mock("next/server", () => ({
  NextResponse: { json: (body, init) => Response.json(body, init) },
}));
vi.mock("@/models", () => ({ getProviderNodeById: vi.fn() }));
const database = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  getCombos: vi.fn(),
  getCustomModels: vi.fn(),
  getModelAliases: vi.fn(),
  getProviderNodes: vi.fn(),
  getDisabledModels: vi.fn(),
  getProviderConnectionById: vi.fn(),
  updateProviderConnection: vi.fn(),
}));
vi.mock("@/lib/localDb", () => database);
vi.mock("@/lib/disabledModelsDb", () => database);
vi.mock("@/sse/services/tokenRefresh", () => ({ updateProviderCredentials: vi.fn() }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: vi.fn().mockResolvedValue(null) }));

import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { parseModel } from "../../open-sse/services/model.js";
import { POST as validate } from "../../src/app/api/providers/validate/route.js";
import { clearProviderLiveModelsCache, fetchProviderLiveModels } from "../../src/shared/utils/providerLiveModels.js";
import { buildModelsList } from "../../src/app/api/v1/models/route.js";
import { testApiKeyConnection } from "../../src/app/api/providers/[id]/test/testUtils.js";

const API_ORIGIN = "https://api.bykitsune.com/v1";
const API_KEY = "sk-kitsune-fixture-not-a-real-key";
// Provider-native IDs can carry their own namespace; only the router's first
// prefix belongs to us. Never shorten this to an unverified static model ID.
const MODEL_ID = "vendor/fixture-chat";
let upstream;

beforeEach(() => {
  clearProviderLiveModelsCache();
  database.getProviderConnections.mockResolvedValue([{ provider: "bykitsune", apiKey: API_KEY, isActive: true }]);
  database.getCombos.mockResolvedValue([]);
  database.getCustomModels.mockResolvedValue([]);
  database.getModelAliases.mockResolvedValue({});
  database.getProviderNodes.mockResolvedValue([]);
  database.getDisabledModels.mockResolvedValue({});
  upstream = vi.fn().mockRejectedValue(new Error("Unexpected upstream request"));
  vi.stubGlobal("fetch", upstream);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function validationRequest(apiKey = API_KEY) {
  return new Request("http://gateway.example/api/providers/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "bykitsune", apiKey }),
  });
}

describe("ByKitsune chat transport", () => {
  it("routes a JSON request to the official API with the exact native model ID", async () => {
    const parsed = parseModel(`bykitsune/${MODEL_ID}`);
    expect(parsed).toMatchObject({ provider: "bykitsune", model: MODEL_ID });
    const completion = {
      id: "chatcmpl-fixture",
      object: "chat.completion",
      model: MODEL_ID,
      choices: [{ index: 0, message: { role: "assistant", content: "Hello" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    };
    upstream.mockResolvedValueOnce(Response.json(completion));
    const body = { model: parsed.model, messages: [{ role: "user", content: "Hello" }], stream: false };

    const result = await new DefaultExecutor(parsed.provider).execute({
      model: parsed.model, body, stream: false, credentials: { apiKey: API_KEY },
    });

    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe(`${API_ORIGIN}/chat/completions`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(JSON.parse(init.body)).toEqual(body);
    expect(await result.response.json()).toEqual(completion);
  });

  it("keeps streamed deltas, final usage and the terminal event intact", async () => {
    const wire = [
      `data: ${JSON.stringify({ id: "chatcmpl-fixture", model: MODEL_ID, choices: [{ index: 0, delta: { role: "assistant", content: "Hello" }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ id: "chatcmpl-fixture", model: MODEL_ID, choices: [], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } })}\n\n`,
      "data: [DONE]\n\n",
    ];
    const encoder = new TextEncoder();
    upstream.mockResolvedValueOnce(new Response(new ReadableStream({
      start(controller) {
        for (const event of wire) controller.enqueue(encoder.encode(event));
        controller.close();
      },
    }), { headers: { "Content-Type": "text/event-stream" } }));

    const result = await new DefaultExecutor("bykitsune").execute({
      model: MODEL_ID,
      body: { model: MODEL_ID, messages: [{ role: "user", content: "Hello" }], stream: true },
      stream: true,
      credentials: { apiKey: API_KEY },
    });

    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe(`${API_ORIGIN}/chat/completions`);
    expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(init.headers.Accept).toBe("text/event-stream");
    expect(JSON.parse(init.body)).toMatchObject({ model: MODEL_ID, stream: true });
    expect(await result.response.text()).toBe(wire.join(""));
  });
});

describe("ByKitsune connection validation", () => {
  it.each([200, 401, 403, 429, 503])("validates API credentials through /models without a paid chat fallback (HTTP %s)", async (status) => {
    upstream.mockResolvedValueOnce(Response.json(status === 200 ? { data: [{ id: MODEL_ID }] } : { error: { message: "Invalid API key" } }, { status }));
    const response = await validate(validationRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ valid: status === 200 });
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe(`${API_ORIGIN}/models`);
    expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(init.body).toBeUndefined();
  });

  it("requires an API key before any upstream request", async () => {
    expect((await validate(validationRequest(""))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("ByKitsune saved connection retesting", () => {
  it.each([200, 401, 403, 404, 429, 503])("requires a successful /models response (HTTP %s)", async (status) => {
    upstream.mockResolvedValueOnce(Response.json(status === 200 ? { data: [{ id: MODEL_ID }] } : { error: { message: "Fixture upstream failure" } }, { status }));

    const result = await testApiKeyConnection({ provider: "bykitsune", authType: "apikey", apiKey: API_KEY });

    expect(result.valid).toBe(status === 200);
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe(`${API_ORIGIN}/models`);
    expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(init.body).toBeUndefined();
  });
});

describe("ByKitsune live model discovery", () => {
  it("publishes live models under the ByKitsune route without requiring static seed models", async () => {
    upstream.mockResolvedValueOnce(Response.json({ data: [{ id: MODEL_ID }] }));

    const listed = await buildModelsList(["llm"]);
    const row = listed.find((model) => model.id === `bykitsune/${MODEL_ID}`);

    expect(row).toMatchObject({ id: `bykitsune/${MODEL_ID}`, owned_by: "bykitsune" });
    expect(parseModel(row.id)).toMatchObject({ provider: "bykitsune", model: MODEL_ID });
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0][0]).toBe(`${API_ORIGIN}/models`);
  });

  it("loads the authenticated deployment catalog and preserves native namespaces", async () => {
    upstream.mockResolvedValueOnce(Response.json({ object: "list", data: [
      { id: MODEL_ID, object: "model", context_length: 64000, max_output_tokens: 4096 },
      { id: "another-vendor/fixture-reasoner", object: "model" },
    ] }));

    const models = await fetchProviderLiveModels("bykitsune", API_KEY);

    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe(`${API_ORIGIN}/models`);
    expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(models.map((model) => model.id)).toEqual([MODEL_ID, "another-vendor/fixture-reasoner"]);
    expect(models[0]).toMatchObject({ context_length: 64000, max_completion_tokens: 4096 });
    expect(models[1].context_length).toBeUndefined();
    expect(models[1].max_completion_tokens).toBeUndefined();
  });

  it("does not turn a rejected catalog request into invented availability", async () => {
    upstream.mockResolvedValueOnce(Response.json({ error: { message: "Invalid API key" } }, { status: 401 }));
    expect(await fetchProviderLiveModels("bykitsune", API_KEY)).toBeNull();
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
