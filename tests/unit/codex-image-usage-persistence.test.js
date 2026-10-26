// 9router #4643: Codex image generation reports exact token usage on the
// Responses stream, but the image path never entered the chat usage pipeline —
// those requests and their tokens were missing from usage history, provider/
// model statistics and request counts. The handler now persists exact
// provider-reported usage via enqueueRequestUsage and never fabricates 0/0 rows.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleImageGenerationCore: vi.fn(),
  enqueueRequestUsage: vi.fn(),
  clearAccountError: vi.fn(),
}));

vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: async () => ({
    accessToken: "provider-token",
    connectionId: "connection-a",
    connectionName: "Codex A",
  }),
  markAccountUnavailable: vi.fn(),
  clearAccountError: mocks.clearAccountError,
  extractApiKey: () => "client-key",
  isValidApiKey: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getSettings: async () => ({ requireApiKey: false }),
  isApiKeyRequired: () => false,
}));

vi.mock("@/sse/services/model.js", () => ({
  getModelInfo: async () => ({ provider: "codex", model: "gpt-5.6-sol-image" }),
  getComboModels: async () => null,
}));

vi.mock("open-sse/handlers/imageGenerationCore.js", () => ({
  handleImageGenerationCore: mocks.handleImageGenerationCore,
}));

vi.mock("open-sse/utils/error.js", () => ({
  errorResponse: (status, message) => Response.json({ error: message }, { status }),
  unavailableResponse: (status, message) => Response.json({ error: message }, { status }),
}));

vi.mock("@/sse/services/tokenRefresh.js", () => ({
  updateProviderCredentials: vi.fn(),
  checkAndRefreshToken: async (_provider, credentials) => credentials,
}));

vi.mock("open-sse/services/combo.js", () => ({
  handleComboChat: vi.fn(),
}));

vi.mock("@/sse/utils/logger.js", () => ({
  request: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  maskKey: vi.fn(),
}));

vi.mock("@/lib/usageDb.js", () => ({
  enqueueRequestUsage: mocks.enqueueRequestUsage,
}));

import { handleImageGeneration } from "@/sse/handlers/imageGeneration.js";

