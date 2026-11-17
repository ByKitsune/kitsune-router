import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("LOG_LEVEL", "DEBUG");
  vi.stubEnv("NODE_ENV", "development");
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("request diagnostics redact credentials and preserve useful metadata", () => {
  it("redacts nested credential fields while preserving zero/false counters and original objects", async () => {
    const log = await import("@/sse/utils/logger.js");
    const data = { authorization: "synthetic-authorization-canary", nested: { accessToken: "synthetic-access-canary", api_key: "synthetic-api-canary" }, prompt_tokens: 0, enabled: false, status: 429 };
    const before = structuredClone(data);
    log.warn("quota", "provider rejected request", data);
    const output = console.warn.mock.calls[0].join(" ");
    expect(output).not.toContain("synthetic-authorization-canary");
    expect(output).not.toContain("synthetic-access-canary");
    expect(output).not.toContain("synthetic-api-canary");
    expect(output).toContain('"prompt_tokens":0');
    expect(output).toContain('"enabled":false');
    expect(output).toContain("429");
    expect(data).toEqual(before);
  });

  it.each([0, false, null])("retains explicit diagnostic data %s", async data => {
    const log = await import("@/sse/utils/logger.js");
    log.info("metadata", "counter", data);
    expect(console.log.mock.calls[0][0]).toContain(`counter ${String(data)}`);
  });

  it("escapes injected lines and redacts Bearer and URL credentials in crash diagnostics", async () => {
    const log = await import("@/sse/utils/logger.js");
    log.errorLine("request-id", "failure", "upstream failed\n[FORGED] success Authorization: Bearer synthetic-bearer-canary https://user:synthetic-password-canary@example.invalid/v1?token=synthetic-query-canary&status=429");
    const output = console.log.mock.calls[0][0];
    expect(output).not.toContain("\n");
    expect(output).not.toContain("synthetic-bearer-canary");
    expect(output).not.toContain("synthetic-password-canary");
    expect(output).not.toContain("synthetic-query-canary");
    expect(output).toContain("status=429");
    expect(output).toContain("request-id");
  });

  it("applies the same credential and line boundary to development debug output", async () => {
    const log = await import("open-sse/utils/debugLog.js");
    log.dbg("FETCH", "Authorization: Bearer synthetic-debug-canary\r\nforged output");
    const output = console.log.mock.calls[0][0];
    expect(output).not.toContain("synthetic-debug-canary");
    expect(output).not.toContain("\n");
    expect(output).not.toContain("\r");
    expect(output).toContain("FETCH");
  });

  it("keeps Error diagnostics useful and never invokes logging getters", async () => {
    const log = await import("@/sse/utils/logger.js");
    const getter = vi.fn(() => { throw new Error("getter executed"); });
    const data = { status: 502, error: new Error("upstream connection closed") };
    Object.defineProperty(data, "unsafe", { get: getter, enumerable: true });
    expect(() => log.error("provider", "failed", data)).not.toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(console.log.mock.calls[0][0]).toContain("upstream connection closed");
  });

  it("preserves authentication policy flags without exposing actual key assignments or swallowing delimiters", async () => {
    const log = await import("@/sse/utils/logger.js");
    log.warn("auth", "(requireApiKey=true) hasApiKey=false apiKey=synthetic-policy-canary)", { requireApiKey: true, hasApiKey: false, apiKey: "synthetic-object-policy-canary" });
    const output = console.warn.mock.calls[0][0];
    expect(output).toContain("(requireApiKey=true)");
    expect(output).toContain("hasApiKey=false");
    expect(output).toContain("apiKey=[REDACTED])");
    expect(output).toContain('"requireApiKey":true');
    expect(output).toContain('"hasApiKey":false');
    expect(output).not.toContain("synthetic-policy-canary");
    expect(output).not.toContain("synthetic-object-policy-canary");
  });
});
