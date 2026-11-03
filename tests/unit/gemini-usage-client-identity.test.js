import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { getGeminiUsage } from "../../open-sse/services/usage/google.js";
import { GEMINI_AUTH_USER_AGENT, GEMINI_CLI_API_CLIENT } from "../../open-sse/config/clientVersions.js";
import { CLIENT_METADATA } from "../../open-sse/config/appConstants.js";

const response = body => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

describe("Gemini CLI usage client identity", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([true, false])("uses the reviewed auth/runtime metadata with a stored project: %s", async storedProject => {
    if (!storedProject) proxyAwareFetch.mockResolvedValueOnce(response({
      cloudaicompanionProject: { id: "account-project" }, currentTier: { name: "Pro" },
    }));
    proxyAwareFetch.mockResolvedValueOnce(response({
      buckets: [{ modelId: "synthetic-model", remainingFraction: 0.75 }],
    }));
    const proxy = { connectionProxyEnabled: true, connectionProxyUrl: "http://synthetic-proxy.invalid:8080", strictProxy: true };

    const result = await getGeminiUsage("synthetic-account-token", storedProject ? { projectId: "account-project" } : {}, proxy);

    expect(result.quotas["synthetic-model"].remainingPercentage).toBe(75);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(storedProject ? 1 : 2);
    for (const [url, options, policy] of proxyAwareFetch.mock.calls) {
      const headers = new Headers(options.headers);
      expect(headers.get("authorization")).toBe("Bearer synthetic-account-token");
      expect(headers.get("user-agent")).toBe(GEMINI_AUTH_USER_AGENT);
      expect(headers.get("x-goog-api-client")).toBe(GEMINI_CLI_API_CLIENT);
      expect(headers.get("content-type")).toBe("application/json");
      expect(headers.has("x-client-name")).toBe(false);
      expect(headers.has("x-client-version")).toBe(false);
      expect(policy).toBe(proxy);
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(options.body)).toEqual(url.endsWith(":loadCodeAssist")
        ? { metadata: CLIENT_METADATA } : { project: "account-project" });
    }
  });

  it("does not issue metadata requests without an account token", async () => {
    expect((await getGeminiUsage("", {})).message).toContain("access token not available");
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });
});
