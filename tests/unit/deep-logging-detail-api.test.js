import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ details: vi.fn() }));
vi.mock("@/lib/usageDb", () => ({ getRequestDetails: calls.details }));

beforeEach(() => {
  calls.details.mockReset();
  calls.details.mockResolvedValue({ details: [{ id: "historical", model: "safe-model", request: { messages: ["private history"] }, response: { secret: "private answer" }, tokens: { prompt_tokens: 0 } }], pagination: { page: 1 } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("request-detail API filter validation", () => {
  it.each(["page=1junk", "page=1.5", "page=0x10", "pageSize=50junk", "startDate=not-a-date", "endDate=not-a-date", "startDate=2026-11-18&endDate=2026-11-17"])("returns a caller error without querying on %s", async query => {
    const route = await import("@/app/api/usage/request-details/route.js");
    const response = await route.GET(new Request(`http://localhost/api/usage/request-details?${query}`));
    expect(response.status).toBe(400);
    expect(calls.details).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("retains documented defaults, filters, and historical payload redaction", async () => {
    const route = await import("@/app/api/usage/request-details/route.js");
    const response = await route.GET(new Request("http://localhost/api/usage/request-details?provider=synthetic-provider&startDate=2026-11-17"));
    expect(response.status).toBe(200);
    expect(calls.details).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20, provider: "synthetic-provider", startDate: "2026-11-17T00:00:00.000Z" }));
    const result = await response.json();
    expect(result.details[0]).toMatchObject({ model: "safe-model", request: { redacted: true }, response: { redacted: true }, tokens: { prompt_tokens: 0 } });
    expect(JSON.stringify(result)).not.toContain("private");
  });
});
