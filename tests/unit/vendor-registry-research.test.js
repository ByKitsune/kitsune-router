import { describe, it, expect } from "vitest";
import p0 from "../../open-sse/providers/registry/alicode.js";
import p1 from "../../open-sse/providers/registry/alicode-intl.js";
import p2 from "../../open-sse/providers/registry/alims-intl.js";
import p3 from "../../open-sse/providers/registry/alitp-intl.js";
import p4 from "../../open-sse/providers/registry/kimi.js";
import p5 from "../../open-sse/providers/registry/xiaomi-mimo.js";
import p6 from "../../open-sse/providers/registry/xiaomi-tokenplan.js";
import p7 from "../../open-sse/providers/registry/cohere.js";
import p8 from "../../open-sse/providers/registry/baidu.js";
import p9 from "../../open-sse/providers/registry/mistral.js";
import p10 from "../../open-sse/providers/registry/perplexity-agent.js";

describe("researched non-core vendor registry additions", () => {
  it("lists only the six versions supported by the current CN Coding Plan", () => {
    const ids = p0.models.map((model) => model.id);
    expect(ids).toEqual(expect.arrayContaining(["qwen3.7-plus", "qwen3.6-plus", "kimi-k2.5"]));
    expect(ids).toEqual(expect.arrayContaining(["qwen3.5-plus", "glm-5", "MiniMax-M2.5"]));
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("lists only the six versions supported by the current global Coding Plan", () => {
    const ids = p1.models.map((model) => model.id);
    expect(ids).toEqual(expect.arrayContaining(["qwen3.7-plus", "qwen3.6-plus", "kimi-k2.5"]));
    expect(ids).toEqual(expect.arrayContaining(["qwen3.5-plus", "glm-5", "MiniMax-M2.5"]));
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("lists documented alims-intl text models without dropping compatibility IDs", () => {
    const ids = p2.models.map((model) => model.id);
    expect(ids).toEqual(expect.arrayContaining(["qwen3.8-max", "qwen3.8-flash", "qwen3.7-plus", "qwen3.6-plus"]));
    expect(ids).toEqual(expect.arrayContaining(["qwen3.5-plus", "kimi-k2.5", "glm-5", "MiniMax-M2.5", "qwen3-coder-next", "qwen3-coder-plus", "glm-4.7"]));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("lists documented alitp-intl text models without dropping compatibility IDs", () => {
    const ids = p3.models.map((model) => model.id);
    expect(ids).toEqual(expect.arrayContaining(["auto", "deepseek-v4.1-flash", "deepseek-v4-pro-0813", "deepseek-v4-flash-0731", "glm-5.3"]));
    expect(ids).toEqual(expect.arrayContaining(["qwen3.8-max", "qwen3.8-flash", "qwen3.7-max", "qwen3.7-plus", "qwen3.7-flash", "qwen3.6-plus", "qwen3.6-flash", "qwen3.5-flash", "glm-5.2", "deepseek-v4-pro"]));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("lists documented kimi text models without dropping compatibility IDs", () => {
    const ids = p4.models.map((model) => model.id);
    expect(ids).toEqual(expect.arrayContaining(["k3-256k"]));
    expect(ids).toEqual(expect.arrayContaining(["kimi-k3", "k3", "kimi-for-coding", "kimi-for-coding-highspeed", "kimi-k2.7-code", "kimi-k2.7-code-highspeed", "kimi-k2.6"]));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("lists documented xiaomi-mimo text models without dropping compatibility IDs", () => {
    const ids = p5.models.map((model) => model.id);
    expect(ids).toEqual(expect.arrayContaining(["mimo-v2.6-pro", "mimo-v2.6-flash"]));
    expect(ids).toEqual(expect.arrayContaining(["mimo-v2.5-pro", "mimo-v2.5", "mimo-v2.5-asr", "mimo-v2.5-tts"]));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("lists documented xiaomi-tokenplan text models without dropping compatibility IDs", () => {
    const ids = p6.models.map((model) => model.id);
    expect(ids).toEqual(expect.arrayContaining(["mimo-v2.6-pro", "mimo-v2.6-flash"]));
    expect(ids).toEqual(expect.arrayContaining(["mimo-v2.5-pro", "mimo-v2.5-pro-claude", "mimo-v2.5", "mimo-v2.5-tts", "mimo-v2.5-tts-voiceclone", "mimo-v2.5-tts-voicedesign"]));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("defers native Cohere additions until the compatibility endpoint is verified", () => {
    const ids = p7.models.map((model) => model.id);
    for (const id of ["tiny-aya-global", "tiny-aya-earth", "tiny-aya-fire", "tiny-aya-water", "c4ai-aya-expanse-32b", "c4ai-aya-vision-32b"]) expect(ids).not.toContain(id);
    expect(ids).toEqual(expect.arrayContaining(["command-a-03-2025", "command-a-reasoning-08-2025", "command-a-vision-07-2025", "command-a-translate-08-2025", "command-a-plus-05-2026", "command-r-plus-08-2024", "command-r-08-2024", "command-r7b-12-2024"]));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("lists documented baidu text models without dropping compatibility IDs", () => {
    const ids = p8.models.map((model) => model.id);
    expect(ids).toEqual(expect.arrayContaining(["ernie-5.0-thinking-preview", "ernie-5.0-thinking-latest", "ernie-5.0-thinking-exp", "ernie-4.5-turbo-32k", "ernie-4.5-turbo-20260402", "ernie-4.5-turbo-vl", "ernie-4.5-turbo-vl-32k", "deepseek-v4.1-flash", "deepseek-v4-pro-0813", "deepseek-v4-flash-0731", "qwen3.5-122b-a10b", "qwen3.5-35b-a3b", "glm-5.3", "glm-5.3-flash"]));
    expect(ids).toEqual(expect.arrayContaining(["ernie-5.1", "ernie-5.0", "ernie-4.5-turbo-128k", "ernie-x1.1", "ernie-x1-turbo-32k", "deepseek-v4-pro", "deepseek-v4-flash", "glm-5.2", "glm-5.1", "kimi-k2.6", "qwen3.5-397b-a17b", "qwen3.5-27b"]));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("lists documented mistral text models without dropping compatibility IDs", () => {
    const ids = p9.models.map((model) => model.id);
    expect(ids).toEqual(expect.arrayContaining(["zai-glm-5-3", "ministral-14b-2512", "ministral-8b-2512", "ministral-3b-2512"]));
    expect(ids).toEqual(expect.arrayContaining(["mistral-large-latest", "mistral-small-latest", "codestral-latest", "mistral-medium-latest", "mistral-embed"]));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("lists documented perplexity-agent text models without dropping compatibility IDs", () => {
    const ids = p10.models.map((model) => model.id);
    expect(ids).toEqual(expect.arrayContaining(["anthropic/claude-fable-5", "anthropic/claude-fable-5-1", "anthropic/claude-opus-5-5", "anthropic/claude-opus-5", "anthropic/claude-opus-4-7", "anthropic/claude-opus-4-6", "anthropic/claude-opus-4-5", "anthropic/claude-sonnet-5-5", "anthropic/claude-sonnet-5", "anthropic/claude-sonnet-4-5", "anthropic/claude-haiku-4-5", "openai/gpt-6.1-sol", "openai/gpt-6-sol", "openai/gpt-6-luna", "openai/gpt-5.6-sol", "openai/gpt-5.6-terra", "openai/gpt-5.6-luna", "google/gemini-3.1-flash-lite", "google/gemini-3.5-flash", "google/gemini-3.5-flash-lite", "google/gemini-3.6-flash", "google/gemini-3.7-flash", "google/gemini-3.8-flash", "google/gemini-3-flash-preview", "xai/grok-4.7", "xai/grok-4.6", "xai/grok-4.5", "xai/grok-4.3", "xai/grok-4.20-non-reasoning", "xai/grok-4.20-multi-agent", "perplexity/glm-5.3-flash", "perplexity/kimi-k3"]));
    expect(ids).toEqual(expect.arrayContaining(["perplexity/sonar", "openai/gpt-5.5", "openai/gpt-5.4", "openai/gpt-5.4-mini", "anthropic/claude-sonnet-4-6", "anthropic/claude-opus-4-8", "google/gemini-3.1-pro-preview", "xai/grok-4.20-reasoning", "perplexity/glm-5.3", "perplexity/kimi-k2.7-code", "perplexity/nemotron-3-ultra-550b-a55b"]));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
