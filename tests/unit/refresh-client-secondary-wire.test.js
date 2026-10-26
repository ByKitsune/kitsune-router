import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { GithubExecutor } from "../../open-sse/executors/github.js";
import { CursorExecutor } from "../../open-sse/executors/cursor.js";
import { GrokCliExecutor } from "../../open-sse/executors/grok-cli.js";
import { OpenCodeExecutor } from "../../open-sse/executors/opencode.js";
import WindsurfExecutor from "../../open-sse/executors/windsurf.js";
import ZedExecutor from "../../open-sse/executors/zed.js";
import TraeExecutor from "../../open-sse/executors/trae.js";
import { decodeMessage } from "../../open-sse/utils/cursorProtobuf.js";
import { clearCursorModelCache, resolveCursorModels } from "../../open-sse/services/cursorModels.js";
import { resolveKiroModels } from "../../open-sse/services/kiroModels.js";
import { resolveGrokCliModels } from "../../open-sse/services/grokCliModels.js";
import { getGrokCliUsage } from "../../open-sse/services/usage/grok-cli.js";
import { refreshCopilotToken } from "../../open-sse/services/tokenRefresh/providers.js";
import { clearZedCaches } from "../../open-sse/shared/zedAuth.js";
import { resolveQoderCredentials } from "../../open-sse/services/qoderModels.js";
import grokOAuth from "../../src/lib/oauth/providers/grok-cli.js";
import { PROVIDERS } from "../../open-sse/config/providers.js";

const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const captured = () => proxyAwareFetch.mock.calls.map(([url, init]) => ({ url, ...init, headers: new Headers(init.headers) }));
const lastRequest = () => captured().at(-1);
const stringField = (message, field) => Buffer.from(message.get(field)[0].value).toString("utf8");

