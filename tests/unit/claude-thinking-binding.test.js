import { describe, expect, it } from "vitest";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { normalizeClaudePassthrough } from "../../open-sse/translator/formats/claude.js";

const model = "claude-opus-5-5";
const beta = "thinking-binding-controls-2026-08-01";
const makeBody = (thinking = {}) => ({
  model, max_tokens: 4096,
  thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "error" }, ...thinking },
  messages: [{ role: "user", content: "Continue the task." }],
});
const translate = (body, provider = "claude", id = body.model, headers = { "anthropic-beta": beta }) => translateRequest(
  FORMATS.CLAUDE, FORMATS.CLAUDE, id, body, false, { apiKey: "fixture-key", rawHeaders: headers }, provider,
);

describe.each(["claude", "anthropic"])("native thinking binding on %s", provider => {
  it.each(["error", "drop_block"])("preserves the exact caller %s prefix policy when adaptive thinking is mandatory", policy => {
    const source = makeBody({ block_binding: { prefix_mismatch_behavior: policy, future_binding: ["opaque", 7] },
      future_thinking: { nested: ["caller-value", false] } });
    const original = structuredClone(source);
    const sent = translate(source, provider);
    expect(sent.thinking).toMatchObject({ type: "adaptive", block_binding: original.thinking.block_binding,
      future_thinking: original.thinking.future_thinking });
    expect(source).toEqual(original);
  });

  it("keeps omitted display, opaque extensions and independent effort together", () => {
    const source = makeBody({ display: "omitted", future_thinking: { value: "exact" } });
    source.output_config = { effort: "high" };
    const sent = translate(source, provider);
    expect(sent.thinking).toEqual(source.thinking);
    expect(sent.output_config.effort).toBe("high");
  });

  it("retains the policy through an explicit effort suffix", () => {
    const source = makeBody();
    const sent = translate(source, provider, `${model}(high)`);
    expect(sent.thinking).toMatchObject(source.thinking);
    expect(sent.output_config.effort).toBe("high");
  });

  it("retains numeric manual budget and native binding extensions", () => {
    const source = makeBody({ type: "enabled", budget_tokens: 2048, display: "omitted" });
    source.model = "claude-sonnet-4-6";
    const sent = translate(source, provider);
    expect(sent.thinking).toEqual(source.thinking);
    expect(sent.max_tokens).toBe(4096);
  });

  it.each(["disabled", "between_tools"])("rejects incompatible %s binding instead of silently dropping the policy", type => {
    const source = makeBody({ type });
    source.model = "claude-sonnet-5-5";
    expect(() => translate(source, provider)).toThrow(expect.objectContaining({
      code: "unsupported_parameter", param: "thinking.block_binding",
    }));
  });

  it("rejects an off suffix when it would erase the explicit binding contract", () => {
    const source = makeBody();
    source.model = "claude-sonnet-4-6";
    expect(() => translate(source, provider, `${source.model}(none)`)).toThrow(expect.objectContaining({
      code: "unsupported_parameter", param: "thinking.block_binding",
    }));
  });
});

describe("native thinking extension scope", () => {
  it.each(["claude", "anthropic"])("rejects incompatible binding before native %s passthrough can replace its thinking arm", provider => {
    const source = makeBody({ type: "disabled" });
    source.model = "claude-sonnet-5-5";
    expect(() => normalizeClaudePassthrough(source, source.model, { "anthropic-beta": beta }, provider))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "thinking.block_binding" }));
  });

  it("keeps opaque native extensions when a supported disabled arm becomes between_tools", () => {
    const source = makeBody({ type: "disabled", future_thinking: { mode: "caller-owned" } });
    delete source.thinking.block_binding;
    source.model = "claude-sonnet-5-5";
    const sent = normalizeClaudePassthrough(source, source.model, {}, "claude");
    expect(sent.thinking).toEqual({ type: "between_tools", future_thinking: { mode: "caller-owned" } });
  });

  it("does not interpret a compatible vendor's unrelated native binding field", () => {
    const source = makeBody({ type: "disabled", block_binding: { vendor_mode: "opaque" } });
    source.model = "vendor-model";
    const sent = normalizeClaudePassthrough(source, source.model, {}, "anthropic-compatible-fixture");
    expect(sent.thinking.block_binding).toEqual({ vendor_mode: "opaque" });
  });

  it("does not inject the beta header when preserving caller body fields", () => {
    const source = makeBody();
    const sent = translate(source, "anthropic", model, {});
    expect(sent.thinking.block_binding).toEqual(source.thinking.block_binding);
    const headers = new Headers(new DefaultExecutor("anthropic").buildHeaders({ apiKey: "fixture-key", rawHeaders: {} }, false, undefined, model, sent));
    expect(headers.get("anthropic-beta").split(",")).not.toContain(beta);
  });

  it("does not leak native Claude binding or extension fields into an OpenAI request", () => {
    const source = makeBody({ future_thinking: { token: "opaque-extension" } });
    const sent = translateRequest(FORMATS.CLAUDE, FORMATS.OPENAI, "gpt-5", source, false, { apiKey: "fixture-key" }, "openai");
    expect(sent.thinking).toBeUndefined();
    expect(JSON.stringify(sent)).not.toContain("block_binding");
    expect(JSON.stringify(sent)).not.toContain("future_thinking");
  });

  it("fails explicitly when a canonical target cannot support any thinking", () => {
    expect(() => applyThinking(FORMATS.CLAUDE, model, makeBody(), "anthropic", undefined, { reasoning: false }))
      .toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "thinking" }));
  });
});
