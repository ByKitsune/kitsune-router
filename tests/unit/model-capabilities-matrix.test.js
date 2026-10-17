import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getCapabilitiesForModel,
  setCatalogSource,
} from "../../open-sse/providers/capabilities.js";
import { getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { detectRequiredCapabilities, reorderByCapabilities } from "../../open-sse/services/combo.js";

beforeEach(() => setCatalogSource(null));
afterEach(() => setCatalogSource(null));

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

  describe("exact Kimi Code input restrictions", () => {
    // Kimi Code's exact product records override the broad Kimi family guess:
    // https://www.kimi.com/code/docs/en/kimi-code/models.html
    // https://models.dev/api.json (kimi-code-plan-cn, 2026-10-17)
    it.each(["k3", "kimi-for-coding", "kimi-for-coding-highspeed"])("does not choose %s for a PDF while retaining its image support", (model) => {
      const required = detectRequiredCapabilities({
        messages: [{ role: "user", content: [{ type: "file", file: { file_data: "data:application/pdf;base64,JVBERi0=" } }] }],
      });
      for (const provider of ["kimi", "kmc"]) {
        const members = [`${provider}/${model}`, "openai/gpt-6.1-sol"];
        expect(reorderByCapabilities(members, required)).toEqual([members[1], members[0]]);
        expect(reorderByCapabilities(members, new Set(["vision"]))).toEqual(members);
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

  describe("Codex metadata identity", () => {
    it.each(["gpt-6.1-sol", "gpt-6-astra[1m]", "gpt-5.6-sol[1m]"])("preserves route facts for %s through the cx storage alias", (model) => {
      expect(getCapabilitiesForModel("cx", model)).toEqual(getCapabilitiesForModel("codex", model));
    });

    it("does not shrink the served model window to a CLI configuration ceiling", () => {
      const caps = getCapabilitiesForModel("codex", "gpt-6-astra");
      const limits = getReviewedModelMetadata("codex", "gpt-6-astra").limits;
      expect(caps.contextWindow).toBeGreaterThan(limits.cliMaxContext);
      expect(limits.cliMaxContext).toBeGreaterThan(limits.cliDefaultContext);
      expect(getCapabilitiesForModel("codex", "gpt-6-astra[1m]").contextWindow).toBe(caps.contextWindow);
    });
  });
});
