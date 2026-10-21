import { describe, expect, it } from "vitest";
import { getDefaultModel, getModelQuotaFamily, getModelUpstreamId, getProviderModels } from "../../open-sse/config/providerModels.js";
import { getModelInfoCore } from "../../open-sse/services/model.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { CodexExecutor } from "../../open-sse/executors/codex.js";

// Existing credential-redacted observations, not live calls:
// /tmp/opencode/zenrouter-production-20261021-04c0bf77/{native-codex-catalog,models-extra}.json
// The catalog endpoint augments its response with gateway review aliases; it
// is NOT raw proof of native -review wire IDs. Use the established alias contract.
describe("current Codex gateway review identities through routing", () => {
  it.each(["gpt-6.1-sol-review", "gpt-6-astra-review", "gpt-6-sol-review", "gpt-6-luna-review", "gpt-reserve-review"])("maps %s to its exact base ID with review quota", async model => {
    const upstream = model.slice(0, -"-review".length);
    expect(getProviderModels("cx").some(row => row.id === model)).toBe(true);
    expect(getModelQuotaFamily("cx", model)).toBe("review");
    expect(getModelUpstreamId("cx", model)).toBe(upstream);
    await expect(getModelInfoCore(`cx/${model}`, {})).resolves.toEqual({ provider: "codex", model });
    const executor = new CodexExecutor();
    const body = executor.transformRequest(model, { model, input: [{ role: "user", content: "fixture" }] }, true, {});
    expect(body.model).toBe(upstream);
    expect(executor.buildUrl(model, true)).toBe("https://chatgpt.com/backend-api/codex/responses");
  });

  it("routes the reserve virtual model without inventing a public API capability ceiling", async () => {
    expect(getProviderModels("cx").some(row => row.id === "gpt-reserve")).toBe(true);
    await expect(getModelInfoCore("cx/gpt-reserve", {})).resolves.toEqual({ provider: "codex", model: "gpt-reserve" });
    expect(getCapabilitiesForModel("cx", "gpt-reserve")).toMatchObject({ contextWindow: null, maxInput: null, maxOutput: null, imageOutput: false, audioOutput: false });
  });

  it("preserves the existing review aliases and default instead of retiring absent bundle IDs", () => {
    expect(getModelUpstreamId("cx", "gpt-5.6-sol-review")).toBe("gpt-5.6-sol");
    expect(getModelUpstreamId("cx", "gpt-5.4-review")).toBe("gpt-5.4");
    expect(getModelUpstreamId("cx", "codex-auto-review")).toBe("codex-auto-review");
    expect(getDefaultModel("cx")).toBe("gpt-6-astra");
  });
});
