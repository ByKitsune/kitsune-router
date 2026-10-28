import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("@/lib/localDb", () => ({ getProviderConnectionById: vi.fn(), updateProviderConnection: vi.fn() }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: vi.fn(async () => ({})) }));
vi.mock("@/lib/network/proxyTest", () => ({ testProxyUrl: vi.fn() }));

import * as versions from "../../open-sse/config/clientVersions.js";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { CommandCodeExecutor } from "../../open-sse/executors/commandcode.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { refreshKiroToken } from "../../open-sse/services/tokenRefresh/providers.js";
import { getProviderConnectionById } from "@/lib/localDb";
import { testSingleConnection } from "../../src/app/api/providers/[id]/test/testUtils.js";
vi.mock("@/models", () => ({ getProviderNodeById: vi.fn() }));
import { POST as validateProvider } from "../../src/app/api/providers/validate/route.js";
import codebuddyCn from "../../src/lib/oauth/providers/codebuddy-cn.js";
import codebuddyIntl from "../../src/lib/oauth/providers/codebuddy-intl.js";

const json = data => new Response(JSON.stringify(data), { status: 200 });
const lastHeaders = mock => new Headers(mock.mock.calls.at(-1)[1].headers);
const credentials = { accessToken: "fixture-access", apiKey: "fixture-key" };
beforeEach(() => {
  vi.clearAllMocks();
  proxyAwareFetch.mockImplementation(async () => json({}));
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected fixture fetch"); }));
});
afterEach(() => vi.unstubAllGlobals());

