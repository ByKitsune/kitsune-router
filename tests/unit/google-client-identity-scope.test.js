import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { GeminiCLIExecutor } from "../../open-sse/executors/gemini-cli.js";
import { GEMINI_AUTH_USER_AGENT, GEMINI_CLI_VERSION } from "../../open-sse/config/clientVersions.js";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

const credentials = { accessToken: "synthetic-google-token", projectId: "synthetic-project" };
const request = () => ({ contents: [{ role: "user", parts: [{ text: "synthetic prompt" }] }] });

beforeEach(() => {
  vi.clearAllMocks();
  proxyAwareFetch.mockImplementation(async () => new Response("{}", { headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No provider request is permitted in this fixture"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("Gemini CLI identity belongs to the prepared request", () => {
  it("uses the explicit model when another request has since been prepared on the same executor", () => {
    const executor = new GeminiCLIExecutor();
    const firstModel = "gemini-3.8-flash";
    const first = executor.transformRequest(firstModel, request(), false, credentials);
    executor.transformRequest("gemini-3.1-pro-preview-customtools", request(), false, credentials);
    const headers = executor.buildHeaders(credentials, false, executor.buildUrl(firstModel, false), firstModel, first);
    expect(headers["User-Agent"]).toContain(`GeminiCLI/${GEMINI_CLI_VERSION}/${firstModel} (`);
    expect(headers["User-Agent"]).toContain(GEMINI_AUTH_USER_AGENT);
    expect(headers.Authorization).toBe(`Bearer ${credentials.accessToken}`);
  });

  it("does not infer an omitted model from the last prepared request", () => {
    const executor = new GeminiCLIExecutor();
    executor.transformRequest("gemini-3.8-flash", request(), true, credentials);
    expect(executor.buildHeaders(credentials)["User-Agent"]).toContain(`GeminiCLI/${GEMINI_CLI_VERSION}/unknown (`);
  });

  it("keeps distinct model and account identities on actual concurrent native fetch calls", async () => {
    const executor = new GeminiCLIExecutor();
    const models = ["gemini-3.8-flash", "gemini-3.1-pro-preview-customtools"];
    await Promise.all(models.map((model, index) => executor.execute({
      model, body: request(), stream: index === 0,
      credentials: { ...credentials, accessToken: `synthetic-google-${index}`, projectId: `synthetic-project-${index}` },
    })));
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
    for (const [index, [url, options]] of proxyAwareFetch.mock.calls.entries()) {
      const body = JSON.parse(options.body);
      expect(url).toBe(`https://cloudcode-pa.googleapis.com/v1internal:${index === 0 ? "streamGenerateContent?alt=sse" : "generateContent"}`);
      expect(body).toMatchObject({ model: models[index], project: `synthetic-project-${index}` });
      const headers = new Headers(options.headers);
      expect(headers.get("authorization")).toBe(`Bearer synthetic-google-${index}`);
      expect(headers.get("user-agent")).toContain(`GeminiCLI/${GEMINI_CLI_VERSION}/${body.model} (`);
      expect(headers.get("user-agent")).toContain(GEMINI_AUTH_USER_AGENT);
      expect(headers.has("x-goog-api-key")).toBe(false);
    }
  });
});
