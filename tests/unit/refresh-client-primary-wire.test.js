import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { arch, platform } from "node:os";

// Keep the production executors, registry and model route real. Only network,
// persisted connections and dashboard authentication are fixture boundaries.
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("@/lib/localDb", () => ({ getProviderConnectionById: vi.fn(), updateProviderConnection: vi.fn() }));
vi.mock("@/models", () => ({ getProviderConnectionById: vi.fn() }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: vi.fn(async () => ({})) }));
vi.mock("@/dashboardGuard", () => ({ hasValidCliToken: async () => true, isAuthenticated: async () => false }));

import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { CodexExecutor } from "../../open-sse/executors/codex.js";
import { GeminiCLIExecutor } from "../../open-sse/executors/gemini-cli.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { applyCloaking } from "../../open-sse/utils/claudeCloaking.js";
import codexImages from "../../open-sse/handlers/imageProviders/codex.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { getProviderConnectionById } from "@/models";
import { GET as getModels } from "../../src/app/api/providers/[id]/models/route.js";

const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const outbound = () => {
  const [url, options] = proxyAwareFetch.mock.calls.at(-1);
  return { url, ...options, headers: new Headers(options.headers) };
};

beforeEach(() => {
  vi.clearAllMocks();
  proxyAwareFetch.mockImplementation(async () => json({}));
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected non-fixture network request"); }));
});
afterEach(() => vi.unstubAllGlobals());

