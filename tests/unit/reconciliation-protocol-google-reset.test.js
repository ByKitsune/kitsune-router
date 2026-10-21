import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseUpstreamError } from "../../open-sse/utils/error.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";

// Upstream candidate a07ed95beae8ce295907082220c386e8e7db138b was
// untyped/unbounded. ProtoJSON types are pinned to googleapis/googleapis
// ebd1d23ac613b177828dad42ad8dfb13ba498279 google/rpc/error_details.proto.
// quotaResetTimeStamp is provider metadata, not a protobuf Timestamp field.
const now = Date.parse("2026-10-21T00:00:00Z");
const executor = new AntigravityExecutor();
const timestamp = (value = "2026-10-21T01:30:00Z", extra = {}) => ({
  "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "QUOTA_EXHAUSTED", domain: "cloudcode-pa.googleapis.com",
  metadata: { quotaResetTimeStamp: value }, ...extra,
});
const retry = (value = "31.125s", extra = {}) => ({ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: value, ...extra });
const response = (details, status = 429, extra = {}) => Response.json({ error: { code: status, status: status === 409 ? "ABORTED" : "RESOURCE_EXHAUSTED", message: "Resource exhausted", details, ...extra } }, { status });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); });

describe("Antigravity structured reset metadata through public error parsing", () => {
  it.each([403, 409, 429])("preserves typed ErrorInfo reset instants on HTTP %i without serializing private metadata", async status => {
    const parsed = await parseUpstreamError(response([timestamp(undefined, { metadata: { quotaResetTimeStamp: "2026-10-21T01:30:00Z", secret: "private-reset-fixture" } })], status), executor);
    expect(parsed).toMatchObject({ statusCode: status, resetsAtMs: now + 5400000, resetsAtSource: "google.rpc.ErrorInfo.metadata.quotaResetTimeStamp" });
    expect(JSON.stringify(parsed)).not.toContain("private-reset-fixture");
  });

  it("decodes a complete ProtoJSON fractional Duration, rounded up to avoid an early retry", async () => {
    const parsed = await parseUpstreamError(response([retry("31.123456789s")]), executor);
    expect(parsed.resetsAtMs).toBe(now + 31124);
    expect(parsed.resetsAtSource).toBe("google.rpc.RetryInfo.retryDelay");
  });

  it("prefers a valid absolute quota reset independent of detail ordering", async () => {
    for (const details of [[retry(), timestamp()], [timestamp(), retry()]]) {
      expect((await parseUpstreamError(response(details), executor)).resetsAtMs).toBe(now + 5400000);
    }
  });

  it.each([
    { details: [timestamp("2026-11-01T00:00:00Z")] }, { details: [retry("315576000000s")] },
  ])("bounds new structured hints to six hours without uncapping quota policy: %j", async ({ details }) => {
    const parsed = await parseUpstreamError(response(details), executor);
    expect(parsed.resetsAtMs).toBe(now + 21600000);
  });

  it.each([
    "31 seconds", "31s trailing", "31", 31, { seconds: "31", nanos: 0 },
    "-1s", "0s", "1e9s", "Infinitys", "1.1234567890s", " 31s", "+31s", "01s",
  ])("ignores malformed or unsupported retryDelay %j", async value => {
    expect((await parseUpstreamError(response([retry(value)]), executor)).resetsAtMs).toBeFalsy();
  });

  it.each([
    "2026-10-20T23:59:59Z", "2026-10-21 01:30:00", "2026-02-30T01:30:00Z", "2026-10-21T24:00:00Z",
    "2026-10-21T01:30:00Z junk", 1792546200000, {}, null,
  ])("ignores expired/non-RFC3339 quota timestamps %j", async value => {
    expect((await parseUpstreamError(response([timestamp(value)]), executor)).resetsAtMs).toBeFalsy();
  });

  it.each([
    timestamp(undefined, { "@type": "type.example/google.rpc.ErrorInfo" }),
    timestamp(undefined, { "@type": undefined }),
    timestamp(undefined, { domain: "example.test" }),
    timestamp(undefined, { reason: "ACCESS_DENIED" }),
    retry(undefined, { "@type": "type.googleapis.com/google.rpc.DebugInfo" }),
    { details: [retry()] },
  ])("does not mine quota-looking keys from untrusted or unrelated details %j", async detail => {
    expect((await parseUpstreamError(response([detail]), executor)).resetsAtMs).toBeFalsy();
  });

  it.each([400, 401, 404, 422, 499])("never adds quota cooldown to HTTP %i request/auth/cancellation errors", async status => {
    expect((await parseUpstreamError(response([timestamp(), retry()], status), executor)).resetsAtMs).toBeFalsy();
  });

  it("requires the Antigravity executor as well as the typed Google envelope", async () => {
    for (const provider of [null, new DefaultExecutor("openai")]) {
      expect((await parseUpstreamError(response([timestamp(), retry()]), provider)).resetsAtMs).toBeFalsy();
    }
    expect((await parseUpstreamError(response([timestamp(), retry()], 403, { status: "PERMISSION_DENIED" }), executor)).resetsAtMs).toBeFalsy();
  });

  it("retains legacy header and provider-specific reset precedence instead of globally recapping trusted windows", async () => {
    const headers = response([timestamp()]);
    headers.headers.set("retry-after", "120");
    expect((await parseUpstreamError(headers, executor)).resetsAtMs).toBe(now + 120000);
    const trustedReset = now + 7 * 86400000;
    expect((await parseUpstreamError(response([]), { provider: "codex", parseError: () => ({ status: 429, message: "Quota exhausted", resetsAtMs: trustedReset }) })).resetsAtMs).toBe(trustedReset);
  });

  it("uses a valid typed RetryInfo if a quota timestamp is invalid rather than parsing its numeric prefix", async () => {
    const parsed = await parseUpstreamError(response([timestamp("2026-10-21T01:30:00Z trailing"), retry("0.000000001s")]), executor);
    expect(parsed.resetsAtMs).toBe(now + 1);
    expect(parsed.resetsAtSource).toBe("google.rpc.RetryInfo.retryDelay");
  });

  it("does not attach quota reset metadata to a mismatched numeric error code", async () => {
    const parsed = await parseUpstreamError(response([timestamp(), retry()], 429, { code: 403 }), executor);
    expect(parsed.resetsAtMs).toBeFalsy();
  });

  it("does not leak structured metadata through the legacy Antigravity message expansion when a reset header exists", async () => {
    const upstream = response([timestamp(undefined, { metadata: { quotaResetTimeStamp: "2026-10-21T01:30:00Z", secret: "private-reset-fixture" } })]);
    upstream.headers.set("retry-after", "120");
    const parsed = await parseUpstreamError(upstream, executor);
    expect(parsed.resetsAtMs).toBe(now + 120000);
    expect(parsed.message).toBe("Resource exhausted");
    expect(JSON.stringify(parsed)).not.toContain("private-reset-fixture");
  });

  it.each([403, 503])("retains a generic HTTP %i Retry-After even when an executor has no custom reset parser", async status => {
    const upstream = Response.json({ error: { message: "Temporarily unavailable" } }, { status, headers: { "retry-after": "60" } });
    const parsed = await parseUpstreamError(upstream, new DefaultExecutor("gemini"));
    expect(parsed.resetsAtMs).toBe(now + 60000);
  });
});
