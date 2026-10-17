import { describe, it, expect, vi, beforeEach } from "vitest";

const proxyAwareFetch = vi.fn(async (url, options) => {
  const headers = options.headers;
  const body = JSON.parse(options.body);
  const accepted = headers["User-Agent"] === "antigravity/cli/1.4.0"
    && headers["X-Client-Name"] === "antigravity"
    && headers["X-Client-Version"] === "1.4.0"
    && !headers["x-request-source"]
    && (!url.endsWith(":loadCodeAssist") || body.metadata?.clientVersion === "1.4.0");
  if (!accepted) return new Response("Client identity rejected", { status: 404 });
  const result = url.endsWith(":loadCodeAssist")
    ? { cloudaicompanionProject: "project-1", currentTier: { name: "Pro" } }
    : url.endsWith(":retrieveUserQuotaSummary")
      ? { groups: [{ displayName: "Gemini 4 Argon", buckets: [{ bucketId: "gemini-argon-wtu-weekly", remainingFraction: 0.98, window: "weekly" }] }] }
      : { models: { "gemini-3.8-flash-medium": { quotaInfo: { remainingFraction: 0.7 } } } };
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
});

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch,
}));

describe("Antigravity usage headers", () => {
  beforeEach(() => { proxyAwareFetch.mockClear(); });

  it("retrieves model and summary quota through the native CLI usage identity", async () => {
    const { getAntigravityUsage } = await import("../../open-sse/services/usage/google.js");

    const usage = await getAntigravityUsage("access-token", {});

    expect(usage.plan).toBe("Pro");
    expect(usage.quotas?.["gemini-3.8-flash-medium"]).toMatchObject({ remainingPercentage: 70 });
    expect(usage.quotas?.argon_weekly).toMatchObject({ remainingPercentage: 98 });
  });
});
