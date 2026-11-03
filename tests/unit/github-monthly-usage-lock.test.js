import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isDeepStrictEqual } from "node:util";

const dbMocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  updateProviderConnection: vi.fn(),
}));

vi.mock("@/lib/localDb", () => dbMocks);
vi.mock("@/lib/network/connectionProxy", () => ({
  pickProxyPoolId: vi.fn(),
  resolveConnectionProxyConfig: vi.fn(),
}));
vi.mock("@/shared/constants/providers.js", () => ({
  FREE_PROVIDERS: {},
  resolveProviderId: (provider) => provider,
}));
vi.mock("@/sse/utils/logger.js", () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

const { markAccountUnavailable } = await import("../../src/sse/services/auth.js");

const diagnosticExpectations = {
  "locks the whole account until the next UTC month": [
    ["error", "❌ github [402]: You've reached your additional usage limit for your plan. Go to GitHub settings for details."],
  ],
  "keeps unrelated GitHub 402 errors model-scoped": [
    ["error", "❌ github [402]: Payment required"],
  ],
};

let expectedDiagnostics = [];
let diagnosticCalls = [];
let diagnosticSpies = [];

beforeEach(({ task }) => {
  expectedDiagnostics = diagnosticExpectations[task.name] || [];
  diagnosticCalls = [];
  diagnosticSpies = ["warn","error"].map(method => {
    const original = console[method].bind(console);
    return vi.spyOn(console, method).mockImplementation((...args) => {
      const call = [method, ...args];
      const expected = expectedDiagnostics[diagnosticCalls.length];
      diagnosticCalls.push(call);
      const matches = expected?.length === call.length && expected.every((value, index) =>
        typeof value?.asymmetricMatch === "function" ? value.asymmetricMatch(call[index]) : isDeepStrictEqual(value, call[index]));
      if (!matches) original(...args);
    });
  });
});

afterEach(() => {
  try {
    expect(diagnosticCalls, "console diagnostics must match this case exactly").toEqual(expectedDiagnostics);
  } finally {
    diagnosticSpies.forEach(spy => spy.mockRestore());
  }
});


beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getProviderConnections.mockResolvedValue([{
    id: "github-a",
    provider: "github",
    name: "github-a",
    backoffLevel: 4,
  }]);
});

describe("GitHub monthly usage exhaustion", () => {
  it("locks the whole account until the next UTC month", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T19:30:00.000Z"));

    try {
      await markAccountUnavailable(
        "github-a",
        402,
        "You've reached your additional usage limit for your plan. Go to GitHub settings for details.",
        "github",
        "claude-fable-5",
      );

      expect(dbMocks.updateProviderConnection).toHaveBeenCalledWith(
        "github-a",
        expect.objectContaining({
          modelLock___all: "2026-09-01T00:00:00.000Z",
          testStatus: "unavailable",
          errorCode: 402,
          backoffLevel: 0,
        }),
      );
      expect(dbMocks.updateProviderConnection.mock.calls[0][1])
        .not.toHaveProperty("modelLock_claude-fable-5");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps unrelated GitHub 402 errors model-scoped", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T19:30:00.000Z"));

    try {
      await markAccountUnavailable(
        "github-a",
        402,
        "Payment required",
        "github",
        "claude-fable-5",
      );

      expect(dbMocks.updateProviderConnection).toHaveBeenCalledWith(
        "github-a",
        expect.objectContaining({
          "modelLock_claude-fable-5": "2026-08-04T19:45:00.000Z",
        }),
      );
      expect(dbMocks.updateProviderConnection.mock.calls[0][1])
        .not.toHaveProperty("modelLock___all");
    } finally {
      vi.useRealTimers();
    }
  });
});
