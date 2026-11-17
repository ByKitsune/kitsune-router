import { afterEach, describe, expect, it, vi } from "vitest";
import { createErrorResult, parseUpstreamError } from "../../open-sse/utils/error.js";

const now = Date.parse("2026-11-18T02:00:00Z");
const free = { type: "error", error: { type: "FreeUsageLimitError", message: "Rate limit exceeded. Please try again later." } };
const parse = (provider, body, headers = {}, status = 429) => parseUpstreamError(
  new Response(JSON.stringify(body), { status, headers }), { provider },
);

afterEach(() => vi.restoreAllMocks());

describe("OpenCode upstream rate limits and quota", () => {
  it.each(["", "-1", "1e6", "2000junk", "99999999999999999999999"])("uses Retry-After if retry-after-ms is invalid (%j)", async (invalid) => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const result = await parse("opencode", free, { "retry-after-ms": invalid, "retry-after": "60" });
    expect(result).toMatchObject({ statusCode: 429, code: "free_usage_limit", resetsAtMs: now + 60_000 });
    const { response } = createErrorResult(result.statusCode, result.message, result.resetsAtMs, result);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect((await response.json()).error).toMatchObject({ type: "rate_limit_error", code: "free_usage_limit" });
  });

  it("keeps a valid milliseconds delay and supports a standard HTTP date", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const retryDate = new Date(now + 30_000).toUTCString();
    expect(await parse("opencode", free, { "retry-after-ms": "1500", "retry-after": retryDate })).toHaveProperty("resetsAtMs", now + 1500);
    expect(await parse("opencode", free, { "retry-after": retryDate })).toHaveProperty("resetsAtMs", now + 30_000);
  });

  it("retains distinct plan and model budget refusals without inventing a reset", async () => {
    const plan = await parse("opencode-go", { error: { type: "GoUsageLimitError" }, metadata: { limitName: "5 hour" } });
    expect(plan).toMatchObject({ code: "plan_usage_limit", resetsAtMs: null });
    expect(plan.message).toContain("5-hour plan");
    expect(createErrorResult(plan.statusCode, plan.message, plan.resetsAtMs, plan).response.headers.get("Retry-After")).toBeNull();
    const modelBudget = await parse("opencode-zen", { error: { type: "BudgetLimitError" }, metadata: { coverage: "models" } });
    expect(modelBudget).toMatchObject({ code: "model_budget_limit", resetsAtMs: null });
  });

  it("accepts the authenticated Google protocol's structured workspace budget deadline", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const reset = "2026-12-01T00:00:00.000Z";
    const detail = {
      "@type": "type.googleapis.com/google.rpc.ErrorInfo",
      domain: "opencode.ai",
      reason: "BudgetLimitError",
      metadata: { coverage: "all", resetsAt: reset },
    };
    const payload = { error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [detail] } };
    expect(await parse("opencode-zen", payload)).toMatchObject({ code: "workspace_budget_limit", resetsAtMs: Date.parse(reset) });
    detail.domain = "different.example";
    expect(await parse("opencode-zen", payload)).not.toHaveProperty("code", "workspace_budget_limit");
  });

  it("treats generic 429s as throttles, and scopes quota types to the OpenCode transports", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const throttle = await parse("opencode-zen", { error: { type: "server_error", message: "Upstream rate limit exceeded." } }, { "retry-after-ms": "3000" });
    expect(throttle).toMatchObject({ type: "server_error", resetsAtMs: now + 3000 });
    expect(throttle.code).toBeUndefined();
    expect(await parse("openai", free)).not.toHaveProperty("code", "free_usage_limit");
    expect(await parse("opencode-zen", { error: { type: "CreditLimitExceeded" } }, {}, 402)).toMatchObject({ code: "insufficient_credits" });
  });
});
