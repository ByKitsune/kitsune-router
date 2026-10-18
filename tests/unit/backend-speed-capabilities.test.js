import { describe, expect, it } from "vitest";
import { getServiceTierAvailability, getServiceTierOptions, isServiceTierMode, resolveServiceTier } from "../../open-sse/providers/serviceTiers.js";

describe("browser-safe processing speed choices", () => {
  it.each(["openai", "codex", "cx"])("exposes the provider union without claiming account eligibility for %s", provider => {
    expect(getServiceTierOptions(provider).map(option => option.value)).toEqual(["auto", "default", "fast", "ultrafast"]);
  });
  it.each(["claude", "gemini", "openrouter", "openai-compatible-chat-fixture"])("does not advertise OpenAI speed on %s", provider => {
    expect(getServiceTierOptions(provider, "gpt-6-astra")).toEqual([]);
  });
  it.each(["gpt-6-sol", "gpt-6-luna", "gpt-5.5", "gpt-5.6-sol"])("removes definitely unsupported public Ultrafast for %s", model => {
    expect(getServiceTierOptions("openai", model).map(option => option.value)).toEqual(["auto", "default", "fast"]);
  });
  it("filters all paid speeds for fine-tuned and embedding models", () => {
    expect(getServiceTierOptions("openai", "ft:gpt-6-astra:org:custom:id").map(option => option.value)).toEqual(["auto", "default"]);
    expect(getServiceTierOptions("openai", "text-embedding-3-small").map(option => option.value)).toEqual(["auto", "default"]);
  });
  it("retains unknown Codex account entitlement as unknown, not disabled", () => {
    expect(getServiceTierAvailability("codex", "gpt-6.1-sol", "ultrafast").status).toBe("unknown");
    expect(getServiceTierOptions("codex", "gpt-6.1-sol").map(option => option.value)).toContain("ultrafast");
  });
  it("removes Codex Ultrafast for known unsupported models but respects a newer account catalog", () => {
    expect(getServiceTierOptions("codex", "gpt-6-luna").map(option => option.value)).not.toContain("ultrafast");
    expect(getServiceTierOptions("codex", { slug: "gpt-6-luna", service_tiers: [{ id: "ultrafast" }] }).map(option => option.value)).toContain("ultrafast");
  });
  it("distinguishes saved modes from the wire compatibility alias", () => {
    expect(isServiceTierMode("fast")).toBe(true);
    expect(isServiceTierMode("priority")).toBe(false);
    expect(isServiceTierMode("ultra")).toBe(false);
  });
});

function account(models, extra = {}) {
  return { providerSpecificData: { models, ...extra } };
}
const sol = { slug: "gpt-6.1-sol", service_tiers: [{ id: "priority", name: "Fast" }, { id: "ultrafast", name: "Ultrafast" }] };

