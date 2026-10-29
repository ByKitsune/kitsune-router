import { describe, expect, it } from "vitest";
import { aggregateComboCapabilities } from "../../open-sse/providers/capabilities.js";
import { parseGrokCliModels } from "../../open-sse/services/grokCliModels.js";

describe("unknown limits are not silently made numeric", () => {
  it("does not turn a member's unknown context/output into zero or a guaranteed maximum", () => {
    const result = aggregateComboCapabilities(["fixture/a", "fixture/b"], null, id => id.endsWith("/a")
      ? { contextWindow: 1000000, maxOutput: 128000 }
      : { contextWindow: null, maxOutput: null });
    expect(result.contextWindow).toBeNull();
    expect(result.maxOutput).toBeNull();
  });
  it("uses a conservative cap supported by every member when all limits are known", () => {
    const result = aggregateComboCapabilities(["fixture/a", "fixture/b"], null, id => id.endsWith("/a")
      ? { contextWindow: 1000000, maxOutput: 128000 }
      : { contextWindow: 200000, maxOutput: 32000 });
    expect(result.contextWindow).toBe(200000);
    expect(result.maxOutput).toBe(32000);
  });
  it("never fabricates limits for an ID-only live Grok Build row", () => {
    expect(parseGrokCliModels({ models: [{ id: "grok-build" }] })).toEqual([{ id: "grok-build", name: "grok-build" }]);
  });
  it("retains explicit live limits when Grok returns them", () => {
    expect(parseGrokCliModels({ models: [{ id: "grok-build", context_length: 345678, max_output_tokens: 12345 }] })[0])
      .toMatchObject({ contextLength: 345678, maxOutputTokens: 12345 });
  });
});
