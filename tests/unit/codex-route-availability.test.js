// P09 regression gate — the catalog must not advertise models the route rejects.
//
// Verified live against the running gateway (max_tokens 1000, per the audit
// rule that small values produce false negatives on reasoning models):
//
//   WORKS (HTTP 200): cx/gpt-6-astra, cx/gpt-6.1-sol, cx/gpt-6-sol,
//     cx/gpt-6-luna, cx/gpt-5.6-sol, cx/gpt-5.6-terra, cx/gpt-5.6-luna,
//     cx/codex-auto-review
//   REJECTED (HTTP 503 wrapping upstream 400): cx/gpt-5.5, cx/gpt-5.4,
//     cx/gpt-5.4-mini, cx/gpt-5.3-codex-spark
//
// The rejected ones stay listed so stored combos keep resolving instead of
// 404ing, but they must be flagged as not servable, because ByKitsune reads
// this catalog and would otherwise advertise an unusable model.
import { describe, expect, it } from "vitest";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";

// Reproduced live: "The '<id>' model is not supported when using Codex with a
// ChatGPT account."
const REJECTED = ["gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex-spark"];
const SERVED = ["gpt-6-astra", "gpt-6.1-sol", "gpt-6-sol", "gpt-6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];

describe("routes the Codex ChatGPT account rejects are flagged", () => {
  it.each(REJECTED)("%s is marked routeAvailable:false with a reason", (model) => {
    const limits = getReviewedModelMetadata("codex", model)?.limits;
    expect(limits?.routeAvailable, model).toBe(false);
    expect(limits?.routeUnavailableReason, model).toBe("rejected-by-codex-chatgpt-route");
  });

  it.each(REJECTED)("%s keeps its entry so stored combos still resolve", (model) => {
    // Deleting the id would turn a stored combo into a 404 instead of a clear
    // "not available" signal.
    expect(getReviewedModelMetadata("codex", model), model).toBeTruthy();
  });

  it.each(REJECTED)("%s does not advertise a context window it cannot serve", (model) => {
    // context_length must not promise a capability the route rejects.
    const ctx = getCapabilitiesForModel("codex", model).contextWindow;
    expect(ctx == null, `${model} published contextWindow ${ctx}`).toBe(true);
  });

  it("propagates the flag to the -review aliases", () => {
    for (const model of ["gpt-5.4-review", "gpt-5.4-mini-review", "gpt-5.3-codex-spark-review"]) {
      expect(getReviewedModelMetadata("codex", model)?.limits?.routeAvailable, model).toBe(false);
    }
  });
});

describe("routes that DO work are not flagged", () => {
  it.each(SERVED)("%s has no routeAvailable:false", (model) => {
    const limits = getReviewedModelMetadata("codex", model)?.limits;
    expect(limits?.routeAvailable, model).not.toBe(false);
  });

  it.each(SERVED)("%s still publishes the API context window", (model) => {
    expect(getCapabilitiesForModel("codex", model).contextWindow, model).toBe(1050000);
  });

  it("does not flag the CLI virtual review model that answered 200", () => {
    expect(getReviewedModelMetadata("codex", "codex-auto-review")?.limits?.routeAvailable).not.toBe(false);
  });

  it("leaves the -review aliases of working models servable", () => {
    for (const model of ["gpt-5.6-luna-review", "gpt-5.6-sol-review"]) {
      expect(getReviewedModelMetadata("codex", model)?.limits?.routeAvailable, model).not.toBe(false);
    }
  });
});

describe("the availability flag is a documented, non-guessed fact", () => {
  it("carries the reason id so a consumer can filter precisely", () => {
    const limits = getReviewedModelMetadata("codex", "gpt-5.4")?.limits;
    // A stable machine-readable token, not prose.
    expect(limits.routeUnavailableReason).toMatch(/^[a-z0-9-]+$/);
  });

  it("keeps the reference API facts separate from the route verdict", () => {
    const limits = getReviewedModelMetadata("codex", "gpt-5.4")?.limits;
    expect(limits.apiContextWindow).toBe(1050000);
    expect(limits.routeAvailable).toBe(false);
  });
});