beforeEach(() => {
  vi.clearAllMocks();
  clearCursorModelCache();
  clearZedCaches();
  proxyAwareFetch.mockImplementation(async () => json({}));
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected non-fixture network request"); }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Literal publisher expectations: secondary-clients/{REPORT.md,survey.json}
// captures 2026-10-21. Keep real consumers below the network boundary so these
// catch stale headers, accidental desktop/SDK coupling and employee-only claims.
describe("secondary release identities at their outbound boundaries", () => {
  it("pairs Copilot token probes with the stable editor's bundled extension, retaining the token API date", async () => {
    proxyAwareFetch.mockImplementation(async () => json({ token: "fixture-copilot", expires_at: 9999999999 }));
    await new GithubExecutor().refreshCopilotToken("fixture-executor-token");
    await refreshCopilotToken("fixture-service-token");
    expect(captured()).toHaveLength(2);
    for (const request of captured()) {
      expect(request.headers.get("user-agent")).toBe("GitHubCopilotChat/0.71.0");
      expect(request.headers.get("editor-version")).toBe("vscode/1.143.0");
      expect(request.headers.get("editor-plugin-version")).toBe("copilot-chat/0.71.0");
      expect(request.headers.get("x-github-api-version")).toBe("2025-04-01");
    }
  });

  it("builds Cursor's stable public identity with the verified Connect SDK and unchanged checksum cipher", () => {
    vi.spyOn(Date, "now").mockReturnValue(0);
    const headers = new Headers(new CursorExecutor().buildHeaders({ accessToken: "fixture-token", providerSpecificData: { machineId: "caller-machine", ghostMode: false } }));
    expect(headers.get("x-cursor-client-version")).toBe("3.24.18");
    expect(headers.get("user-agent")).toBe("connect-es/1.6.1");
    expect(headers.get("authorization")).toBe("Bearer fixture-token");
    expect(headers.get("x-cursor-checksum")).toBe("paaoq6-0caller-machine");
    expect(headers.get("x-ghost-mode")).toBe("false");
    expect(headers.get("x-cursor-client-type")).toBe("ide");
    expect(headers.get("x-cursor-client-device-type")).toBe("desktop");
  });

  it("does not fabricate Cursor's Anysphere-only commit identity for an ordinary account", () => {
    const headers = new Headers(new CursorExecutor().buildHeaders({ accessToken: "fixture-token", providerSpecificData: { machineId: "caller-machine" } }));
    expect(headers.has("x-cursor-client-commit")).toBe(false);
    expect(headers.has("x-cursor-canary")).toBe(false);
    expect(() => new CursorExecutor().buildHeaders({ accessToken: "fixture-token" })).toThrow("Machine ID is required");
  });

  it("uses the same public Cursor identity for real proxied model discovery", async () => {
    // GetUsableModelsResponse.models[0].model_id = "m" (unframed protobuf).
    proxyAwareFetch.mockResolvedValue(new Response(new Uint8Array([10, 3, 10, 1, 109])));
    const result = await resolveCursorModels({ accessToken: "fixture-cursor-token", providerSpecificData: { machineId: "caller-machine" } }, { forceRefresh: true, proxyOptions: { strictProxy: true } });
    expect(result).toEqual({ models: [{ id: "m", name: "m" }] });
    const request = lastRequest();
    expect(new URL(request.url).pathname).toBe("/agent.v1.AgentService/GetUsableModels");
    expect(request.headers.get("x-cursor-client-version")).toBe("3.24.18");
    expect(request.headers.get("user-agent")).toBe("connect-es/1.6.1");
    expect(request.headers.has("x-cursor-client-commit")).toBe(false);
    expect(request.headers.get("authorization")).toBe("Bearer fixture-cursor-token");
  });

  it("updates Kiro's catalog IDE identity without guessing a new SDK, Node or host fingerprint", async () => {
    proxyAwareFetch.mockResolvedValue(json({ models: [{ modelId: "fixture-model", modelName: "Fixture" }] }));
    const result = await resolveKiroModels({ accessToken: "fixture-kiro-token", providerSpecificData: { clientId: "caller-client-id" } }, { forceRefresh: true });
    expect(result.models).toContainEqual(expect.objectContaining({ id: "fixture-model" }));
    const request = lastRequest();
    expect(request.headers.get("user-agent")).toBe("aws-sdk-js/3.0.0 ua/2.1 os/windows#10.0.26200 lang/js md/nodejs#22.21.1 api/codewhispererruntime#3.0.0 m/N,E KiroIDE-1.4.13-c9030f14ac6eaa0395ffcf3800da77134fca403280eb3b6c5f28569b5ba4e939");
    expect(request.headers.get("x-amz-user-agent")).toBe("aws-sdk-js/3.0.0 KiroIDE-1.4.13-c9030f14ac6eaa0395ffcf3800da77134fca403280eb3b6c5f28569b5ba4e939");
    expect(request.headers.get("authorization")).toBe("Bearer fixture-kiro-token");
    const runtime = new Headers(new DefaultExecutor("kiro").buildHeaders({ accessToken: "fixture-kiro-token" }));
    expect(runtime.get("user-agent")).toBe("AWS-SDK-JS/3.0.0 kiro-ide/1.4.13");
    expect(runtime.get("x-amz-user-agent")).toBe("aws-sdk-js/3.0.0 KiroIDE-1.4.13");
  });

  it("pairs Grok's stable runtime and catalog release while preserving its native output cap", async () => {
    await new GrokCliExecutor().execute({ model: "grok-build", body: { input: [{ role: "user", content: "fixture" }], max_output_tokens: 37 }, stream: true, credentials: { accessToken: "fixture-grok-token", providerSpecificData: { deviceId: "caller-device" } } });
    const runtime = lastRequest();
    expect(runtime.headers.get("user-agent")).toBe("grok-pager/1.0.62 grok-shell/1.0.62 (linux; x86_64)");
    expect(runtime.headers.get("x-grok-client-version")).toBe("1.0.62");
    expect(runtime.headers.get("x-grok-client-identifier")).toBe("grok-shell");
    expect(JSON.parse(runtime.body).max_output_tokens).toBe(37);
    proxyAwareFetch.mockResolvedValue(json({ models: [{ id: "fixture-model" }] }));
    expect((await resolveGrokCliModels({ accessToken: "fixture-grok-token" })).models).toContainEqual(expect.objectContaining({ id: "fixture-model" }));
    expect(lastRequest().headers.get("user-agent")).toBe("grok-pager/1.0.62 grok-shell/1.0.62 (linux; x86_64)");
    expect(lastRequest().headers.get("x-grok-client-version")).toBe("1.0.62");
  });

  it("uses Grok's stable release for the OAuth profile and billing probes without asserting paid access", async () => {
    fetch.mockResolvedValue(json({ userId: "fixture-user" }));
    await grokOAuth.postExchange({ access_token: "fixture-grok-token" });
    const oauthHeaders = new Headers(fetch.mock.calls[0][1].headers);
    expect(oauthHeaders.get("user-agent")).toBe("grok-pager/1.0.62 grok-shell/1.0.62 (linux; x86_64)");
    expect(oauthHeaders.get("x-grok-client-version")).toBe("1.0.62");
    proxyAwareFetch.mockImplementation(async (url) => url.includes("/billing") ? json({ config: { creditUsagePercent: 25 } }) : json({ userId: "fixture-user" }));
    await getGrokCliUsage("fixture-grok-token");
    const billing = captured().find(request => new URL(request.url).pathname === "/v1/billing");
    expect(billing.headers.get("user-agent")).toBe("grok-pager/1.0.62 grok-shell/1.0.62 (linux; x86_64)");
    expect(billing.headers.get("x-grok-client-version")).toBe("1.0.62");
    expect(billing.headers.get("authorization")).toBe("Bearer fixture-grok-token");
  });

  it("serializes separate Windsurf desktop and extension identities without changing the existing metadata layout", async () => {
    proxyAwareFetch.mockResolvedValue(new Response("fixture rejection", { status: 400 }));
    await new WindsurfExecutor().execute({ model: "fixture-model", body: { messages: [{ role: "user", content: "fixture" }] }, stream: true, credentials: { accessToken: "fixture-windsurf-token" } });
    const request = lastRequest();
    const envelope = decodeMessage(request.body.subarray(5));
    const metadata = decodeMessage(envelope.get(1)[0].value);
    // Identity-only characterization of the current serializer. These field
    // numbers are NOT a claim of parity with the modern publisher descriptor.
    expect(stringField(metadata, 4)).toBe("1.48.2");
    expect([...metadata.keys()]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(stringField(metadata, 1)).toBe("fixture-windsurf-token");
    expect(stringField(metadata, 2)).toBe("windsurf");
    expect(stringField(metadata, 3)).toBe("3.10.67");
    expect(stringField(metadata, 5)).toMatch(/^[0-9a-f-]{36}$/);
    expect(stringField(metadata, 6)).toBe("en-US");
    expect(request.headers.get("user-agent")).toBe("windsurf/3.10.67");
    expect(request.headers.get("authorization")).toBe("Bearer fixture-windsurf-token");
    expect(PROVIDERS.windsurf).toBeUndefined();
  });

  it.each([[undefined, "1.24.4"], ["caller-app-version", "caller-app-version"]])("sends Zed's release fallback without overwriting configured appVersion %s", async (override, expected) => {
    proxyAwareFetch.mockImplementation(async (url) => {
      if (url.endsWith("/client/llm_tokens")) return json({ token: "fixture-llm-token" });
      if (url.endsWith("/models")) return json({ models: [{ id: "fixture-grok", provider: "XAi" }] });
      if (url.endsWith("/completions")) return new Response("fixture rejection", { status: 400 });
      throw new Error(`Unexpected fixture URL: ${url}`);
    });
    const executor = new ZedExecutor();
    executor.config = { appVersion: override };
    await executor.execute({ model: "fixture-grok", body: { messages: [{ role: "user", content: "fixture" }] }, stream: false, credentials: { accessToken: "fixture-zed-token", providerSpecificData: { userId: "fixture-user", organizationId: "fixture-org" } } });
    const request = lastRequest();
    expect(request.url).toBe("https://cloud.zed.dev/completions");
    expect(request.headers.get("x-zed-version")).toBe(expected);
    expect(request.headers.get("user-agent")).toBe("kitsunerouter/zed");
    expect(request.headers.get("authorization")).toBe("Bearer fixture-llm-token");
  });

  it.each([[{}, "opencode/1.19.3"], [{ "user-agent": "opencode/9.8.7", "x-opencode-client": "caller-cli", "x-opencode-project": "caller-project" }, "opencode/9.8.7"]])("updates OpenCode's fallback while preserving real downstream identity %j", async (rawHeaders, expected) => {
    await new OpenCodeExecutor().execute({ model: "fixture-model", body: { messages: [{ role: "user", content: "fixture" }], max_tokens: 37 }, stream: false, credentials: { rawHeaders, connectionId: "fixture-opencode" } });
    const request = lastRequest();
    expect(request.headers.get("user-agent")).toBe(expected);
    expect(request.headers.get("x-opencode-session")).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    expect(request.headers.get("x-opencode-session-id")).toBe(request.headers.get("x-opencode-session"));
    expect(request.headers.get("x-opencode-client")).toBe(rawHeaders["x-opencode-client"] || "desktop");
    expect(request.headers.get("x-opencode-project")).toBe(rawHeaders["x-opencode-project"] || "global");
    expect(JSON.parse(request.body).max_tokens).toBe(37);
  });

  it("updates Qoder's PAT discovery UA without co-bumping the independent COSY protocol pin", async () => {
    proxyAwareFetch.mockImplementation(async (url) => url.endsWith("/jobToken/exchange") ? json({ token: "jt-fixture-job", expires_in: 3600 }) : json({ id: "fixture-user" }));
    const result = await resolveQoderCredentials({ accessToken: "pt-secondary-refresh-fixture" });
    expect(result.accessToken).toBe("jt-fixture-job");
    expect(result.providerSpecificData.userId).toBe("fixture-user");
    const requests = captured();
    expect(requests).toHaveLength(2);
    expect(requests[0].headers.get("user-agent")).toBe("qodercli/1.1.75");
    expect(requests[0].headers.get("cosy-version")).toBe("1.0.0");
    expect(requests[0].headers.get("cosy-clienttype")).toBe("5");
    expect(JSON.parse(requests[0].body)).toEqual({ personal_token: "pt-secondary-refresh-fixture" });
    expect(requests[1].headers.get("user-agent")).toBe("qodercli/1.1.75");
    expect(requests[1].headers.get("authorization")).toBe("Bearer jt-fixture-job");
  });

  it.each([[{}, "3.6.4"], [{ appVersion: "caller-version" }, "caller-version"]])("updates only Trae's inactive source fallback, respecting appVersion %j", async (specific, expected) => {
    proxyAwareFetch.mockResolvedValue(json({ code: 0, data: { chat_session_id: "fixture-session", message_id: "fixture-message" } }));
    const executor = new TraeExecutor();
    executor.config = {}; // Exercise inactive serializer, not provider activation.
    await executor.createSession(executor.buildHeaders({ accessToken: "fixture-trae-token" }), "fixture", "fixture-model", specific);
    const request = lastRequest();
    const commonParams = JSON.parse(JSON.parse(request.body).initial_message.common_params);
    expect(commonParams.app_version).toBe(expected);
    expect(request.headers.get("authorization")).toBe("Cloud-IDE-JWT fixture-trae-token");
    expect(PROVIDERS.trae).toBeUndefined();
  });
});
