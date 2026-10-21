// Exact provider/model catalog regressions. Native primary endpoint evidence
// overrides models.dev when the current model page disagrees; route-specific
// bridge limits must not inherit a vendor API window.
import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";

describe("windows corrected against models.dev", () => {
  it("reports the exact GPT-4.1 family window (1,047,576), not a rounded 1,000,000", () => {
    // models.dev's official OpenAI entry uses the vendor's exact figure.
    for (const model of ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"]) {
      expect(getCapabilitiesForModel("openai", model).contextWindow, model).toBe(1047576);
    }
  });

  it("keeps the Command A translate variant at its small 8,000 window", () => {
    // A translate-specialised SMALL model. The generic `*command-a*` family glob
    // gave it 128,000 — a 16x over-promise that a client would act on.
    expect(getCapabilitiesForModel("cohere", "command-a-translate-08-2025").contextWindow).toBe(8000);
    expect(getCapabilitiesForModel("cohere", "command-a-translate-08-2025").maxOutput).toBe(8000);
  });

  it("keeps Ministral 3 sizes at their current primary 256K window", () => {
    // The current 3B API page and official weights specify 256K/262144;
    // models.dev's 131072 context entry is stale for this native route.
    expect(getCapabilitiesForModel("mistral", "ministral-3b-2512").contextWindow).toBe(262144);
    expect(getCapabilitiesForModel("mistral", "ministral-8b-2512").contextWindow).toBe(262144);
    expect(getCapabilitiesForModel("mistral", "ministral-14b-2512").contextWindow).toBe(262144);
  });

  it("uses the current Codestral window for the unversioned id", () => {
    // Current primary /models/codestral-25-08.md explicitly maps codestral-latest
    // to codestral-2508 and prints128k. Do not override it with secondary256k.
    expect(getCapabilitiesForModel("mistral", "codestral-latest")).toMatchObject({ contextWindow: 128000, maxOutput: null });
  });
});

describe("specific-before-generic ordering is preserved", () => {
  it("does not let the translate fix leak onto other Command A models", () => {
    expect(getCapabilitiesForModel("cohere", "command-a-03-2025").contextWindow).toBe(256000);
    expect(getCapabilitiesForModel("cohere", "command-a-reasoning-08-2025").contextWindow).toBe(256000);
    expect(getCapabilitiesForModel("cohere", "command-a-vision-07-2025").contextWindow).toBe(128000);
    expect(getCapabilitiesForModel("cohere", "command-r-08-2024").contextWindow).toBe(128000);
  });

  it("uses exact native Mistral latest windows independently of the Ministral fix", () => {
    expect(getCapabilitiesForModel("mistral", "mistral-large-latest").contextWindow).toBe(262144);
    expect(getCapabilitiesForModel("mistral", "mistral-medium-latest").contextWindow).toBe(262144);
    expect(getCapabilitiesForModel("mistral", "mistral-small-latest").contextWindow).toBe(262144);
    // Versioned legacy codestral keeps its older 128k entry.
    expect(getCapabilitiesForModel("mistral", "codestral-2405").contextWindow).toBe(128000);
  });

  it("does not let the gpt-4.1 fix change other GPT families", () => {
    expect(getCapabilitiesForModel("openai", "gpt-4o").contextWindow).toBe(128000);
    expect(getCapabilitiesForModel("openai", "gpt-4-turbo").contextWindow).toBe(128000);
    expect(getCapabilitiesForModel("openai", "gpt-3.5-turbo").contextWindow).toBe(16385);
  });
});

describe("windows already correct are not disturbed", () => {
  it("keeps the GPT-6 / GPT-5.6 family at the API specification", () => {
    for (const model of ["gpt-6-luna", "gpt-6-sol", "gpt-6-astra", "gpt-6.1-sol", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra"]) {
      expect(getCapabilitiesForModel("codex", model).contextWindow, model).toBe(1050000);
    }
  });

  it("keeps GPT-5.4-mini at its smaller 400k window", () => {
    expect(getCapabilitiesForModel("openai", "gpt-5.4-mini").contextWindow).toBe(400000);
  });

  it("keeps a route-scoped bridge at its own cap", () => {
    // Antigravity deliberately caps Claude at 250k (bridge limit), which is NOT
    // the model's 1M API window. That difference is by design.
    expect(getCapabilitiesForModel("ag", "claude-sonnet-4-6").contextWindow).toBe(250000);
    // Kiro's documented experimental window is independent from its 272K
    // credit-price boundary and does not establish a native output ceiling.
    expect(getCapabilitiesForModel("kiro", "gpt-5.6-sol")).toMatchObject({ contextWindow: 1000000, maxOutput: null });
  });
});
