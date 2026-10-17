import { describe, expect, it } from "vitest";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { getPricingForModel as price, MODEL_PRICING, PROVIDER_PRICING, ZERO_PRICING } from "../../open-sse/providers/pricing.js";

const own = (object, key) => Object.hasOwn(object || {}, key);

describe("declared pricing identity resolution", () => {
  it("uses declared upstream aliases before broad patterns without overriding literal tariffs", () => {
    const mismatches = [];
    for (const p of REGISTRY) for (const m of p.models || []) {
      if (!m.upstreamModelId || m.id === m.upstreamModelId) continue;
      if (own(MODEL_PRICING, m.id) || own(PROVIDER_PRICING[p.id], m.id) || own(PROVIDER_PRICING[p.alias], m.id)) continue;
      const upstream = price(p.id, m.upstreamModelId);
      if (upstream && JSON.stringify(price(p.id, m.id)) !== JSON.stringify(upstream)) mismatches.push([p.id, m.id, m.upstreamModelId]);
    }
    expect(mismatches).toEqual([]);
    expect(price("deepseek", "deepseek-v4-pro-max")).toEqual(price("deepseek", "deepseek-v4-pro"));
    expect(price("xiaomi-tokenplan", "mimo-v2.5-pro-claude")).toEqual(price("xiaomi-tokenplan", "mimo-v2.5-pro"));
  });

  it("uses unambiguous case-folded exact rates before generic families", () => {
    expect(price("siliconflow", "DEEPSEEK-AI/DEEPSEEK-V4-PRO")).toEqual(PROVIDER_PRICING.siliconflow["deepseek-ai/DeepSeek-V4-Pro"]);
    expect(price("tr", "DEEPSEEK/DEEPSEEK-V4-PRO")).toEqual(PROVIDER_PRICING.tokenrouter["deepseek/deepseek-v4-pro"]);
  });

  it("keeps literal full-ID and provider prices above free namespace and alias fallback", () => {
    const explicit = { input: 71, output: 72 };
    const previousDeepseek = PROVIDER_PRICING.deepseek;
    MODEL_PRICING["audit-vendor/deepseek-v4-pro"] = explicit;
    MODEL_PRICING["cline-free/audit-priced"] = explicit;
    PROVIDER_PRICING.deepseek = { "deepseek-v4-pro-max": explicit, "cline-free/audit-provider": explicit };
    try {
      expect(price("audit", "audit-vendor/deepseek-v4-pro")).toBe(explicit);
      expect(price("audit", "cline-free/audit-priced")).toBe(explicit);
      expect(price("deepseek", "deepseek-v4-pro-max")).toBe(explicit);
      expect(price("deepseek", "cline-free/audit-provider")).toBe(explicit);
      expect(price("audit", "cline-free/deepseek-v4-pro")).toBe(ZERO_PRICING);
      expect(price("audit", "mimo-free/deepseek-v4-pro")).toBe(ZERO_PRICING);
      expect(price("audit", "opencode-free/deepseek-v4-pro")).toBe(ZERO_PRICING);
    } finally {
      delete MODEL_PRICING["audit-vendor/deepseek-v4-pro"];
      delete MODEL_PRICING["cline-free/audit-priced"];
      if (previousDeepseek === undefined) delete PROVIDER_PRICING.deepseek;
      else PROVIDER_PRICING.deepseek = previousDeepseek;
    }
  });

  it("does not choose between conflicting case spellings or invent unsupported aliases", () => {
    MODEL_PRICING["AuditCase"] = { input: 1 };
    MODEL_PRICING["auditcase"] = { input: 2 };
    try {
      expect(price("audit", "AuditCase")).toEqual({ input: 1 });
      expect(price("audit", "auditcase")).toEqual({ input: 2 });
      expect(price("audit", "AUDITCASE")).toBeNull();
      expect(price("audit", "mimo-v2.5-pro-claude")).toBeNull();
      expect(price("audit", "constructor")).toBeNull();
    } finally {
      delete MODEL_PRICING.AuditCase;
      delete MODEL_PRICING.auditcase;
    }
  });
});
