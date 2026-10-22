import { describe, expect, it } from "vitest";
import { normalizeQuotasToSnapshot } from "../../src/sse/services/quotaAwareSelection.js";

describe("effective exhausted quota reset", () => {
  it("waits for every exhausted blocking window and ignores malformed deadlines", () => {
    const snapshot = normalizeQuotasToSnapshot("claude", { quotas: {
      "session (5h)": { remaining: 20, total: 100 },
      weekly: { remaining: 0, total: 100, resetAt: "2026-11-01T00:00:00Z" },
      monthly: { remaining: 0, total: 100, resetAt: "2026-12-01T00:00:00Z" },
      malformed: { remaining: 0, total: 100, resetAt: "soon" },
    } });
    expect(snapshot.blockingExhausted).toBe(true);
    expect(snapshot.blockingResetAt).toBe("2026-12-01T00:00:00Z");
  });
});
