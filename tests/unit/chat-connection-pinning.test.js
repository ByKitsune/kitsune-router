// 9router #4718: the chat endpoints honor the `x-connection-id` account
// pinning header, mirroring the opt-in already supported by the image/video
// endpoints. The header must reach getProviderCredentials as
// `preferredConnectionId` and be ignored when absent.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProviderCredentials: vi.fn(),
  markAccountUnavailable: vi.fn(),
  clearAccountError: vi.fn(),
  extractApiKey: vi.fn(() => null),
  isValidApiKey: vi.fn(),
  getSettings: vi.fn(),
  getComboModels: vi.fn(),
  getModelInfo: vi.fn(),
  handleChatCore: vi.fn(),
  checkAndRefreshToken: vi.fn(),
  getDisabledByProvider: vi.fn(),
}));

vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: mocks.getProviderCredentials,
  markAccountUnavailable: mocks.markAccountUnavailable,
  clearAccountError: mocks.clearAccountError,
  extractApiKey: mocks.extractApiKey,
  isValidApiKey: mocks.isValidApiKey,
}));

vi.mock("@/lib/localDb", () => ({
  getSettings: mocks.getSettings,
  isApiKeyRequired: (s) => s?.requireApiKey === true,
}));

vi.mock("@/lib/disabledModelsDb", () => ({
  getDisabledByProvider: mocks.getDisabledByProvider,
}));

vi.mock("@/sse/services/model.js", () => ({
  getModelInfo: mocks.getModelInfo,
  getComboModels: mocks.getComboModels,
}));

vi.mock("open-sse/handlers/chatCore.js", () => ({
  handleChatCore: mocks.handleChatCore,
}));

vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: mocks.checkAndRefreshToken,
  updateProviderCredentials: vi.fn(),
}));

vi.mock("@/sse/utils/logger.js", () => ({
  request: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  maskKey: vi.fn(() => "masked"),
}));

vi.mock("@/sse/utils/requestCorrelation.js", () => ({
  correlateResponse: vi.fn((r) => r),
}));

vi.mock("@/lib/headroom/detect", () => ({
  DEFAULT_HEADROOM_URL: "http://localhost:1",
}));

vi.mock("@/lib/pxpipe/loader.js", () => ({
  getTransform: vi.fn(async () => null),
}));

vi.mock("@/lib/pxpipe/events.js", () => ({
  appendPxpipeEvent: vi.fn(),
}));

vi.mock("@/sse/services/antigravityQuota.js", () => ({
  handleAntigravityQuotaError: vi.fn(),
  clearAntigravityStrikes: vi.fn(),
}));

import { handleChat } from "@/sse/handlers/chat.js";

function makeRequest(headers = {}) {
  return new Request("http://localhost/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      model: "codex/gpt-6-sol",
      messages: [{ role: "user", content: "hi" }],
    }),
  });
}

describe("chat x-connection-id account pinning (#4718)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSettings.mockResolvedValue({ requireApiKey: false });
    mocks.getDisabledByProvider.mockResolvedValue([]);
    mocks.getModelInfo.mockResolvedValue({ provider: "codex", model: "gpt-6-sol" });
    mocks.getComboModels.mockResolvedValue(null);
    mocks.checkAndRefreshToken.mockImplementation(async (_p, credentials) => credentials);
    mocks.getProviderCredentials.mockResolvedValue({
      connectionId: "conn-pinned",
      connectionName: "Pinned",
      apiKey: "sk-test",
    });
    mocks.handleChatCore.mockResolvedValue({
      success: true,
      response: new Response(JSON.stringify({ ok: true }), { status: 200 }),
    });
  });

  it("passes the header value as preferredConnectionId", async () => {
    await handleChat(makeRequest({ "x-connection-id": "conn-pinned" }));

    expect(mocks.getProviderCredentials).toHaveBeenCalledWith(
      "codex",
      expect.any(Set),
      "gpt-6-sol",
      expect.objectContaining({ preferredConnectionId: "conn-pinned" }),
    );
  });

  it("passes null when the header is absent", async () => {
    await handleChat(makeRequest());

    expect(mocks.getProviderCredentials).toHaveBeenCalledWith(
      "codex",
      expect.any(Set),
      "gpt-6-sol",
      expect.objectContaining({ preferredConnectionId: null }),
    );
  });

  it("still serves the request when the pinned id is unknown (fallback)", async () => {
    // getProviderCredentials ignores unknown ids and returns a normal account.
    mocks.getProviderCredentials.mockResolvedValue({
      connectionId: "conn-other",
      connectionName: "Other",
      apiKey: "sk-test",
    });
    const response = await handleChat(makeRequest({ "x-connection-id": "does-not-exist" }));

    expect(response.status).toBe(200);
    expect(mocks.getProviderCredentials).toHaveBeenCalledWith(
      "codex",
      expect.any(Set),
      "gpt-6-sol",
      expect.objectContaining({ preferredConnectionId: "does-not-exist" }),
    );
  });
});
