import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
vi.mock("../../open-sse/services/tokenRefresh.js", () => ({ refreshKiroToken: vi.fn() }));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { clearKiroModelCache, resolveKiroModels } from "../../open-sse/services/kiroModels.js";

const credentials = () => ({ accessToken: "synthetic-kiro-fact-proof" });
const response = models => proxyAwareFetch.mockImplementation(async () => Response.json({ models }));
const fetchModels = async models => { response(models); return (await resolveKiroModels(credentials())).models; };

beforeEach(() => { clearKiroModelCache(); vi.clearAllMocks(); });
afterEach(() => clearKiroModelCache());

describe("Kiro native catalog facts", () => {
  it("keeps native input and output ceilings separate without inventing a combined context window", async () => {
    const models = await fetchModels([{ modelId: "native-route", modelName: "Native route", tokenLimits: { maxInputTokens: 123456, maxOutputTokens: 7654 } }]);
    expect(models).toHaveLength(4);
    for (const model of models) {
      expect(model).toMatchObject({ maxInputTokens: 123456, maxOutputTokens: 7654, capabilities: { maxInput: 123456, maxOutput: 7654 } });
      expect(model).not.toHaveProperty("contextLength");
      expect(model.capabilities).not.toHaveProperty("contextWindow");
    }
  });

  it("leaves absent native limits unknown rather than fabricating 200k tokens", async () => {
    const models = await fetchModels([{ modelId: "native-route" }]);
    for (const model of models) {
      expect(model).not.toHaveProperty("contextLength");
      expect(model).not.toHaveProperty("maxInputTokens");
      expect(model).not.toHaveProperty("maxOutputTokens");
      expect(model.capabilities).not.toHaveProperty("contextWindow");
      expect(model.capabilities).not.toHaveProperty("maxInput");
      expect(model.capabilities).not.toHaveProperty("maxOutput");
    }
  });

  it.each([null, 0, -1, 1.5, "", true, [], {}, "NaN", "9007199254740992"])("does not publish malformed/nonpositive/unsafe native token limit %j", async value => {
    const models = await fetchModels([{ modelId: "native-route", tokenLimits: { maxInputTokens: value, maxOutputTokens: value } }]);
    for (const model of models) {
      expect(model).not.toHaveProperty("contextLength");
      expect(model).not.toHaveProperty("maxInputTokens");
      expect(model).not.toHaveProperty("maxOutputTokens");
      expect(model.capabilities).not.toHaveProperty("maxInput");
      expect(model.capabilities).not.toHaveProperty("maxOutput");
    }
  });

  it("accepts explicitly numeric native input/output strings independently", async () => {
    const [model] = await fetchModels([{ modelId: "native-route", tokenLimits: { maxInputTokens: "123456", maxOutputTokens: "7654" } }]);
    expect(model).toMatchObject({ maxInputTokens: 123456, maxOutputTokens: 7654, capabilities: { maxInput: 123456, maxOutput: 7654 } });
    expect(model).not.toHaveProperty("contextLength");
  });

  it("keeps literal native IDs and readable labels with spaces while ignoring malformed identifiers", async () => {
    const models = await fetchModels([
      { modelId: 123 }, { modelId: {} }, { modelId: [] }, { modelId: "    " },
      { id: "native model/with spaces", modelName: { invalid: "name" } },
      { modelId: "next-model", modelName: "Model Label With Spaces", description: "Native description" },
    ]);
    expect(models).toHaveLength(8);
    expect(models[0]).toMatchObject({ id: "native model/with spaces", name: "Kiro native model/with spaces", upstreamModelId: "native model/with spaces" });
    expect(models[4]).toMatchObject({ id: "next-model", name: "Kiro Model Label With Spaces", description: "Native description" });
  });

  it("does not invent 1x credit pricing when the native rate multiplier is absent", async () => {
    const models = await fetchModels([{ modelId: "native-route" }]);
    for (const model of models) expect(model).not.toHaveProperty("rateMultiplier");
  });

  it.each([null, "", true, -1, "NaN"])("does not publish malformed native credit multiplier %j", async rateMultiplier => {
    const models = await fetchModels([{ modelId: "native-route", rateMultiplier }]);
    for (const model of models) expect(model).not.toHaveProperty("rateMultiplier");
  });

  it.each([0, 0.25, "1.5"])("preserves explicit zero or fractional native credit multiplier %j", async rateMultiplier => {
    const models = await fetchModels([{ modelId: "native-route", rateMultiplier }]);
    for (const model of models) {
      expect(model.rateMultiplier).toBe(Number(rateMultiplier));
      expect(model.name).toContain(`(${Number(rateMultiplier)}x credit)`);
    }
  });
});
