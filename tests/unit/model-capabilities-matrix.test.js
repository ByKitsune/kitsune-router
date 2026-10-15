import { describe, expect, it } from "vitest";
import {
  getCapabilitiesForModel,
  PROVIDER_CAPABILITIES,
} from "../../open-sse/providers/capabilities.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";

describe("Model Capabilities Matrix", () => {
  describe("o3-mini text-only vs o3 multimodal", () => {
    it("reports o3-mini as text-only reasoning model without vision or pdf", () => {
      for (const model of ["o3-mini", "openai/o3-mini", "o3-mini-2025-01-31"]) {
        const caps = getCapabilitiesForModel("openai", model);
        expect(caps.reasoning).toBe(true);
        expect(caps.thinkingFormat).toBe("openai");
        expect(caps.contextWindow).toBe(200000);
        expect(caps.maxOutput).toBe(100000);
        expect(caps.vision).toBe(false);
        expect(caps.pdf).toBe(false);
      }
    });

    it("reports standard o3 with vision and pdf capabilities", () => {
      const caps = getCapabilitiesForModel("openai", "o3");
      expect(caps.reasoning).toBe(true);
      expect(caps.thinkingFormat).toBe("openai");
      expect(caps.contextWindow).toBe(200000);
      expect(caps.maxOutput).toBe(100000);
      expect(caps.vision).toBe(true);
      expect(caps.pdf).toBe(true);
    });
  });

  describe("Kimi PDF support across k3, k2.7, k2.6, and for-coding", () => {
    const expectedKimiCaps = {
      vision: true,
      pdf: true,
      videoInput: true,
      reasoning: true,
      thinkingFormat: "kimi",
    };

    it("grants pdf: true to Kimi k3 models", () => {
      for (const model of ["kimi-k3", "k3", "moonshot/kimi-k3", "kimi-k3-preview"]) {
        expect(getCapabilitiesForModel("kimi", model)).toMatchObject(expectedKimiCaps);
      }
    });

    it("grants pdf: true to Kimi k2.7 models", () => {
      for (const model of ["kimi-k2.7", "kimi-k2.7-code", "moonshotai/kimi-k2.7-code", "kimi-k2.7-code-highspeed"]) {
        expect(getCapabilitiesForModel("kimi", model)).toMatchObject(expectedKimiCaps);
      }
    });

    it("grants pdf: true to Kimi k2.6 models", () => {
      for (const model of ["kimi-k2.6", "moonshot/kimi-k2.6"]) {
        expect(getCapabilitiesForModel("kimi", model)).toMatchObject(expectedKimiCaps);
      }
    });

    it("grants pdf: true to Kimi for-coding models", () => {
      for (const model of ["kimi-for-coding", "kimi-for-coding-highspeed"]) {
        expect(getCapabilitiesForModel("kimi", model)).toMatchObject(expectedKimiCaps);
      }
    });
  });

  describe("Qwen-VL videoInput and pdf capabilities", () => {
    const expectedQwenVlCaps = {
      vision: true,
      pdf: true,
      videoInput: true,
      tools: true,
      reasoning: true,
      thinkingFormat: "qwen",
    };

    it("reports Qwen-VL variants with vision, pdf, and videoInput", () => {
      for (const model of [
        "qwen-vl",
        "qwen-vl-plus",
        "qwen-vl-max",
        "qwen2.5-vl-72b",
        "qwen2-vl-7b-instruct",
        "alibaba/qwen-vl",
      ]) {
        expect(getCapabilitiesForModel("qwen", model)).toMatchObject(expectedQwenVlCaps);
      }
    });
  });

  describe("Gemini 1.5 audio and video capabilities", () => {
    it("reports Gemini 1.5 models with audioInput and videoInput before generic gemini", () => {
      for (const model of [
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
        "google/gemini-1.5-pro",
        "google/gemini-1.5-flash",
      ]) {
        const caps = getCapabilitiesForModel("google", model);
        expect(caps.vision).toBe(true);
        expect(caps.pdf).toBe(true);
        expect(caps.audioInput).toBe(true);
        expect(caps.videoInput).toBe(true);
        expect(caps.search).toBe(true);
      }
    });

    it("keeps generic legacy gemini without audioInput or videoInput", () => {
      const caps = getCapabilitiesForModel("google", "gemini-1.0-pro");
      expect(caps.vision).toBe(true);
      expect(caps.pdf).toBe(true);
      expect(caps.audioInput).toBe(false);
      expect(caps.videoInput).toBe(false);
    });
  });

  describe("Pixtral multimodal vision and PDF capabilities", () => {
    it("reports Pixtral models with vision, pdf, and 128k contextWindow", () => {
      for (const model of [
        "pixtral-12b",
        "pixtral-large",
        "pixtral-large-2411",
        "mistralai/pixtral-12b-2409",
      ]) {
        const caps = getCapabilitiesForModel("mistral", model);
        expect(caps.vision).toBe(true);
        expect(caps.pdf).toBe(true);
        expect(caps.contextWindow).toBe(128000);
      }
    });
  });

  describe("Codex GPT-6 and 1M context ceilings (codex and cx alias)", () => {
    const ceilingModels = [
      "gpt-6.1-sol",
      "gpt-6-astra[1m]",
      "gpt-6-sol[1m]",
      "gpt-6-luna[1m]",
      "gpt-5.6-sol[1m]",
      "gpt-5.6-terra[1m]",
      "gpt-5.6-luna[1m]",
    ];

    it("verifies PROVIDER_CAPABILITIES.cx references PROVIDER_CAPABILITIES.codex", () => {
      expect(PROVIDER_CAPABILITIES.cx).toBe(PROVIDER_CAPABILITIES.codex);
    });

    it("reports the API context window for codex (not the CLI configuration ceiling)", () => {
      // These ids used to report 872000 — the Codex CLI configuration ceiling,
      // not a backend cap. Live measurement served 902,486 input tokens for a
      // model advertised at 872,000, with the true ceiling at apiMaxInput
      // (922,000). models.dev's official OpenAI entries, Griphub's live
      // /v1/models and 9router's patterns all agree on 1,050,000.
      for (const model of ceilingModels) {
        const caps = getCapabilitiesForModel("codex", model);
        expect(caps.contextWindow).toBe(1050000);
        expect(caps.vision).toBe(true);
        expect(caps.reasoning).toBe(true);
        expect(caps.search).toBe(true);
      }
    });

    it("reports the same window through the cx provider alias", () => {
      for (const model of ceilingModels) {
        const caps = getCapabilitiesForModel("cx", model);
        expect(caps.contextWindow).toBe(1050000);
        expect(caps.vision).toBe(true);
        expect(caps.reasoning).toBe(true);
        expect(caps.search).toBe(true);
      }
    });

    it("keeps the published window separate from the CLI configuration ceilings", () => {
      for (const provider of ["codex", "cx"]) {
        for (const model of ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
          expect(getCapabilitiesForModel(provider, model)).toMatchObject({
            contextWindow: 1050000, maxInput: 922000, maxOutput: 128000,
          });
          const metadata = getReviewedModelMetadata(provider, model);
          expect(metadata.limits).toMatchObject({
            // CLI ceilings remain recorded, but as a client-scoped concept.
            cliDefaultContext: 272000, cliMaxContext: 872000,
            apiContextWindow: 1050000, apiMaxInput: 922000, apiMaxOutput: 128000,
            authenticatedRouteVerified: false,
          });
          expect(metadata.limits.cliMaxContextSemantics).toMatch(/not a backend hard cap/i);
          expect(metadata.sources).toContain(
            "https://raw.githubusercontent.com/openai/codex/rust-v0.160.0/codex-rs/models-manager/models.json",
          );
        }
        for (const model of ceilingModels) {
          expect(getReviewedModelMetadata(provider, model).limits).toMatchObject({
            cliDefaultContext: 272000, cliMaxContext: 872000,
          });
        }
      }
    });
  });
});
