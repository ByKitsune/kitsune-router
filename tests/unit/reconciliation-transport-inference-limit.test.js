import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  vi.stubEnv("V1_RATE_LIMIT_RPM", "8");
  vi.stubEnv("V1_RATE_LIMIT_BURST", "2");
  return { valid: true, accounts: [], health: [], embeddings: 0, native: 0, chat: 0 };
});
vi.mock("@/lib/localDb", () => ({ getSettings: async () => ({ requireApiKey: true }), isApiKeyRequired: s => s.requireApiKey }));
vi.mock("@/sse/services/auth.js", () => ({
  extractApiKey: request => request.headers.get("authorization")?.slice(7),
  isValidApiKey: async () => state.valid,
  getProviderCredentials: async (_provider, excluded) => {
    state.accounts.push([...excluded]);
    return { apiKey: "provider-fixture", connectionId: excluded.size ? "second" : "first" };
  },
  markAccountUnavailable: async (...args) => { state.health.push(args); return { shouldFallback: true }; },
  clearAccountError: async () => {},
}));
vi.mock("@/sse/services/model.js", () => ({ getModelInfo: async () => ({ provider: "openai", model: "embedding-fixture" }) }));
vi.mock("@/sse/services/tokenRefresh.js", () => ({ checkAndRefreshToken: async (_p, credentials) => credentials, updateProviderCredentials: async () => {} }));
vi.mock("@/lib/usageDb.js", () => ({ saveRequestUsage: async () => {} }));
vi.mock("open-sse/handlers/embeddingsCore.js", () => ({ handleEmbeddingsCore: async () => {
  state.embeddings++;
  return state.embeddings === 1
    ? { success: false, status: 503, error: "temporary", response: Response.json({}, { status: 503 }) }
    : { success: true, response: Response.json({ data: [] }) };
} }));
vi.mock("open-sse/translator/index.js", () => ({ initTranslators: async () => {} }));
vi.mock("@/sse/handlers/chat.js", () => ({ handleChat: async request => {
  state.chat++;
  const { withInferenceLimit } = await import("@/lib/rateLimit/inferenceLimit.js");
  return withInferenceLimit(request, "caller-fixture", async () => Response.json({ candidates: [] }));
} }));

import { handleEmbeddings } from "@/sse/handlers/embeddings.js";
import { POST as gemini, OPTIONS } from "../../src/app/api/v1beta/models/[...path]/route.js";
import { consume, rateLimitKey, resetRateLimiter } from "@/lib/rateLimit/v1Limiter.js";

const start = Date.UTC(2026, 0, 1);
function request(body, headers = {}) {
  return new Request("http://localhost/v1beta/models/gemini-3.1-flash-tts-preview:generateContent", {
    method: "POST", headers: { authorization: "Bearer caller-fixture", ...headers }, body: JSON.stringify(body),
  });
}
const endpoints = [
  { name: "embeddings", call: () => handleEmbeddings(request({ model: "openai/embed", input: "hello" })) },
  { name: "native Gemini TTS", call: () => gemini(request({ generationConfig: { responseModalities: ["AUDIO"], maxOutputTokens: 37 } }),
    { params: Promise.resolve({ path: ["gemini-3.1-flash-tts-preview:generateContent"] }) }) },
];
beforeEach(() => {
  state.valid = true;
  state.accounts = [];
  state.health = [];
  state.embeddings = 0;
  state.native = 0;
  state.chat = 0;
  resetRateLimiter();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(start);
  vi.stubGlobal("fetch", async () => {
    state.native++;
    return state.native === 1 ? Response.json({ error: { message: "temporary" } }, { status: 503 })
      : Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16", data: "AAE=" } }] } }] });
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
afterAll(() => vi.unstubAllEnvs());

describe.each(endpoints)("$name shared inference admission", endpoint => {
  it("charges once across account fallback and attaches the shared advisory headers", async () => {
    const response = await endpoint.call();
    expect(response.status).toBe(200);
    expect(state.accounts).toEqual([[], ["first"]]);
    expect(response.headers.get("x-ratelimit-limit")).toBe("8");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("7");
    expect(consume(rateLimitKey("caller-fixture"), start + 1000).remaining).toBe(6);
  });

  it("rejects an exhausted caller before account selection or provider work", async () => {
    for (let i = 0; i < 8; i++) expect(consume(rateLimitKey("caller-fixture"), start + i * 1000).allowed).toBe(true);
    vi.setSystemTime(start + 8000);
    const response = await endpoint.call();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(state.accounts).toEqual([]);
    expect(state.health).toEqual([]);
    expect(state.embeddings + state.native).toBe(0);
  });

  it("does not charge an unauthorized caller", async () => {
    state.valid = false;
    expect((await endpoint.call()).status).toBe(401);
    expect(consume(rateLimitKey("caller-fixture"), start).remaining).toBe(7);
    expect(state.accounts).toEqual([]);
  });
});

it("does not double-charge native Gemini chat routed through shared handleChat", async () => {
  const response = await gemini(request({ contents: [{ parts: [{ text: "hello" }] }] }), {
    params: Promise.resolve({ path: ["gemini-3.8-flash:generateContent"] }),
  });
  expect(state.chat).toBe(1);
  expect(response.headers.get("x-ratelimit-remaining")).toBe("7");
});

it("does not charge native Gemini preflight", async () => {
  expect((await OPTIONS()).status).toBe(200);
  expect(consume(rateLimitKey("caller-fixture"), start).remaining).toBe(7);
});
