import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { getPricingForModel as price, MODEL_PRICING, PROVIDER_PRICING, ZERO_PRICING } from "../../open-sse/providers/pricing.js";

const own = (object, key) => Object.hasOwn(object || {}, key);

// Exercise a real saved operator override in an isolated disk-backed database.
async function expectSavedOverrides(provider, cases, scopedQuotes) {
  const dir = await mkdtemp(join(process.env.TMPDIR || "/tmp/opencode", "pricing-identity-"));
  const oldDir = process.env.DATA_DIR, previous = Object.getOwnPropertyDescriptor(global, "_dbAdapter");
  const events = ["beforeExit", "exit", "SIGINT", "SIGTERM"];
  const listeners = new Map(events.map(event => [event, new Set(process.listeners(event))]));
  process.env.DATA_DIR = join(dir, "data"); delete global._dbAdapter; vi.resetModules();
  let tables, oldProvider;
  try {
    const repo = await import("../../src/lib/db/repos/pricingRepo.js");
    if (scopedQuotes) {
      tables = (await import("../../open-sse/providers/pricing.js")).PROVIDER_PRICING;
      oldProvider = tables[provider];
      tables[provider] = scopedQuotes;
    }
    for (const [model, override] of cases) {
      expect(await repo.getPricingForModel(provider, model)).toBeNull();
      await repo.updatePricing({ [provider]: { [model]: override } });
      expect(await repo.getPricingForModel(provider, model)).toMatchObject(override);
      expect((await repo.getSavedPricing())[provider][model]).toEqual(override);
      expect(await repo.getPricingForModel("unrelated-price-fixture", model)).toBeNull();
    }
  } finally {
    if (tables) {
      if (oldProvider === undefined) delete tables[provider]; else tables[provider] = oldProvider;
    }
    await global._dbAdapter?.instance?.close();
    for (const event of events) for (const listener of process.listeners(event)) if (!listeners.get(event).has(listener)) process.removeListener(event, listener);
    if (previous) Object.defineProperty(global, "_dbAdapter", previous); else delete global._dbAdapter;
    if (oldDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = oldDir;
    vi.resetModules(); await rm(dir, { recursive: true, force: true });
  }
}

describe("declared pricing identity resolution", () => {
  it("uses declared upstream aliases without overriding literal provider tariffs", () => {
    const mismatches = [];
    for (const p of REGISTRY) for (const m of p.models || []) {
      if (!m.upstreamModelId || m.id === m.upstreamModelId) continue;
      if (own(PROVIDER_PRICING[p.id], m.id) || own(PROVIDER_PRICING[p.alias], m.id)) continue;
      const upstream = price(p.id, m.upstreamModelId);
      if (upstream && JSON.stringify(price(p.id, m.id)) !== JSON.stringify(upstream)) mismatches.push([p.id, m.id, m.upstreamModelId]);
    }
    expect(mismatches).toEqual([]);
    expect(price("deepseek", "deepseek-v4-pro-max")).toEqual(price("deepseek", "deepseek-v4-pro"));
    expect(price("xiaomi-tokenplan", "mimo-v2.5-pro-claude")).toEqual(price("xiaomi-tokenplan", "mimo-v2.5-pro"));
  });

  it("uses unambiguous case-folded exact provider rates", () => {
    expect(price("siliconflow", "DEEPSEEK-AI/DEEPSEEK-V4-PRO")).toEqual(PROVIDER_PRICING.siliconflow["deepseek-ai/DeepSeek-V4-Pro"]);
    expect(price("tr", "DEEPSEEK/DEEPSEEK-V4-PRO")).toEqual(PROVIDER_PRICING.tokenrouter["deepseek/deepseek-v4-pro"]);
  });

  it("keeps literal provider prices above aliases and scopes free namespaces", async () => {
    const explicit = { input: 71, output: 72 };
    const previousDeepseek = PROVIDER_PRICING.deepseek;
    const previousAudit = PROVIDER_PRICING.audit;
    MODEL_PRICING["audit-vendor/deepseek-v4-pro"] = explicit;
    MODEL_PRICING["cline-free/audit-priced"] = explicit;
    PROVIDER_PRICING.deepseek = { "deepseek-v4-pro-max": explicit, "cline-free/audit-provider": explicit };
    try {
      // Global/full-ID quotes are not evidence for the synthetic audit host.
      expect(price("audit", "audit-vendor/deepseek-v4-pro")).toBeNull();
      expect(price("audit", "cline-free/audit-priced")).toBeNull();
      PROVIDER_PRICING.audit = { "audit-vendor/deepseek-v4-pro": explicit, "cline-free/audit-priced": explicit };
      expect(price("audit", "audit-vendor/deepseek-v4-pro")).toBe(explicit);
      expect(price("audit", "cline-free/audit-priced")).toBe(explicit);
      expect(price("deepseek", "deepseek-v4-pro-max")).toBe(explicit);
      expect(price("deepseek", "cline-free/audit-provider")).toBe(explicit);
      expect(price("audit", "cline-free/deepseek-v4-pro")).toBeNull();
      expect(price("audit", "mimo-free/deepseek-v4-pro")).toBeNull();
      expect(price("audit", "opencode-free/deepseek-v4-pro")).toBeNull();
      expect(price("cline", "cline-free/deepseek-v4-pro")).toBe(ZERO_PRICING);
      expect(price("mimo-free", "mimo-free/deepseek-v4-pro")).toBe(ZERO_PRICING);
      expect(price("opencode", "opencode-free/deepseek-v4-pro")).toBe(ZERO_PRICING);
    } finally {
      delete MODEL_PRICING["audit-vendor/deepseek-v4-pro"];
      delete MODEL_PRICING["cline-free/audit-priced"];
      if (previousDeepseek === undefined) delete PROVIDER_PRICING.deepseek;
      else PROVIDER_PRICING.deepseek = previousDeepseek;
      if (previousAudit === undefined) delete PROVIDER_PRICING.audit;
      else PROVIDER_PRICING.audit = previousAudit;
    }
    await expectSavedOverrides("audit", [
      ["audit-vendor/deepseek-v4-pro", { input: 1, output: 2 }],
      ["cline-free/audit-priced", { input: 1, output: 2 }],
      ["cline-free/deepseek-v4-pro", { input: 1, output: 2 }],
      ["mimo-free/deepseek-v4-pro", { input: 1, output: 2 }],
      ["opencode-free/deepseek-v4-pro", { input: 1, output: 2 }],
    ]);
  });

  it("does not choose between conflicting provider-scoped spellings or invent unsupported aliases", async () => {
    const previous = PROVIDER_PRICING.audit;
    PROVIDER_PRICING.audit = { AuditCase: { input: 1 }, auditcase: { input: 2 } };
    try {
      expect(price("audit", "AuditCase")).toEqual({ input: 1 });
      expect(price("audit", "auditcase")).toEqual({ input: 2 });
      expect(price("audit", "AUDITCASE")).toBeNull();
      expect(price("audit", "mimo-v2.5-pro-claude")).toBeNull();
      expect(price("audit", "constructor")).toBeNull();
      expect(price("unrelated-price-fixture", "AuditCase")).toBeNull();
    } finally {
      if (previous === undefined) delete PROVIDER_PRICING.audit;
      else PROVIDER_PRICING.audit = previous;
    }
    await expectSavedOverrides("audit", [["AUDITCASE", { input: 3, output: 0 }]], { AuditCase: { input: 1 }, auditcase: { input: 2 } });
  });
});