// Publisher evidence captured 2026-10-21: Claude native 2.1.306/SDK 0.128.0;
// Kiro stable manifests 1.4.13/2.33.0; Kimchi v1.17.0 release/tag;
// CodeBuddy npm 2.171.0 (CN CLI only); the earlier Command Code 1.86.3 pin
// was integrity-checked. 1.88.0 is the newer upstream-reported header identity.
// All I/O is fixture-only; app releases do not establish unverified SDK pins.
describe("verified client release migrations", () => {
  it("emits the latest-channel Claude release and its bundled Stainless version", async () => {
    await new DefaultExecutor("claude").execute({ model: "claude-sonnet-4-6", body: { messages: [{ role: "user", content: "fixture" }], max_tokens: 16 }, stream: false, credentials: { accessToken: "fixture-oauth" } });
    const headers = lastHeaders(proxyAwareFetch);
    expect(headers.get("user-agent")).toBe("claude-cli/2.1.306 (external, sdk-cli)");
    expect(headers.get("x-stainless-package-version")).toBe("0.128.0");
    expect(headers.get("x-stainless-runtime-version")).toBe("v24.14.0");
    expect(headers.get("anthropic-beta")).not.toContain("timing-2026-09-09");
  });

  it("uses Kiro CLI 2.33.0 in the real dashboard social-refresh probe", async () => {
    getProviderConnectionById.mockResolvedValue({ id: "fixture-kiro", provider: "kiro", accessToken: "old", refreshToken: "fixture-refresh-probe", expiresAt: "2000-01-01T00:00:00Z" });
    fetch.mockResolvedValue(json({ accessToken: "new", expiresIn: 3600 }));
    expect(await testSingleConnection("fixture-kiro")).toMatchObject({ valid: true, refreshed: true });
    expect(lastHeaders(fetch).get("user-agent")).toBe("kiro-cli/2.33.0");
  });

  it("uses the same Kiro CLI identity in executor and token service", async () => {
    proxyAwareFetch.mockImplementation(async () => json({ accessToken: "new", expiresIn: 3600 }));
    await new DefaultExecutor("kiro").refreshKiro("fixture-default-kiro");
    expect(lastHeaders(proxyAwareFetch).get("user-agent")).toBe("kiro-cli/2.33.0");
    await refreshKiroToken("fixture-service-kiro", { profileArn: "fixture-profile" });
    expect(lastHeaders(proxyAwareFetch).get("user-agent")).toBe("kiro-cli/2.33.0");
    expect(versions.KIRO_IDE_VERSION).toBe("1.4.13");
  });

  it.each([
    ["codebuddy-cn", codebuddyCn, "CLI/2.171.0 CodeBuddy/2.171.0"],
    ["codebuddy-intl", codebuddyIntl, "IDE/2.161.1 CodeBuddy/2.161.1"],
  ])("keeps %s transport and OAuth identity paired without inventing an INTL IDE release", async (provider, oauth, expected) => {
    const headers = new Headers(new DefaultExecutor(provider).buildHeaders(credentials));
    expect(headers.get("user-agent")).toBe(expected);
    fetch.mockImplementation(async () => json({ code: 0, data: { state: "fixture-state", authUrl: "https://example.test", accessToken: "fixture-access" } }));
    await oauth.requestDeviceCode(oauth.config);
    expect(lastHeaders(fetch).get("user-agent")).toBe(expected);
    await oauth.pollToken(oauth.config, "fixture-state");
    expect(lastHeaders(fetch).get("user-agent")).toBe(expected);
  });

  it("emits Kimchi's tagged release user agent", () => {
    expect(new Headers(new DefaultExecutor("kimchi").buildHeaders(credentials)).get("user-agent")).toBe("kimchi/1.17.0");
  });

  it("updates only Trae's inactive source pin", () => {
    expect(versions.TRAE_APP_VERSION).toBe("3.6.4");
    expect(PROVIDERS.trae).toBeUndefined();
    expect(versions.TRAE_USER_AGENT).toBe("Trae/1.0.0 antigravity-cockpit-tools");
  });

  it("sends the upstream-reported Command Code headers through its real NDJSON executor", async () => {
    proxyAwareFetch.mockResolvedValue(new Response('{"type":"text-delta","delta":"fixture"}\n{"type":"finish","finishReason":"stop"}\n'));
    const result = await new CommandCodeExecutor().execute({ model: "fixture-model", body: { messages: [] }, stream: true, credentials });
    const headers = lastHeaders(proxyAwareFetch);
    expect(proxyAwareFetch.mock.calls[0][0]).toBe("https://api.commandcode.ai/alpha/generate");
    expect(headers.get("x-cli-environment")).toBe("production");
    expect(headers.get("x-command-code-version")).toBe("1.88.0");
    expect(headers.get("user-agent")).toBe("cli");
    expect(headers.get("authorization")).toBe("Bearer fixture-key");
    expect(headers.get("x-session-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(await result.response.text()).toContain("[DONE]");
  });

  it("propagates Command Code version and UA to the real key-validation consumer", async () => {
    fetch.mockResolvedValue(json({}));
    const response = await validateProvider({ json: async () => ({ provider: "commandcode", apiKey: "fixture-key" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true, error: null });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(lastHeaders(fetch).get("x-command-code-version")).toBe("1.88.0");
    expect(lastHeaders(fetch).get("user-agent")).toBe("cli");
    expect(lastHeaders(fetch).get("x-cli-environment")).toBe("production");
    expect(lastHeaders(fetch).get("authorization")).toBe("Bearer fixture-key");
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(lastHeaders(fetch).get("x-session-id")).toBe(body.threadId);
    expect(lastHeaders(fetch).get("x-cli-surface")).toBe("cli");
    expect(lastHeaders(fetch).get("x-taste-learning")).toBe("false");
  });

  it("keeps independently verified releases separate from retained SDK pins", () => {
    expect(versions.VSCODE_VERSION).toBe("1.143.0");
    expect(versions.COPILOT_CHAT_VERSION).toBe("0.71.0");
    expect(versions.ANTIGRAVITY_IDE_VERSION).toBe("2.5.5");
    expect(versions.CURSOR_VERSION).toBe("3.24.18");
    expect(versions.QODER_CLI_VERSION).toBe("1.1.75");
    expect(versions.KIRO_AWS_SDK_VERSION).toBe("3.0.0");
  });
});
