import { describe, expect, it } from "vitest";
import { PROVIDERS } from "open-sse/config/providers.js";
import { getExecutor } from "open-sse/executors/index.js";

// Adapted from 9Router 3fd925ab: channel IDs are required by both gateways.
describe.each(["codebuddy-cn", "codebuddy-intl"])("%s channel headers", (provider) => {
  const credentials = { accessToken: "test-token" };
  const build = () => getExecutor(provider).buildHeaders(credentials, true, PROVIDERS[provider].baseUrl, "test-model", {});

  it("preserves the bearer credential and supplies per-request identifiers", () => {
    const first = build();
    const second = build();
    expect(first.Authorization).toBe("Bearer test-token");
    expect(first["X-Request-ID"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(first["X-Conversation-ID"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(first["X-Conversation-Request-ID"]).toBe(first["X-Request-ID"]);
    expect(first["X-Conversation-Message-ID"]).toBe(first["X-Request-ID"]);
    expect(first["X-Conversation-ID"]).not.toBe(first["X-Request-ID"]);
    expect(second["X-Request-ID"]).not.toBe(first["X-Request-ID"]);
    expect(second["X-Conversation-ID"]).not.toBe(first["X-Conversation-ID"]);
  });
});

it("does not add CodeBuddy channel headers to other providers", () => {
  const executor = getExecutor("openai");
  const headers = executor.buildHeaders({ apiKey: "test-token" }, true, undefined, "test-model", {});
  expect(headers["X-Conversation-ID"]).toBeUndefined();
});