describe("Codex image usage persistence (#4643)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueRequestUsage.mockResolvedValue(undefined);
    mocks.clearAccountError.mockResolvedValue(undefined);
  });

  it("persists exact provider-reported input/output tokens", async () => {
    mocks.handleImageGenerationCore.mockImplementation(async ({ onUsage, onRequestSuccess }) => {
      await onUsage?.({
        prompt_tokens: 321,
        completion_tokens: 654,
        total_tokens: 975,
        cached_tokens: 111,
        reasoning_tokens: 22,
      });
      await onRequestSuccess?.();
      return { success: true, response: Response.json({ data: [{ b64_json: "image" }] }) };
    });

    await handleImageGeneration(new Request("http://localhost/v1/images/generations", {
      method: "POST",
      headers: { Authorization: "Bearer client-key" },
      body: JSON.stringify({ model: "cx/gpt-5.6-sol-image", prompt: "draw a cat" }),
    }));

    expect(mocks.enqueueRequestUsage).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueRequestUsage).toHaveBeenCalledWith({
      eventId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      timestamp: expect.any(String),
      provider: "codex",
      model: "gpt-5.6-sol-image",
      connectionId: "connection-a",
      apiKey: "client-key",
      endpoint: "/v1/images/generations",
      tokens: {
        prompt_tokens: 321,
        completion_tokens: 654,
        total_tokens: 975,
        cached_tokens: 111,
        reasoning_tokens: 22,
      },
      status: "success",
    });
  });

  it("does not persist fabricated usage when upstream usage is absent", async () => {
    mocks.handleImageGenerationCore.mockImplementation(async ({ onRequestSuccess }) => {
      await onRequestSuccess?.();
      return { success: true, response: Response.json({ data: [{ b64_json: "image" }] }) };
    });

    await handleImageGeneration(new Request("http://localhost/v1/images/generations", {
      method: "POST",
      body: JSON.stringify({ model: "cx/gpt-5.6-sol-image", prompt: "draw a cat" }),
    }));

    expect(mocks.enqueueRequestUsage).not.toHaveBeenCalled();
  });

  it("ignores a usage payload without exact integer counts", async () => {
    mocks.handleImageGenerationCore.mockImplementation(async ({ onUsage }) => {
      await onUsage?.({ prompt_tokens: null, completion_tokens: 10 });
      return { success: true, response: Response.json({ data: [{ b64_json: "image" }] }) };
    });

    await handleImageGeneration(new Request("http://localhost/v1/images/generations", {
      method: "POST",
      body: JSON.stringify({ model: "cx/gpt-5.6-sol-image", prompt: "draw a cat" }),
    }));

    expect(mocks.enqueueRequestUsage).not.toHaveBeenCalled();
  });

  it("awaits durable acceptance, owns usage tokens and deduplicates terminal callbacks per attempt", async () => {
    let accept;
    mocks.enqueueRequestUsage.mockImplementation(() => new Promise(resolve => { accept = resolve; }));
    const tokens = { prompt_tokens: 3, completion_tokens: 5, cache_write_30m_tokens: 1, actualServiceTier: "priority" };
    mocks.handleImageGenerationCore.mockImplementation(async ({ onUsage }) => {
      const first = onUsage(tokens);
      tokens.prompt_tokens = 999;
      expect(onUsage({ prompt_tokens: 3, completion_tokens: 5 })).toBe(first);
      await first;
      return { success: true, response: Response.json({ data: [{ b64_json: "image" }] }) };
    });
    let settled = false;
    const pending = handleImageGeneration(new Request("http://localhost/v1/images/generations", {
      method: "POST", body: JSON.stringify({ model: "cx/gpt-5.6-sol-image", prompt: "fixture" }),
    })).then(response => { settled = true; return response; });
    await vi.waitFor(() => expect(accept).toBeTypeOf("function"));
    expect(settled).toBe(false);
    expect(mocks.enqueueRequestUsage).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueRequestUsage.mock.calls[0][0]).toMatchObject({
      eventId: expect.any(String), timestamp: expect.any(String),
      tokens: { prompt_tokens: 3, completion_tokens: 5, cache_write_30m_tokens: 1, actualServiceTier: "priority" },
    });
    accept({ accepted: true });
    expect((await pending).status).toBe(200);
  });

  it("surfaces a core-caught acceptance failure instead of returning success or rotating accounts", async () => {
    mocks.enqueueRequestUsage.mockRejectedValue(Object.assign(new Error("private database path"), { code: "SQLITE_FULL" }));
    mocks.handleImageGenerationCore.mockImplementation(async ({ onUsage }) => {
      try { await onUsage({ prompt_tokens: 3, completion_tokens: 5 }); }
      catch (error) { return { success: false, status: 502, error: error.message, response: Response.json({ error: error.message }, { status: 502 }) }; }
    });
    const response = await handleImageGeneration(new Request("http://localhost/v1/images/generations", {
      method: "POST", body: JSON.stringify({ model: "cx/gpt-5.6-sol-image", prompt: "fixture" }),
    }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database path");
    expect(mocks.enqueueRequestUsage).toHaveBeenCalledTimes(1);
  });

  it("does not collapse distinct identical requests and ignores exact zero or estimated usage", async () => {
    mocks.handleImageGenerationCore.mockImplementation(async ({ onUsage }) => {
      await onUsage({ prompt_tokens: 0, completion_tokens: 0 });
      await onUsage({ prompt_tokens: 1, completion_tokens: 2, estimated: true });
      await onUsage({ prompt_tokens: 1, completion_tokens: 2 });
      return { success: true, response: Response.json({ data: [{ b64_json: "image" }] }) };
    });
    for (let i = 0; i < 2; i++) await handleImageGeneration(new Request("http://localhost/v1/images/generations", {
      method: "POST", body: JSON.stringify({ model: "cx/gpt-5.6-sol-image", prompt: "fixture" }),
    }));
    expect(mocks.enqueueRequestUsage).toHaveBeenCalledTimes(2);
    expect(mocks.enqueueRequestUsage.mock.calls[0][0].eventId).not.toBe(mocks.enqueueRequestUsage.mock.calls[1][0].eventId);
  });
});
