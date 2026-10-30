import { describe, it, expect } from "vitest";
import elevenRegistry from "../../open-sse/providers/registry/elevenlabs.js";
import cartesiaRegistry from "../../open-sse/providers/registry/cartesia.js";
import bflRegistry from "../../open-sse/providers/registry/black-forest-labs.js";
import recraftRegistry from "../../open-sse/providers/registry/recraft.js";
import falRegistry from "../../open-sse/providers/registry/fal-ai.js";
import runwayRegistry from "../../open-sse/providers/registry/runwayml.js";
import githubRegistry from "../../open-sse/providers/registry/github.js";
import ollamaRegistry from "../../open-sse/providers/registry/ollama.js";
import playhtRegistry from "../../open-sse/providers/registry/playht.js";
import gpseRegistry from "../../open-sse/providers/registry/google-pse.js";
import exaRegistry from "../../open-sse/providers/registry/exa.js";
import firecrawlRegistry from "../../open-sse/providers/registry/firecrawl.js";
import youcomRegistry from "../../open-sse/providers/registry/youcom.js";
import huggingfaceRegistry from "../../open-sse/providers/registry/huggingface.js";

const ttsIds = (r) => r.ttsConfig.models.map((m) => m.id);
const ids = (r) => r.models.map((m) => m.id);

describe("audio registries", () => {
  it("elevenlabs lists v3 + flash, cartesia lists 3.5/3.6", () => {
    expect(ttsIds(elevenRegistry)).toContain("eleven_v3");
    expect(ttsIds(elevenRegistry)).toContain("eleven_flash_v2_5");
    const cart = cartesiaRegistry.ttsConfig.models.map((m) => m.id);
    expect(cart).toContain("sonic-3.5");
    expect(cart).toContain("sonic-3.6");
  });
  it("playht and google-pse are flagged deprecated", () => {
    expect(playhtRegistry.display.deprecated).toBe(true);
    expect(gpseRegistry.display.deprecated).toBe(true);
  });
});

describe("image registries", () => {
  it("bfl lists the FLUX.2 family", () => {
    for (const id of ["flux-2-pro", "flux-2-max", "flux-2-flex", "flux-2-klein-9b", "flux-2-klein-4b"]) {
      expect(ids(bflRegistry)).toContain(id);
    }
  });
  it("recraft lists v4 variants, fal lists flux-2 + ideogram v3", () => {
    expect(ids(recraftRegistry)).toContain("recraftv4");
    expect(ids(recraftRegistry)).toContain("recraftv4_pro");
    expect(ids(falRegistry)).toContain("fal-ai/flux-2");
    expect(ids(falRegistry)).toContain("fal-ai/ideogram/v3");
  });
  it("runway lists gen4.5 + aleph, huggingface uses the router endpoint", () => {
    expect(ids(runwayRegistry)).toContain("gen4.5");
    expect(ids(runwayRegistry)).toContain("gen4_aleph");
    expect(huggingfaceRegistry.imageConfig.baseUrl).toContain("router.huggingface.co");
  });
});

describe("search quotas", () => {
  it("reflects current free tiers", () => {
    expect(exaRegistry.searchConfig.freeMonthlyQuota).toBe(1400);
    expect(firecrawlRegistry.fetchConfig.freeMonthlyQuota).toBe(1000);
    expect(youcomRegistry.searchConfig.freeMonthlyQuota).toBe(3000);
  });
});

describe("github copilot + ollama cloud lineups", () => {
  it("github dropped retired models and added current ones", () => {
    const gh = ids(githubRegistry);
    for (const id of ["gpt-5.2", "gpt-5.2-codex", "claude-opus-4.5", "claude-sonnet-4.6", "grok-code-fast-1", "gemini-2.5-pro",
      "gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5-mini", "claude-opus-4.7", "gemini-3.6-flash", "gemini-3.7-flash", "oswe-vscode-prime"]) {
      expect(gh).not.toContain(id);
    }
    for (const id of ["gpt-5.3-codex", "gpt-5.6-sol", "claude-opus-5", "claude-sonnet-5", "claude-haiku-4.5", "kimi-k3"]) {
      expect(gh).toContain(id);
    }
  });
  it("ollama cloud replaced retired pins with current ones", () => {
    const ol = ids(ollamaRegistry);
    expect(ol).not.toContain("kimi-k2.5");
    expect(ol).not.toContain("minimax-m2.5");
    for (const id of ["kimi-k3", "kimi-k2.6", "glm-5.3", "deepseek-v4-pro"]) {
      expect(ol).toContain(id);
    }
  });
});
