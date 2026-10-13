// 9router #4740: ParalonCloud serves open models on an OpenAI-compatible API.
// It is registered as a built-in API-key provider next to Hyperbolic/Chutes/
// Nebius — chat, streaming, tool calls, Anthropic-format and embeddings all go
// through the generic DefaultExecutor, so no executor file is needed.
import { describe, expect, it } from "vitest";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import { PROVIDER_MODELS, getModelsByProviderId } from "../../open-sse/config/providerModels.js";
import { resolveProviderAlias } from "../../open-sse/services/model.js";
import { AI_PROVIDERS } from "../../src/shared/constants/providers.js";
import REGISTRY from "../../open-sse/providers/registry/index.js";

describe("ParalonCloud provider (#4740)", () => {
  it("is present in the registry with API-key category", () => {
    const entry = REGISTRY.find((r) => r.id === "paraloncloud");
    expect(entry).toBeTruthy();
    expect(entry.category).toBe("apikey");
    expect(entry.authType).toBe("apikey");
    expect(entry.transport.baseUrl).toBe("https://paraloncloud.com/v1/chat/completions");
    expect(entry.transport.validateUrl).toBe("https://paraloncloud.com/v1/models");
  });

  it("exposes the documented models, including the embedding entry", () => {
    const models = getModelsByProviderId("paraloncloud");
    const ids = models.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["qwen3.8-27b", "qwen3-3b", "multilingual-e5-small"]));
    const emb = models.find((m) => m.id === "multilingual-e5-small");
    expect(emb.kind).toBe("embedding");
  });

  it("resolves the transport and alias like other OpenAI-compatible keys", () => {
    expect(PROVIDERS.paraloncloud.baseUrl).toBe("https://paraloncloud.com/v1/chat/completions");
    expect(PROVIDERS.paraloncloud.format).toBe("openai");
    // No dedicated executor: the generic OpenAI-compatible path handles it.
    expect(resolveProviderAlias("paralon")).toBe("paraloncloud");
    expect(resolveProviderAlias("paraloncloud")).toBe("paraloncloud");
    expect(PROVIDER_MODELS.paraloncloud?.length).toBeGreaterThan(0);
  });

  it("declares the embedding service kind so the media routes pick it up", () => {
    const entry = REGISTRY.find((r) => r.id === "paraloncloud");
    expect(entry.serviceKinds).toContain("llm");
    expect(entry.serviceKinds).toContain("embedding");
    expect(entry.embeddingConfig?.baseUrl).toBe("https://paraloncloud.com/v1/embeddings");
  });

  it("is not marked hidden or deprecated", () => {
    const entry = AI_PROVIDERS.paraloncloud;
    expect(entry).toBeTruthy();
    expect(entry.hidden).toBeFalsy();
    expect(entry.deprecated).toBeFalsy();
  });
});