describe("account- and model-local Codex service tier policy", () => {
  it("uses modern model service_tiers and rejects an explicit tier omitted by that account", () => {
    const credentials = account([{ ...sol, service_tiers: [{ id: "priority" }] }]);
    expect(() => resolveServiceTier("codex", sol.slug, "ultrafast", credentials)).toThrow(/not advertised/i);
    expect(resolveServiceTier("codex", sol.slug, "fast", credentials)).toBe("priority");
  });
  it("supports app-server camelCase metadata without transmitting camelCase request fields", () => {
    const credentials = account([{ id: sol.slug, serviceTiers: [{ id: "ultrafast" }], defaultServiceTier: "ultrafast" }]);
    expect(resolveServiceTier("codex", sol.slug, "auto", credentials)).toBe("ultrafast");
    expect(() => resolveServiceTier("codex", sol.slug, "fast", credentials)).toThrow(/not advertised/i);
  });
  it("does not reuse model A capability for model B", () => {
    const credentials = account([sol, { slug: "gpt-6-astra", service_tiers: [{ id: "priority" }] }]);
    expect(resolveServiceTier("codex", sol.slug, "ultrafast", credentials)).toBe("ultrafast");
    expect(() => resolveServiceTier("codex", "gpt-6-astra", "ultrafast", credentials)).toThrow(/not advertised/i);
  });
  it("rechecks account metadata on every attempt rather than caching a previous entitlement", () => {
    const credentials = account([sol]);
    expect(resolveServiceTier("codex", sol.slug, "ultrafast", credentials)).toBe("ultrafast");
    credentials.providerSpecificData = { models: [{ ...sol, service_tiers: [] }] };
    expect(() => resolveServiceTier("codex", sol.slug, "ultrafast", credentials)).toThrow(/not advertised/i);
  });
  it("honors workspace denial even if model metadata advertises Ultrafast", () => {
    const credentials = account([sol], { serviceTierPermissions: { ultrafast: false } });
    expect(() => resolveServiceTier("codex", sol.slug, "ultrafast", credentials)).toThrow(/permission/i);
  });
  it.each([["fast", "ultrafast", "ultrafast"], ["ultrafast", "fast", "priority"]])("%s denial does not disable independent %s", (denied, requested, expected) => {
    const credentials = account([sol], { serviceTierPermissions: { [denied]: false } });
    expect(resolveServiceTier("codex", sol.slug, requested, credentials)).toBe(expected);
  });
  it.each(["free", "plus", "team", "business", "pro_100", "pro_200", "enterprise_legacy"])("does not grant Ultrafast to known-ineligible %s by purchased credits", chatgptPlanType => {
    const credentials = account(undefined, { chatgptPlanType, credits: 500 });
    expect(() => resolveServiceTier("codex", sol.slug, "ultrafast", credentials)).toThrow(/plan/i);
  });
  it.each(["pro", "enterprise", "edu"])("does not infer verified eligibility from ambiguous %s", chatgptPlanType => {
    const credentials = account(undefined, { chatgptPlanType });
    expect(getServiceTierAvailability("codex", sol.slug, "ultrafast", credentials).status).toBe("unknown");
    expect(resolveServiceTier("codex", sol.slug, "ultrafast", credentials)).toBe("ultrafast");
  });
  it("accepts advertised Ultrafast for Pro $500 without renaming the model", () => {
    const credentials = account([sol], { chatgptPlanType: "pro_500" });
    expect(getServiceTierAvailability("codex", sol.slug, "ultrafast", credentials).status).toBe("supported");
    expect(resolveServiceTier("codex", "cx/gpt-6.1-sol(high)", "ultrafast", credentials)).toBe("ultrafast");
  });
  it("does not use the deprecated additional_speed_tiers as a negative entitlement", () => {
    const credentials = account([{ slug: sol.slug, additional_speed_tiers: [] }]);
    expect(getServiceTierAvailability("codex", sol.slug, "ultrafast", credentials).status).toBe("unknown");
  });
  it("checks native catalog defaults against workspace permission, but explicit Standard opts out", () => {
    const credentials = account([{ ...sol, default_service_tier: "ultrafast" }], { serviceTierPermissions: { ultrafast: false } });
    expect(() => resolveServiceTier("codex", sol.slug, "auto", credentials)).toThrow(/permission/i);
    expect(resolveServiceTier("codex", sol.slug, "default", credentials)).toBeUndefined();
  });
  it("keeps an empty modern catalog authoritative, not unknown", () => {
    expect(getServiceTierAvailability("codex", sol.slug, "ultrafast", account([{ ...sol, service_tiers: [] }])).status).toBe("unsupported");
  });
  it("does not treat public API flex/scale as supported Codex subscription tiers", () => {
    expect(() => resolveServiceTier("codex", sol.slug, "scale", {})).toThrow(/not supported/i);
    expect(() => resolveServiceTier("codex", sol.slug, "flex", {})).toThrow(/not supported/i);
  });
  it("respects known regional limits without altering residency", () => {
    const credentials = { providerSpecificData: { dataResidency: "eu" } };
    expect(() => resolveServiceTier("openai", "gpt-6-astra", "ultrafast", credentials)).toThrow(/region/i);
    expect(resolveServiceTier("openai", "gpt-6.1-sol", "ultrafast", credentials)).toBe("ultrafast");
  });
});