// Publisher captures 2026-10-31: Claude npm latest 2.1.314 (delayed stable
// 2.1.308), Codex rust-v0.166.0; Google expectations retain their own evidence.
// Literal expectations are
// independent of the constants under test. These catch stale wire identities,
// a separately stale catalog query, and accidental SDK/runtime co-bumps.
describe("refreshed primary client wire identities", () => {
  it("sends Claude's latest-channel release in both HTTP and billing identities without changing the native payload", async () => {
    const body = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "fixture" }],
      system: [{ type: "text", text: "Keep the caller's instruction." }],
      metadata: { user_id: '{"session_id":"fixture-claude-session","caller":"preserved"}' },
      max_tokens: 37,
    };
    const expectedPayload = {
      ...structuredClone(body),
      system: [
        { type: "text", text: expect.stringMatching(/^x-anthropic-billing-header: cc_version=2\.1\.314\.[0-9a-f]{3}; cc_entrypoint=cli; cch=00000;$/) },
        { type: "text", text: "Keep the caller's instruction." },
      ],
    };
    const cloaked = applyCloaking(body, "sk-ant-oat-fixture", "fixture-claude-session");
    await new DefaultExecutor("claude").execute({
      model: "claude-sonnet-4-6", body: cloaked, stream: false,
      credentials: {
        accessToken: "fixture-claude-oauth",
        rawHeaders: { "x-claude-code-session-id": "caller-session", authorization: "Bearer must-not-forward" },
      },
    });
    const request = outbound();
    const payload = JSON.parse(request.body);
    expect(request.url).toBe("https://api.anthropic.com/v1/messages?beta=true");
    expect(request.headers.get("user-agent")).toBe("claude-cli/2.1.314 (external, sdk-cli)");
    expect(payload).toEqual(expectedPayload);
    expect(request.headers.get("authorization")).toBe("Bearer fixture-claude-oauth");
    expect(request.headers.get("x-claude-code-session-id")).toBe("caller-session");
    expect(request.headers.get("x-stainless-package-version")).toBe("0.128.0");
    expect(request.headers.get("x-stainless-runtime-version")).toBe(process.version);
    expect(request.headers.get("anthropic-beta")).not.toContain("timing-2026-09-09");
  });

  it("sends the stable Codex transport release while retaining the caller's account, session and Responses controls", async () => {
    const body = {
      model: "gpt-6.1-sol",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "fixture" }] }],
      instructions: "Follow the fixture.",
      reasoning: { effort: "high", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      prompt_cache_key: "caller-cache",
      service_tier: "default",
    };
    await new CodexExecutor().execute({
      model: "gpt-6.1-sol", body, stream: true,
      credentials: {
        accessToken: "fixture-codex-oauth", rawHeaders: { "x-session-id": "caller-session" },
        providerSpecificData: { workspaceId: "caller-workspace", chatgptAccountId: "fallback-account" },
      },
    });
    const request = outbound();
    expect(request.url).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect(request.headers.get("user-agent")).toBe("codex_cli_rs/0.166.0");
    expect(request.headers.get("version")).toBe("0.166.0");
    expect(request.headers.get("originator")).toBe("codex_cli_rs");
    expect(request.headers.get("chatgpt-account-id")).toBe("caller-workspace");
    expect(request.headers.get("authorization")).toBe("Bearer fixture-codex-oauth");
    expect(request.headers.get("session-id")).toBe("caller-session");
    expect(request.headers.get("session_id")).toBe("caller-session");
    expect(JSON.parse(request.body)).toEqual({
      model: "gpt-6.1-sol",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "fixture" }] }],
      instructions: "Follow the fixture.",
      reasoning: { effort: "high", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      prompt_cache_key: "caller-cache", stream: true, store: false,
    });
    expect(body.service_tier).toBe("default");
  });

  it("uses the same stable Codex release on the image header builder", () => {
    const headers = new Headers(codexImages.buildHeaders({ accessToken: "fixture-image-token", providerSpecificData: { chatgptAccountId: "fixture-image-account" } }));
    expect(headers.get("user-agent")).toBe("codex_cli_rs/0.166.0");
    expect(headers.get("version")).toBe("0.166.0");
    expect(headers.get("chatgpt-account-id")).toBe("fixture-image-account");
    expect(headers.get("authorization")).toBe("Bearer fixture-image-token");
  });

  it("pairs Codex's live catalog query version with the transport release", async () => {
    getProviderConnectionById.mockResolvedValue({ id: "fixture-codex", provider: "codex", accessToken: "fixture-codex-oauth" });
    proxyAwareFetch.mockResolvedValue(json({ models: [{ slug: "fixture-model", display_name: "Fixture model" }] }));
    const response = await getModels({ nextUrl: new URL("http://localhost/api/providers/fixture-codex/models?refresh=1") }, { params: Promise.resolve({ id: "fixture-codex" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).models).toContainEqual(expect.objectContaining({ id: "fixture-model" }));
    const request = outbound();
    expect(request.url).toBe("https://chatgpt.com/backend-api/codex/models?client_version=0.166.0");
    expect(request.method).toBe("GET");
    expect(request.headers.get("authorization")).toBe("Bearer fixture-codex-oauth");
    expect(request.headers.get("originator")).toBe("codex_cli_rs");
  });

  it("sends Gemini's stable CLI release with its tagged OAuth dependency, not an unrelated GenAI SDK", async () => {
    const body = {
      contents: [{ role: "user", parts: [{ text: "fixture" }] }],
      generationConfig: { maxOutputTokens: 37, thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
    };
    const expectedPayload = { project: "caller-project", model: "fixture-model", request: structuredClone(body) };
    await new GeminiCLIExecutor().execute({ model: "fixture-model", body, stream: false, credentials: { accessToken: "fixture-google-oauth", projectId: "caller-project" } });
    const request = outbound();
    expect(request.url).toBe("https://cloudcode-pa.googleapis.com/v1internal:generateContent");
    expect(request.headers.get("user-agent")).toBe(`GeminiCLI/0.66.0/fixture-model (${platform()}; ${arch() === "ia32" ? "x86" : arch()}; terminal) google-api-nodejs-client/10.9.0`);
    expect(request.headers.get("x-goog-api-client")).toBe(`gl-node/${process.version.replace(/^v/, "")}`);
    expect(request.headers.get("authorization")).toBe("Bearer fixture-google-oauth");
    expect(JSON.parse(request.body)).toEqual(expectedPayload);
  });
});

describe("unchanged primary client boundaries", () => {
  it("keeps caller-supplied Claude billing and metadata identities instead of stamping a new release over them", async () => {
    const body = {
      system: [{ type: "text", text: "x-anthropic-billing-header: caller-owned" }],
      metadata: { user_id: "caller-owned-metadata" },
      messages: [{ role: "user", content: "fixture" }], max_tokens: 37,
    };
    const expectedPayload = structuredClone(body);
    await new DefaultExecutor("claude").execute({ model: "claude-sonnet-4-6", body: applyCloaking(body, "sk-ant-oat-fixture"), stream: false, credentials: { accessToken: "fixture-claude-oauth" } });
    expect(JSON.parse(outbound().body)).toEqual(expectedPayload);
  });

  it("keeps Gemini catalog discovery on the OAuth auth-client identity and caller's project", async () => {
    getProviderConnectionById.mockResolvedValue({ id: "fixture-gemini", provider: "gemini-cli", accessToken: "fixture-google-oauth", projectId: "caller-project" });
    proxyAwareFetch.mockResolvedValue(json({ models: [{ id: "fixture-model" }] }));
    const response = await getModels({ nextUrl: new URL("http://localhost/api/providers/fixture-gemini/models?refresh=1") }, { params: Promise.resolve({ id: "fixture-gemini" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).models).toEqual([{ id: "fixture-model", name: "fixture-model", kind: "llm" }]);
    const request = outbound();
    expect(request.url).toBe("https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels");
    expect(request.headers.get("user-agent")).toBe("google-api-nodejs-client/10.9.0");
    expect(request.headers.get("x-goog-api-client")).toBe(`gl-node/${process.version.replace(/^v/, "")}`);
    expect(JSON.parse(request.body)).toEqual({ project: "caller-project" });
  });

  it("keeps Antigravity's working CLI CloudCode profile, explicit output cap and caller's provisioned project", async () => {
    const request = {
      contents: [{ role: "user", parts: [{ text: "fixture" }] }],
      generationConfig: { maxOutputTokens: 37, thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
      sessionId: "caller-antigravity-session",
    };
    const requestId = "agent/11111111-1111-4111-8111-111111111111/1/22222222-2222-4222-8222-222222222222/1";
    const expectedPayload = { project: "caller-project", model: "gemini-4-argon", userAgent: "antigravity", requestId, request: structuredClone(request) };
    await new AntigravityExecutor().execute({ model: "gemini-4-argon", body: { model: "gemini-4-argon", requestId, request }, stream: false, credentials: { accessToken: "fixture-antigravity-oauth", projectId: "caller-project" } });
    const captured = outbound();
    expect(captured.url).toBe("https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent");
    expect(captured.headers.get("user-agent")).toBe("antigravity/cli/1.4.0");
    expect(captured.headers.get("authorization")).toBe("Bearer fixture-antigravity-oauth");
    expect(captured.headers.has("x-goog-user-project")).toBe(false);
    expect(captured.headers.has("x-goog-api-client")).toBe(false);
    expect(JSON.parse(captured.body)).toEqual(expectedPayload);
  });

  it.each([
    ["Gemini", () => new GeminiCLIExecutor(), "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com"],
    ["Antigravity", () => new AntigravityExecutor(), "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"],
  ])("keeps %s refresh bound to its own OAuth client and original project", async (_name, executor, clientId) => {
    proxyAwareFetch.mockResolvedValue(json({ access_token: "fixture-refreshed", expires_in: 3600 }));
    const refreshed = await executor().refreshCredentials({ accessToken: "fixture-old", refreshToken: "fixture-refresh", projectId: "caller-project" });
    const request = outbound();
    expect(request.url).toBe("https://oauth2.googleapis.com/token");
    expect(request.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(request.body);
    expect(form.get("client_id")).toBe(clientId);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("fixture-refresh");
    expect(refreshed).toEqual({ accessToken: "fixture-refreshed", refreshToken: "fixture-refresh", expiresIn: 3600, projectId: "caller-project" });
  });

  it.each([
    ["Claude", () => new DefaultExecutor("claude"), "claude-sonnet-4-6"],
    ["Codex", () => new CodexExecutor(), "gpt-6.1-sol"],
    ["Gemini", () => new GeminiCLIExecutor(), "fixture-model"],
    ["Antigravity", () => new AntigravityExecutor(), "gemini-4-argon"],
  ])("does not dispatch %s after caller cancellation", async (_name, executor, model) => {
    const controller = new AbortController();
    const reason = new Error("fixture caller cancellation");
    controller.abort(reason);
    await expect(executor().execute({ model, body: {}, stream: false, credentials: { accessToken: "fixture-token" }, signal: controller.signal })).rejects.toBe(reason);
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });
});
