import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

const mocks = vi.hoisted(() => ({
  getProviderNodeById: vi.fn(), getProxyPoolById: vi.fn(),
  resolveQoderCredentials: vi.fn(), resolveQoderModels: vi.fn(),
}));
vi.mock("@/models", () => ({
  getProviderNodeById: mocks.getProviderNodeById,
  getProxyPoolById: mocks.getProxyPoolById,
}));
vi.mock("open-sse/services/qoderModels.js", () => ({
  resolveQoderCredentials: mocks.resolveQoderCredentials,
  resolveQoderModels: mocks.resolveQoderModels,
}));

// Keep the real connection resolver and transport so an unavailable selection
// cannot be hidden by a mocked proxy implementation.
import { POST } from "../../src/app/api/providers/validate/route.js";

let network;
beforeEach(() => {
  vi.clearAllMocks();
  network = vi.fn().mockResolvedValue(Response.json({ data: [] }));
  vi.stubGlobal("fetch", network);
  mocks.getProxyPoolById.mockResolvedValue({ id: "selected", isActive: true, proxyUrl: "http://selected-proxy.example:3128" });
});
afterEach(() => vi.unstubAllGlobals());

function request(body, signal) {
  return new Request("http://gateway.test/api/providers/validate", {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ provider: "openai", apiKey: "synthetic-key", ...body }),
  });
}
async function validate(body, signal) { return (await POST(request(body, signal))).json(); }

async function listen(handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
async function close(server) {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

describe("unsaved credential probe routing", () => {
  it("uses the explicitly selected pool instead of the old provider-data selection", async () => {
    expect(await validate({ proxyPoolId: "selected", providerSpecificData: { proxyPoolId: "old" } })).toMatchObject({ valid: true });
    expect(mocks.getProxyPoolById).toHaveBeenCalledExactlyOnceWith("selected");
    expect(network.mock.calls[0][1]).toMatchObject({ redirect: "error", dispatcher: expect.anything(), signal: expect.any(AbortSignal) });
  });

  it("retains a provider-data pool when the caller does not override it", async () => {
    expect(await validate({ providerSpecificData: { proxyPoolId: "retained" } })).toMatchObject({ valid: true });
    expect(mocks.getProxyPoolById).toHaveBeenCalledExactlyOnceWith("retained");
  });

  it("allows an explicit empty selection to clear the old provider-data pool", async () => {
    expect(await validate({ proxyPoolId: null, providerSpecificData: { proxyPoolId: "old" } })).toMatchObject({ valid: true });
    expect(mocks.getProxyPoolById).not.toHaveBeenCalled();
  });

  it.each([null, { isActive: false, proxyUrl: "http://inactive.example:3128" }])("does not send credentials through default egress when the selected pool is unusable: %j", async pool => {
    mocks.getProxyPoolById.mockResolvedValue(pool);
    expect(await validate({ proxyPoolId: "unavailable" })).toMatchObject({ valid: false, error: expect.stringContaining("direct egress is disabled") });
    expect(network).not.toHaveBeenCalled();
  });

  it("does not send a cancelled validation request", async () => {
    const controller = new AbortController();
    controller.abort(new Error("operator cancelled validation"));
    expect(await validate({ proxyPoolId: "selected" }, controller.signal)).toMatchObject({ valid: false, error: "operator cancelled validation" });
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    ["selfhosted-stt", "https://speech.example/custom/transcriptions", "https://speech.example/custom/transcriptions"],
    ["selfhosted-stt", "https://speech.example/custom/transcriptions///", "https://speech.example/custom/transcriptions"],
    ["selfhosted-tts", "https://speech.example", "https://speech.example/v1/audio/speech"],
    ["selfhosted-tts", "https://speech.example/v1/", "https://speech.example/v1/audio/speech"],
    ["selfhosted-tts", "https://speech.example/v1/audio/speech/", "https://speech.example/v1/audio/speech"],
  ])("probes %s at the same configured endpoint as inference: %s", async (provider, baseUrl, expected) => {
    expect(await validate({ provider, providerSpecificData: { baseUrl } })).toMatchObject({ valid: true });
    expect(network).toHaveBeenCalledTimes(1);
    expect(network.mock.calls[0][0]).toBe(expected);
    expect(network.mock.calls[0][1].headers.Authorization).toBe("Bearer synthetic-key");
  });

  it("does not redirect a fixed cloud credential probe to an arbitrary provider-data host", async () => {
    expect(await validate({ provider: "elevenlabs", providerSpecificData: { baseUrl: "https://unrelated.example" } })).toMatchObject({ valid: true });
    expect(network.mock.calls[0][0]).toBe("https://api.elevenlabs.io/v1/text-to-speech");
  });

  it("uses the same selected route for Qoder PAT exchange and catalog discovery", async () => {
    const resolved = { accessToken: "synthetic-job", providerSpecificData: { userId: "synthetic-user" } };
    mocks.resolveQoderCredentials.mockResolvedValue(resolved);
    mocks.resolveQoderModels.mockResolvedValue({ models: [{ id: "synthetic-model" }] });
    expect(await validate({ provider: "qoder", apiKey: "pt-synthetic", proxyPoolId: "selected" })).toMatchObject({ valid: true });
    const [, proxyOptions, signal] = mocks.resolveQoderCredentials.mock.calls[0];
    expect(proxyOptions).toMatchObject({ proxyPoolId: "selected", connectionProxyUrl: "http://selected-proxy.example:3128" });
    expect(mocks.resolveQoderModels).toHaveBeenCalledExactlyOnceWith(resolved, { forceRefresh: true, proxyOptions, signal });
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    ["openai", "https://api.openai.com", "/v1/models"],
    ["brave-search", "https://api.search.brave.com", "/res/v1"],
    ["selfhosted-stt", "https://speech.example", "/transcriptions"],
  ])("sends %s probes through the selected relay, including helper paths", async (provider, target, path) => {
    vi.unstubAllGlobals();
    const calls = [];
    const relay = await listen((incoming, response) => {
      calls.push({ target: incoming.headers["x-relay-target"], path: incoming.headers["x-relay-path"],
        credential: incoming.headers.authorization || incoming.headers["x-subscription-token"] });
      incoming.resume();
      response.setHeader("Content-Type", "application/json"); response.end("{}");
    });
    try {
      mocks.getProxyPoolById.mockResolvedValue({ id: "relay", type: "vercel", isActive: true, strictProxy: true, proxyUrl: relay.url });
      expect(await validate({ provider, proxyPoolId: "relay", providerSpecificData: { baseUrl: "https://speech.example/transcriptions" } })).toMatchObject({ valid: true });
      expect(calls).toEqual([{ target, path, credential: provider === "brave-search" ? "synthetic-key" : "Bearer synthetic-key" }]);
    } finally { await close(relay.server); }
  });

  it("refuses credential-bearing redirects instead of forwarding keys to a new host", async () => {
    vi.unstubAllGlobals();
    let forwarded = 0;
    const destination = await listen((incoming, response) => { forwarded++; incoming.resume(); response.end("{}"); });
    const origin = await listen((incoming, response) => { incoming.resume(); response.writeHead(307, { Location: destination.url }); response.end(); });
    try {
      mocks.getProviderNodeById.mockResolvedValue({ baseUrl: origin.url });
      expect(await validate({ provider: "openai-compatible-redirect-test" })).toMatchObject({ valid: false });
      expect(forwarded).toBe(0);
    } finally { await close(origin.server); await close(destination.server); }
  });
});
