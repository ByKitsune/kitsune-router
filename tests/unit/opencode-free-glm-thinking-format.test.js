import { describe, expect, it } from "vitest";
import { translateRequest } from "../../open-sse/translator/index.js";
import { OpenCodeExecutor } from "../../open-sse/executors/opencode.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";

const MODEL = "glm-5.3-flash-free";
const formats = ["openai", "openai-responses", "claude"];
const effortFields = (format, effort) => format === "claude" ? { output_config: { effort } }
  : format === "openai-responses" ? { reasoning: { effort } } : { reasoning_effort: effort };

function translate(format, extra, { provider = "opencode", model = MODEL } = {}) {
  const input = format === "openai-responses"
    ? { input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Describe the fixture." }] }], max_output_tokens: 1024 }
    : { messages: [{ role: "user", content: "Describe the fixture." }], max_tokens: 1024 };
  return translateRequest(format, "openai", model, { ...input, model, ...extra }, false, {}, provider);
}

// The pinned official OpenCode model table declares this exact hosted ID as
// Chat Completions. These offline payload assertions do not probe server enums:
// https://github.com/anomalyco/opencode/blob/802f2d8e75098ae0b45ad839ce98a31589ea8102/services/www/src/docs/content/console/models.mdx#L113
// PR #5003's accepted effort values remain the author's report, not our probe.
describe.each(formats)("OpenCode free GLM hosted Chat body from %s", format => {
  it.each(["low", "medium", "high"])("preserves %s effort without adding the native z.ai object", effort => {
    const body = translate(format, effortFields(format, effort));
    const executor = new OpenCodeExecutor();
    const sent = executor.transformRequest(MODEL, body, false, { connectionId: "synthetic-free-glm" });
    expect(executor.buildUrl(MODEL)).toBe("https://opencode.ai/zen/v1/chat/completions");
    expect(sent.model).toBe("glm-5.3-flash-free");
    expect(sent.reasoning_effort).toBe(effort);
    expect(sent).not.toHaveProperty("thinking");
    expect(sent).not.toHaveProperty("enable_thinking");
    expect(sent).not.toHaveProperty("reasoning");
    expect(sent).not.toHaveProperty("output_config");
    expect(sent.messages).toEqual([{ role: "user", content: "Describe the fixture." }]);
    expect(sent.max_tokens).toBe(1024);
  });
});

describe("hosted free GLM dialect is scoped to the exact route", () => {
  it("resolves the existing oc provider alias to the same hosted dialect", () => {
    const sent = translate("openai", { reasoning_effort: "medium" }, { provider: "oc" });
    expect(sent.reasoning_effort).toBe("medium");
    expect(sent).not.toHaveProperty("thinking");
  });

  it("uses the existing normalized effort precedence before applying the hosted dialect", () => {
    const sent = translate("openai", { output_config: { effort: "low" }, reasoning_effort: "high", reasoning: { effort: "medium" } });
    expect(sent.reasoning_effort).toBe("low");
    expect(sent).not.toHaveProperty("thinking");
  });

  it.each([
    ["glm", "glm-5.3-flash"],
    ["glm-cn", "glm-5.3-flash"],
    ["glm", "glm-5.3-flash-free"],
    ["glm-cn", "glm-5.3-flash-free"],
    ["opencode", "glm-5.3-flash"],
    ["opencode-go", "glm-5.3-flash"],
    ["openai-compatible-fixture", "glm-5.3-flash-free"],
    ["opencode", "vendor/glm-5.3-flash-free"],
  ])("leaves the existing native dialect on %s/%s unchanged", (provider, model) => {
    const sent = translate("openai", { reasoning_effort: "high" }, { provider, model });
    expect(sent.thinking).toEqual({ type: "enabled" });
  });

  it("inherits existing hosted model flags and limits instead of copying native or paid-route facts", () => {
    const hosted = getCapabilitiesForModel("opencode", MODEL);
    const unmodifiedFallback = getCapabilitiesForModel("openai-compatible-fixture", MODEL);
    const { thinkingFormat: _hostedFormat, ...hostedFacts } = hosted;
    const { thinkingFormat: _fallbackFormat, ...fallbackFacts } = unmodifiedFallback;
    expect(hostedFacts).toEqual(fallbackFacts);
  });
});
