import { describe, it, expect } from "vitest";
import { MODEL_PRICING, getPricingForModel } from "../../open-sse/providers/pricing.js";
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
  it("prices coder-plus/flash at base tiers", () => {
    expect(getPricingForModel("alicode", "qwen3-coder-plus")).toMatchObject({ input: 0.574, output: 2.294 });
    expect(getPricingForModel("alicode", "qwen3-coder-flash")).toMatchObject({ input: 0.144, output: 0.574 });
  });
  it("caps qwen3-coder-next at 256K, not 1M", () => {
    expect(getCapabilitiesForModel("alicode", "qwen3-coder-next").contextWindow).toBe(262144);
    expect(getCapabilitiesForModel("alicode", "qwen3-coder-plus").contextWindow).toBe(1000000);
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
  it("prices v2.5 at the official PAYG schedule", () => {
    expect(getPricingForModel("xiaomi-mimo", "mimo-v2.5-pro")).toMatchObject({ input: 0.435, output: 0.87 });
    expect(getPricingForModel("xiaomi-mimo", "mimo-v2.5")).toMatchObject({ input: 0.14, output: 0.28 });
  });
});

describe("Baidu + Tencent registries", () => {
  it("baidu lists ERNIE models with corrected glm-5.2 context", () => {
    const ids = baiduRegistry.models.map((m) => m.id);
    for (const id of ["ernie-5.1", "ernie-5.0", "ernie-x1-turbo-32k"]) expect(ids).toContain(id);
    expect(baiduRegistry.models.find((m) => m.id === "glm-5.2").contextLength).toBe(202752);
  });
  it("prices ERNIE at Qianfan base tiers", () => {
    expect(getPricingForModel("baidu", "ernie-5.1")).toMatchObject({ input: 0.56, output: 2.53 });
  });
  it("tencent lists hy3-preview and marks legacy models", () => {
    const ids = tencentRegistry.models.map((m) => m.id);
    expect(ids).toContain("hy3-preview");
  });
  it("caps seed/doubao at 256K/128K and ernie-5 at 128K", () => {
    expect(getCapabilitiesForModel("volcengine-ark", "Doubao-Seed-2.0-pro").contextWindow).toBe(262144);
    expect(getCapabilitiesForModel("baidu", "ernie-5.1").contextWindow).toBe(131072);
  });
});
