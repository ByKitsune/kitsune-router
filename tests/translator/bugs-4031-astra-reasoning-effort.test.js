import { describe, it, expect } from "vitest";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";

const apply = (targetFormat, model, body, provider) => {
  const b = JSON.parse(JSON.stringify(body));
  applyThinking(targetFormat, model, b, provider);
  return b;
};

// 9Router #4031: gpt-6-astra rejects reasoning_effort:"none" on
// /v1/chat/completions (low/medium/high only), yet Kitsune Router emitted "none"
// whenever thinking resolved to off — e.g. via the provider-level thinking
// default or an explicit client "none" — breaking function tools on Astra.
// Fix: astra declares thinkingCanDisable:false, and the openai wire format
// omits the field (upstream default applies) instead of emitting "none".
describe("gpt-6-astra never receives reasoning_effort none (#4031)", () => {
  it("declares thinkingCanDisable:false", () => {
    expect(getCapabilitiesForModel("openai", "gpt-6-astra").thinkingCanDisable).toBe(false);
  });

  it("omits reasoning_effort when client sends none", () => {
    const out = apply("openai", "gpt-6-astra", { reasoning_effort: "none" }, "openai");
    expect(out.reasoning_effort).toBeUndefined();
  });

  it("omits reasoning_effort for the providerThinking-injected none shape", () => {
    // chatCore injects reasoning_effort:"none" from a provider-level default;
    // Astra must still go out clean.
    const out = apply("openai", "gpt-6-astra", { reasoning_effort: "none" }, "openai");
    expect("reasoning_effort" in out).toBe(false);
  });

  it("omits reasoning_effort for the gpt-6-astra(none) suffix form", () => {
    const out = apply("openai", "gpt-6-astra(none)", { messages: [] }, "openai");
    expect(out.reasoning_effort).toBeUndefined();
  });

  it("passes explicit low/medium/high through untouched", () => {
    for (const level of ["low", "medium", "high"]) {
      const out = apply("openai", "gpt-6-astra", { reasoning_effort: level }, "openai");
      expect(out.reasoning_effort).toBe(level);
    }
  });

  it("models that CAN disable still get explicit none", () => {
    const out = apply("openai", "gpt-5", { reasoning_effort: "none" }, "openai");
    expect(out.reasoning_effort).toBe("none");
  });
});
