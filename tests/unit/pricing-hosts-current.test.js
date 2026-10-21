import { describe, it, expect } from "vitest";
import { calculateCostFromTokens, getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import groqRegistry from "../../open-sse/providers/registry/groq.js";
import cerebrasRegistry from "../../open-sse/providers/registry/cerebras.js";
import togetherRegistry from "../../open-sse/providers/registry/together.js";
import nebiusRegistry from "../../open-sse/providers/registry/nebius.js";
import cohereRegistry from "../../open-sse/providers/registry/cohere.js";
import perplexityRegistry from "../../open-sse/providers/registry/perplexity.js";
import voyageRegistry from "../../open-sse/providers/registry/voyage-ai.js";

const ids = (r) => r.models.map((m) => m.id);

describe("inference hosts drop retired serverside IDs", () => {
  it("groq dropped Llama-4/Qwen3-32B and added current IDs", () => {
    expect(ids(groqRegistry)).not.toContain("meta-llama/llama-4-maverick-17b-128e-instruct");
    expect(ids(groqRegistry)).not.toContain("qwen/qwen3-32b");
    for (const id of ["openai/gpt-oss-20b", "qwen/qwen3.8-27b", "llama-3.1-8b-instant"]) {
      expect(ids(groqRegistry)).toContain(id);
    }
  });
  it("cerebras serves only the two public endpoints now", () => {
    expect(ids(cerebrasRegistry)).toContain("qwen-3.8-27b");
    for (const id of ["zai-glm-4.7", "llama-3.3-70b", "llama-4-scout-17b-16e-instruct", "qwen-3-32b"]) {
      expect(ids(cerebrasRegistry)).not.toContain(id);
    }
  });
  it("together dropped R1/Llama-4/embeddings and added V4/K3/GLM/Qwen", () => {
    expect(ids(togetherRegistry)).not.toContain("deepseek-ai/DeepSeek-R1");
    expect(ids(togetherRegistry)).not.toContain("BAAI/bge-large-en-v1.5");
    for (const id of ["deepseek-ai/DeepSeek-V4-Pro-0813", "moonshotai/Kimi-K3", "zai-org/GLM-5.3", "openai/gpt-oss-120b"]) {
      expect(ids(togetherRegistry)).toContain(id);
    }
  });
  it("nebius moved to the tokenfactory endpoint", () => {
    expect(nebiusRegistry.transport.baseUrl).toContain("api.tokenfactory.nebius.com");
    expect(ids(nebiusRegistry)).not.toContain("meta-llama/Llama-3.3-70B-Instruct");
  });
});

describe("Cohere / Sonar / Voyage catalog", () => {
  it("cohere lists the current Command family with 256K caps for Command A", () => {
    for (const id of ["command-r7b-12-2024", "command-a-reasoning-08-2025", "command-a-vision-07-2025", "command-a-plus-05-2026"]) {
      expect(ids(cohereRegistry)).toContain(id);
    }
    expect(getCapabilitiesForModel("cohere", "command-a-03-2025").contextWindow).toBe(256000);
    // Captured current Command R page has no price. Do not use search summaries
    // or the pricing FAQ's different03-2024 model as a current08-2024 quote.
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 1000000 }, getPricingForModel("cohere", "command-r-08-2024"))).toBeNull();
  });
  it("perplexity lists reasoning-pro/deep-research with 200K sonar-pro caps", () => {
    expect(ids(perplexityRegistry)).toContain("sonar-reasoning-pro");
    expect(ids(perplexityRegistry)).toContain("sonar-deep-research");
    expect(getCapabilitiesForModel("perplexity", "sonar-pro").contextWindow).toBe(200000);
    // Sonar migration guide: compatibility requests now reformulate Agent calls;
    // the old standalone3/15 quote does not establish the migrated invoice.
    expect(getCapabilitiesForModel("perplexity", "sonar-pro").maxOutput).toBeNull();
    expect(calculateCostFromTokens({ prompt_tokens: 1000000, completion_tokens: 1000000 }, getPricingForModel("perplexity", "sonar-pro"))).toBeNull();
  });
  it("voyage lists v4 flagships with embedding prices", () => {
    for (const id of ["voyage-4-large", "voyage-4", "voyage-4-lite"]) {
      expect(ids(voyageRegistry)).toContain(id);
    }
    expect(getPricingForModel("voyage-ai", "voyage-4").input).toBe(0.06);
  });
});
