import { describe, it, expect } from "vitest";
import { parseUpstreamError, withLocationGateHint } from "../../open-sse/utils/error.js";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";

const GOOGLE_MSG = "User location is not supported for the API use.";

// Google's Cloud Code Assist regional allowlist rejection (Antigravity/Gemini
// free tier) is decided from the server's egress IP — never from payload
// content. Kitsune Router must surface an actionable hint instead of a bare 400,
// WITHOUT changing the fail-fast / no-cooldown classification (accounts stay safe).
describe("Google location-gate error hint", () => {
  it("appends the hint to the exact Google message", () => {
    const out = withLocationGateHint(GOOGLE_MSG);
    expect(out).toContain(GOOGLE_MSG);
    expect(out).toContain("[Kitsune Router hint:");
    expect(out).toContain("proxy");
  });

  it("is idempotent (never double-appends)", () => {
    const once = withLocationGateHint(GOOGLE_MSG);
    expect(withLocationGateHint(once)).toBe(once);
  });

  it("passes through unrelated messages and non-strings untouched", () => {
    expect(withLocationGateHint("Request contains an invalid argument.")).toBe(
      "Request contains an invalid argument."
    );
    expect(withLocationGateHint("")).toBe("");
    expect(withLocationGateHint(null)).toBe(null);
    expect(withLocationGateHint(undefined)).toBe(undefined);
  });

  it("parseUpstreamError (generic path) carries the hint to clients", async () => {
    const res = new Response(
      JSON.stringify({ error: { code: 400, message: GOOGLE_MSG, status: "FAILED_PRECONDITION" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
    const parsed = await parseUpstreamError(res, null);
    expect(parsed.statusCode).toBe(400);
    expect(parsed.message).toContain(GOOGLE_MSG);
    expect(parsed.message).toContain("[Kitsune Router hint:");
  });

  it("parseUpstreamError (executor path) carries the hint too", async () => {
    const res = new Response("{}", { status: 400 });
    const fakeExecutor = { parseError: () => ({ message: GOOGLE_MSG, status: 400 }) };
    const parsed = await parseUpstreamError(res, fakeExecutor);
    expect(parsed.message).toContain("[Kitsune Router hint:");
  });

  it("does not hint other 400s", async () => {
    const res = new Response(
      JSON.stringify({ error: { code: 400, message: "Request contains an invalid argument." } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
    const parsed = await parseUpstreamError(res, null);
    expect(parsed.message).not.toContain("[Kitsune Router hint:");
  });

  it("hinted message keeps fail-fast classification (no fallback, no cooldown)", () => {
    const hinted = withLocationGateHint(GOOGLE_MSG);
    expect(checkFallbackError(400, hinted)).toEqual({ shouldFallback: false, cooldownMs: 0 });
  });
});
