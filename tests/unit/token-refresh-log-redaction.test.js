import { beforeEach, describe, expect, it, vi } from "vitest";

const network = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: network.fetch }));
vi.mock("../../open-sse/config/providers.js", async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    PROVIDER_OAUTH: {
      ...actual.PROVIDER_OAUTH,
      trae: { exchangeTokenUrl: "https://synthetic-trae.example/token", clientId: "fixture-client" },
    },
  };
});
import * as refresh from "../../open-sse/services/tokenRefresh/providers.js";
import { refreshWithRetry } from "../../open-sse/services/tokenRefresh.js";

const providers = [
  ["claude", (token, log) => refresh.refreshClaudeOAuthToken(token, log)],
  ["cline", (token, log) => refresh.refreshClineToken(token, log)],
  ["codex", (token, log) => refresh.refreshCodexToken(token, log)],
  ["copilot", (token, log) => refresh.refreshCopilotToken(token, log)],
  ["codebuddy-cn", (token, log) => refresh.refreshCodebuddyToken(token, log)],
  ["codebuddy-intl", (token, log) => refresh.refreshCodebuddyIntlToken(token, log)],
  ["trae", (token, log) => refresh.refreshTraeToken(token, {}, log)],
];
let sequence = 0;
const secret = "synthetic-secret-never-include-in-diagnostics";
const logger = () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() });
function assertPrivate(log, requireDiagnostic = true) {
  const calls = Object.values(log).flatMap(method => method.mock.calls);
  if (requireDiagnostic) expect(calls.length).toBeGreaterThan(0);
  expect(JSON.stringify(calls)).not.toContain(secret);
  expect(JSON.stringify(calls)).not.toContain("error_description");
}

describe("OAuth refresh failure diagnostics exclude credential payloads", () => {
  beforeEach(() => network.fetch.mockReset());

  it.each(providers)("%s logs only a recognized OAuth code on failed HTTP responses", async (_provider, run) => {
    const log = logger();
    network.fetch.mockResolvedValue(Response.json({
      error: "invalid_grant", error_description: secret,
      access_token: secret, refresh_token: secret,
    }, { status: 400 }));
    await run(`error-${++sequence}`, log);
    assertPrivate(log);
    expect(JSON.stringify(log.error.mock.calls)).toContain("invalid_grant");
    expect(JSON.stringify(log.error.mock.calls)).toContain("400");
  });

  it.each(providers)("%s does not log arbitrary upstream error fields", async (_provider, run) => {
    const log = logger();
    network.fetch.mockResolvedValue(Response.json({ error: secret, error_code: secret }, { status: 502 }));
    await run(`arbitrary-${++sequence}`, log);
    assertPrivate(log);
    expect(JSON.stringify(log.error.mock.calls)).toContain("upstream_error");
  });

  it("does not include a rotated Trae token in a malformed success payload", async () => {
    const log = logger();
    network.fetch.mockResolvedValue(Response.json({ Result: { RefreshToken: secret } }));
    expect(await refresh.refreshTraeToken(`trae-malformed-${++sequence}`, {}, log)).toBeNull();
    assertPrivate(log);
    expect(log.error).toHaveBeenCalledWith("TOKEN_REFRESH", "Trae refresh returned no AccessToken", {
      status: 200, error: "missing_access_token",
    });
  });

  it.each(providers)("%s does not log JSON parser excerpts through the refresh/retry lifecycle", async (_provider, run) => {
    const log = logger();
    network.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError(`Malformed JSON: ${secret}`); } });
    const token = `parser-${++sequence}`;
    expect(await refreshWithRetry(() => run(token, log), 1, log)).toBeNull();
    assertPrivate(log);
    expect(JSON.stringify([...log.error.mock.calls, ...log.warn.mock.calls])).toContain("SyntaxError");
  });

  it.each(providers.filter(([provider]) => provider.startsWith("codebuddy")))("%s does not log success-envelope error messages", async (_provider, run) => {
    const log = logger();
    network.fetch.mockResolvedValue(Response.json({ code: secret, msg: secret, data: { refreshToken: secret } }));
    expect(await run(`envelope-${++sequence}`, log)).toBeNull();
    assertPrivate(log);
    expect(JSON.stringify(log.error.mock.calls)).toContain("missing_access_token");
  });

  it.each(providers)("%s cannot leak nested credentials through diagnostic expiry fields", async (_provider, run) => {
    const log = logger();
    const invalidExpiry = { refresh_token: secret };
    network.fetch.mockResolvedValue(Response.json({
      access_token: "synthetic-access", accessToken: "synthetic-access", token: "synthetic-access",
      expires_in: invalidExpiry, expires_at: invalidExpiry, expiresIn: invalidExpiry,
      code: 0, data: { accessToken: "synthetic-access", expiresIn: invalidExpiry },
      Result: { AccessToken: "synthetic-access", ExpiresAt: invalidExpiry },
    }));
    expect(await run(`expiry-${++sequence}`, log)).toBeTruthy();
    assertPrivate(log, false); // Cline intentionally emits no success diagnostic.
  });
});
