import { describe, it, expect } from "vitest";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import alicodeRegistry from "../../open-sse/providers/registry/alicode.js";
import alitpRegistry from "../../open-sse/providers/registry/alitp-intl.js";
import mimoRegistry from "../../open-sse/providers/registry/xiaomi-mimo.js";
import xmtpRegistry from "../../open-sse/providers/registry/xiaomi-tokenplan.js";
import baiduRegistry from "../../open-sse/providers/registry/baidu.js";
import tencentRegistry from "../../open-sse/providers/registry/tencent.js";

describe("Qwen registries", () => {
  it("retains Coding Plan's current exact supported list without obsolete defaults", () => {
    const supported = [
      "qwen3.7-plus", "qwen3.6-plus", "kimi-k2.5", "glm-5", "MiniMax-M2.5",
      "qwen3.5-plus",
    ];
    expect(alicodeRegistry.models.map((m) => m.id).sort()).toEqual(supported.sort());
    for (const id of supported) {
      const metadata = getReviewedModelMetadata("alicode", id);
      expect(metadata.sources).toContain("https://help.aliyun.com/zh/model-studio/coding-plan");
      expect(metadata.billing).toMatchObject({ kind: "subscription", currency: "CNY", unit: "month" });
    }
    expect(getReviewedModelMetadata("alicode", "kimi-k2.5").capabilities.vision).toBe(true);
  });
  it("token-plan lists the real 3.8/3.7/3.6/3.5 IDs, no phantom preview", () => {
    const ids = alitpRegistry.models.map((m) => m.id);
    expect(ids).not.toContain("qwen3.8-max-preview");
    for (const id of ["qwen3.8-max", "qwen3.8-flash", "qwen3.7-flash", "qwen3.6-plus", "qwen3.5-flash"]) {
      expect(ids).toContain(id);
    }
  });
  it("does not bill the Coding Plan's registered Qwen models at inherited PAYG rates", () => {
    // CN/international Coding Plan primaries: request quotas, not token PAYG.
    const usage = { prompt_tokens: 1000000, completion_tokens: 1000000 };
    expect(calculateCostFromTokens(usage, getPricingForModel("alicode", "qwen3.7-plus"))).toBeNull();
    expect(calculateCostFromTokens(usage, getPricingForModel("alicode-intl", "qwen3.5-plus"))).toBeNull();
  });
  it("keeps the registered Coding Plan Kimi window distinct from Qwen's context", () => {
    expect(getCapabilitiesForModel("alicode", "kimi-k2.5").contextWindow).toBe(262144);
    expect(getCapabilitiesForModel("alicode", "qwen3.5-plus").contextWindow).toBe(1000000);
  });
});

describe("Xiaomi registries", () => {
  it("dropped deprecated V2 IDs and added the ASR model", () => {
    const mimo = mimoRegistry.models.map((m) => m.id);
    const xmtp = xmtpRegistry.models.map((m) => m.id);
    for (const id of ["mimo-v2-omni", "mimo-v2-flash", "mimo-v2-pro", "mimo-v2-tts"]) {
      expect(mimo).not.toContain(id);
      expect(xmtp).not.toContain(id);
    }
    expect(mimo).toContain("mimo-v2.5-asr");
  });
  it("prices V2.6 PAYG but does not silently remap the officially retired V2.5 IDs", () => {
    // MiMo model/pricing pages,2026-10-21: V2.5 retired10:00UTC+8; IDs no longer work.
    const usage = { prompt_tokens: 1000000, completion_tokens: 1000000 };
    expect(calculateCostFromTokens(usage, getPricingForModel("xiaomi-mimo", "mimo-v2.6-pro"))).toBeCloseTo(1.305, 12);
    expect(calculateCostFromTokens(usage, getPricingForModel("xiaomi-mimo", "mimo-v2.6-flash"))).toBeCloseTo(0.42, 12);
    expect(calculateCostFromTokens(usage, getPricingForModel("xiaomi-mimo", "mimo-v2.5-pro"))).toBeNull();
    expect(calculateCostFromTokens(usage, getPricingForModel("xiaomi-mimo", "mimo-v2.5"))).toBeNull();
  });
});

describe("Baidu + Tencent registries", () => {
  it("Baidu retains exact model IDs and the independently published GLM5.2 output range", () => {
    const ids = baiduRegistry.models.map((m) => m.id);
    for (const id of ["ernie-5.1", "ernie-5.0", "ernie-x1-turbo-32k"]) expect(ids).toContain(id);
    // Native Qianfan model table explicitly gives max_tokens[1,131072].
    expect(getCapabilitiesForModel("baidu", "glm-5.2").maxOutput).toBe(131072);
  });
  it("preserves Qianfan's CNY quote without silently converting it into a USD invoice", () => {
    const metadata = getReviewedModelMetadata("baidu", "ernie-5.1");
    expect(metadata.billing).toMatchObject({ currency: "CNY", unit: "per_1000_tokens", nativeQuote: { input: 0.004, output: 0.018 } });
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 1000000 }, getPricingForModel("baidu", "ernie-5.1"))).toBeNull();
  });
  it("tencent lists hy3-preview and marks legacy models", () => {
    const ids = tencentRegistry.models.map((m) => m.id);
    expect(ids).toContain("hy3-preview");
  });
  it("does not promote old family windows into verified Coding Plan or Qianfan route limits", () => {
    // Current Ark plan lists2.1 IDs;2.0 is compatibility, not current entitlement.
    // Qianfan prints128k without an independent exact numeric conversion.
    expect(getCapabilitiesForModel("volcengine-ark", "Doubao-Seed-2.0-pro").contextWindow).toBeNull();
    expect(getCapabilitiesForModel("baidu", "ernie-5.1")).toMatchObject({ contextWindow: null, maxOutput: 65536 });
  });
});
