import { beforeEach, describe, expect, it, vi } from "vitest";
import { GROK_CLI_VERSION } from "../../open-sse/config/clientVersions.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";

vi.mock("../../open-sse/services/oauthCredentialManager.js", () => ({
  refreshProviderCredentials: vi.fn(),
}));

import { refreshProviderCredentials } from "../../open-sse/services/oauthCredentialManager.js";
import {
  parseGrokCliModels,
  resolveGrokCliModels,
} from "../../open-sse/services/grokCliModels.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Grok CLI live models", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves explicitly supplied live model limits without treating fixtures as official caps", () => {
    expect(parseGrokCliModels({
      models: [{
        model_id: "grok-build",
        display_name: "Grok Build",
        context_window: 500000,
        max_output_tokens: 64000,
        supported_in_api: false,
      }],
    })).toEqual([
      expect.objectContaining({
        id: "grok-build",
        name: "Grok Build",
        contextLength: 500000,
        maxOutputTokens: 64000,
        supported_in_api: false,
      }),
    ]);
  });

  it("refreshes and retries through selected proxy", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "grok-build" }] }));
    const onCredentialsRefreshed = vi.fn();
    const proxyOptions = {
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://proxy.test:8080",
      strictProxy: true,
    };
    refreshProviderCredentials.mockResolvedValue({ accessToken: "new-token" });

    const result = await resolveGrokCliModels({
      accessToken: "old-token",
      refreshToken: "refresh-token",
      providerSpecificData: { email: "user@example.com" },
    }, { fetchFn, proxyOptions, onCredentialsRefreshed });

    // An ID-only live response does not establish any numeric route limits.
    expect(result.models).toEqual([{ id: "grok-build", name: "grok-build" }]);
    expect(result.models[0]).not.toHaveProperty("contextLength");
    expect(result.models[0]).not.toHaveProperty("maxOutputTokens");
    const metadata = getReviewedModelMetadata("grok-cli", "grok-build");
    expect(metadata.sources).toEqual(["https://docs.x.ai/build/overview"]);
    expect(metadata.limits).toMatchObject({
      idKind: "cli-route-alias", authenticatedRouteVerified: false,
      routeContextWindow: null, routeMaxOutput: null,
      unverifiedCapabilityFields: ["contextWindow", "maxOutput"],
    });
    expect(refreshProviderCredentials).toHaveBeenCalledWith(
      "grok-cli",
      expect.any(Object),
      expect.anything(),
      proxyOptions,
      expect.any(AbortSignal),
    );
    expect(onCredentialsRefreshed).toHaveBeenCalledWith({ accessToken: "new-token" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][2]).toEqual(proxyOptions);
    expect(Object.isFrozen(fetchFn.mock.calls[0][2])).toBe(true);
    expect(fetchFn.mock.calls[1][1].headers.Authorization).toBe("Bearer new-token");
    expect(fetchFn.mock.calls[1][1].headers["x-grok-client-version"]).toBe(GROK_CLI_VERSION);
  });
});
