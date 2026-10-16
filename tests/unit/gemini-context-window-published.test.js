// The Gemini flash/lite routes must publish their documented context window.
//
// Found during the 0.9.9 verification pass. Eleven Gemini records declared
// `unverifiedCapabilityFields: ["contextWindow"]`, which made
// applyReviewedCapabilities() null the field — and because
// /v1/models only emits `context_length` when the value is finite, those models
// reached clients with NO context window at all. Reproduced against production
// 0.9.7: 17 of 334 models had no numeric context_length, including
// gemini/gemini-2.5-pro and gemini/gemini-2.5-flash.
//
// The original reasoning ("Google does not document a separate combined
// input+output window") is true but was the wrong call, for three reasons:
//   1. models.dev's OFFICIAL google entries publish 1,048,576 for all of these
//      ids, including gemini-3.5-flash-lite.
//   2. The routes are served. Verified live against the production gateway:
//      gemini/gemini-2.5-flash and gemini/gemini-3.8-flash both returned 200.
//      This is the opposite of cx/gpt-5.4, which is genuinely rejected upstream
//      ("not supported when using Codex with a ChatGPT account") and where
//      withholding the window IS correct.
//   3. The owner's principle: raising the number is correct, lowering it harms
//      ByKitsune. A null removes the number entirely — the worst case.
import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";

// Every id models.dev's official google provider documents at 1,048,576.
// Public specifications do not establish a particular account's eligibility.
const VERIFIED = [
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
];

describe("Gemini windows are published, not withheld", () => {
  it.each(VERIFIED)("%s resolves to the documented 1,048,576", (model) => {
    expect(getCapabilitiesForModel("gemini", model).contextWindow, model).toBe(1048576);
  });

  it.each(VERIFIED)("%s no longer lists contextWindow as unverified", (model) => {
    const meta = getReviewedModelMetadata("gemini", model);
    expect(meta?.limits?.unverifiedCapabilityFields ?? [], model).not.toContain("contextWindow");
  });

  it("keeps the input budget distinct from the window", () => {
    // The original intent — do not conflate an input budget with total context —
    // still holds; both are simply published now.
    expect(getCapabilitiesForModel("gemini", "gemini-3.5-flash-lite")).toMatchObject({
      contextWindow: 1048576,
      maxInput: 1048576,
      maxOutput: 65536,
    });
  });
});

describe("genuinely unservable routes still withhold their window", () => {
  it.each(["gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex-spark"])(
    "cx/%s stays unset because the route is rejected upstream",
    (model) => {
      // Reproduced live: HTTP 400 "not supported when using Codex with a ChatGPT
      // account". Advertising a window here would promise what cannot be served.
      expect(getCapabilitiesForModel("codex", model).contextWindow ?? null, model).toBeNull();
      expect(getReviewedModelMetadata("codex", model)?.limits?.unverifiedCapabilityFields ?? [], model)
        .toContain("contextWindow");
      expect(getReviewedModelMetadata("codex", model)?.limits?.routeAvailable, model).toBe(false);
    },
  );

  it("leaves a route with no verified cap unset rather than guessing", () => {
    // grok-build: the registry and generic-family figures disagree and no
    // independent source settles it, so null is the honest answer.
    expect(getCapabilitiesForModel("grok-cli", "grok-build").contextWindow ?? null).toBeNull();
  });
});

describe("the fix did not leak onto other providers", () => {
  it("keeps a served Codex window at the API specification", () => {
    expect(getCapabilitiesForModel("codex", "gpt-6-luna").contextWindow).toBe(1050000);
  });

  it("keeps the direct-vendor windows unchanged", () => {
    // 1,000,000 is the Anthropic API window (models.dev's official entry).
    expect(getCapabilitiesForModel("anthropic", "claude-sonnet-4-6").contextWindow).toBe(1000000);
    expect(getCapabilitiesForModel("openai", "gpt-4.1").contextWindow).toBe(1047576);
  });

  it("keeps a route-scoped bridge cap distinct from the vendor window", () => {
    // Antigravity deliberately caps Claude at 250,000 — the bridge limit, not the
    // model's 1M API window. Both values are correct for their own route.
    expect(getCapabilitiesForModel("ag", "claude-sonnet-4-6").contextWindow).toBe(250000);
  });
});

describe("Google prior-use restrictions are not global retirement", () => {
  const RESTRICTED = ["gemini-2.5-pro", "gemini-2.5-flash-lite"];

  it.each(RESTRICTED)("%s records project eligibility without inventing shutdown", model => {
    const limits = getReviewedModelMetadata("gemini", model)?.limits;
    expect(limits?.routeAvailable).not.toBe(false);
    expect(limits?.routeUnavailableReason).toBeUndefined();
    expect(limits?.accountEligibility).toBe("prior-use-required");
    expect(limits?.lifecycleStatus).toBe("active-restricted");
    expect(limits?.shutdownDate).toBeNull();
    expect(getCapabilitiesForModel("gemini", model).contextWindow).toBe(1048576);
  });

  it.each(RESTRICTED)("%s does not impose API project eligibility on Gemini CLI", model => {
    const limits = getReviewedModelMetadata("gemini-cli", model)?.limits;
    expect(limits?.routeAvailable).not.toBe(false);
    expect(limits?.accountEligibility).toBeUndefined();
    expect(limits?.apiAccountEligibility).toBe("prior-use-required");
    expect(limits?.scope).toBe("api-reference-for-client-route");
  });
});
