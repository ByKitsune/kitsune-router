import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  aggregateComboCapabilities,
  getCapabilitiesForModel,
  setCatalogSource,
  withDeclaredCapabilities,
} from "../../open-sse/providers/capabilities.js";

beforeEach(() => setCatalogSource(null));
afterEach(() => setCatalogSource(null));

describe("unknown limits are not model specifications", () => {
  it("does not advertise a default 200K context or 64K output for a private model", () => {
    expect(getCapabilitiesForModel("private-endpoint", "operator-model-v1")).toMatchObject({
      contextWindow: null, maxInput: null, maxOutput: null,
    });
  });

  it("does not give non-token image models invented chat-token limits", () => {
    expect(getCapabilitiesForModel("cloudflare-ai", "@cf/black-forest-labs/flux-2-dev")).toMatchObject({
      contextWindow: null, maxInput: null, maxOutput: null,
    });
  });

  it("keeps actual known limits independent of the unknown floor", () => {
    expect(getCapabilitiesForModel("openai", "gpt-4o")).toMatchObject({
      contextWindow: 128000, maxOutput: 16384,
    });
    expect(getCapabilitiesForModel("antigravity", "claude-sonnet-4-6")).toMatchObject({
      contextWindow: 250000, maxOutput: 64000, pdf: false,
    });
  });

  it("does not turn a partially unknown combo into a definite window or output cap", () => {
    const caps = aggregateComboCapabilities(["openai/gpt-4o", "private-endpoint/operator-model-v1"]);
    expect(caps).toMatchObject({ contextWindow: null, maxOutput: null });
  });

  it("accepts explicit operator limits rather than treating unknown as a ceiling", () => {
    const base = getCapabilitiesForModel("private-endpoint", "operator-model-v1");
    expect(withDeclaredCapabilities(base, { contextWindow: 8192, maxInput: 6144, maxOutput: 2048 }))
      .toMatchObject({ contextWindow: 8192, maxInput: 6144, maxOutput: 2048 });
  });

  it("fills unknown values with the exact route's synced facts", () => {
    setCatalogSource({
      getModalities: () => ({ vision: false, tools: false }),
      getLimits: (provider, model) => provider === "private-endpoint" && model === "operator-model-v1"
        ? { contextWindow: 16384, maxInput: 12288, maxOutput: 4096 } : null,
    });
    expect(getCapabilitiesForModel("private-endpoint", "operator-model-v1")).toMatchObject({
      contextWindow: 16384, maxInput: 12288, maxOutput: 4096, vision: false, tools: false,
    });
    expect(getCapabilitiesForModel("another-endpoint", "operator-model-v1").contextWindow).toBeNull();
  });
});
