import { describe, expect, it, vi } from "vitest";
const work = vi.hoisted(() => ({ splitIds: 0 }));
vi.mock("../../open-sse/translator/concerns/thoughtSignature.js", async importOriginal => {
  const original = await importOriginal();
  return { ...original, splitToolCallId(...args) { work.splitIds++; return original.splitToolCallId(...args); } };
});
import { fixMissingToolResponses } from "../../open-sse/translator/concerns/toolCall.js";
import { fixToolUseOrdering } from "../../open-sse/translator/formats/claude.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const signed = id => `${id}_TSIG_${Buffer.from("c2lnbmF0dXJl", "utf8").toString("base64url")}`;
const call = id => ({ id, type: "function", function: { name: "inspect", arguments: "{}" } });
const result = id => ({ role: "tool", tool_call_id: id, content: `result:${id}` });

describe("parallel tool history preparation", () => {
  it("reconciles reversed signed results with linear ID decoding and no fabricated replies", () => {
    const ids = Array.from({ length: 2048 }, (_, index) => `call_${index}`);
    const body = { messages: [
      { role: "assistant", content: null, tool_calls: ids.map(id => call(signed(id))) },
      ...ids.toReversed().map(result),
      { role: "user", content: "Continue." },
    ] };
    const messages = body.messages;
    work.splitIds = 0;
    expect(fixMissingToolResponses(body)).toBe(body);
    expect(body.messages).toBe(messages);
    expect(body.messages.slice(1, -1).map(item => item.tool_call_id)).toEqual(ids.toReversed());
    // Work bound, not an elapsed-time assertion: a large result run must not
    // repeatedly decode every still-pending opaque ID for each result.
    expect(work.splitIds).toBeLessThanOrEqual(ids.length * 3);
  });

  it("consumes repeated raw IDs once in original call order across batches", () => {
    const first = signed("shared");
    const second = `shared_TSIG_${Buffer.from("b3RoZXI=", "utf8").toString("base64url")}`;
    const body = { messages: [
      { role: "assistant", tool_calls: [call(first), call("unrelated"), call(second)] },
      result(second),
      { role: "user", content: "Continue first batch." },
      { role: "assistant", tool_calls: [call(signed("shared")), call("done")] },
      result("done"), result("shared"),
      { role: "user", content: "Continue second batch." },
    ] };
    fixMissingToolResponses(body);
    expect(body.messages.filter(item => item.role === "tool" && item.content === "").map(item => item.tool_call_id)).toEqual(["unrelated", second]);
    expect(body.messages.filter(item => item.role === "tool" && item.content !== "").map(item => item.tool_call_id)).toEqual([second, "done", "shared"]);
  });

  it("merges a long Claude result run in linear block work with stable media/text order", () => {
    let reads = 0;
    const blocks = Array.from({ length: 2048 }, (_, index) => ({
      get type() { reads++; return index % 2 ? "text" : "tool_result"; },
      ...(index % 2 ? { text: `text:${index}` } : { tool_use_id: `call_${index}`, content: `result:${index}` }),
    }));
    const messages = blocks.map(block => ({ role: "user", content: [block] }));
    const merged = fixToolUseOrdering(messages);
    expect(merged).toHaveLength(1);
    expect(merged[0].content).toEqual([...blocks.filter((_, index) => index % 2 === 0), ...blocks.filter((_, index) => index % 2 === 1)]);
    expect(reads).toBeLessThanOrEqual(blocks.length * 4);
    expect(messages[0].content).toEqual([blocks[0]]);
  });

  it("preserves singleton block order and starts a fresh partition at role boundaries", () => {
    const single = [{ type: "text", text: "before" }, { type: "tool_result", tool_use_id: "one", content: "one" }];
    const messages = [
      { role: "user", content: single },
      { role: "assistant", content: [{ type: "text", text: "answer" }] },
      { role: "user", content: [{ type: "text", text: "second" }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "two", content: "two" }] },
    ];
    const merged = fixToolUseOrdering(messages);
    expect(merged[0].content).toEqual(single);
    expect(merged[2].content).toEqual([{ type: "tool_result", tool_use_id: "two", content: "two" }, { type: "text", text: "second" }]);
  });

  it.each([
    [FORMATS.CLAUDE, "claude-sonnet-4-6", "claude"],
    [FORMATS.GEMINI, "gemini-2.5-flash", "gemini"],
    [FORMATS.OPENAI_RESPONSES, "gpt-4.1", "openai"],
  ])("keeps a borrowed parallel history intact through the actual %s request path", (target, model, provider) => {
    const ids = Array.from({ length: 64 }, (_, index) => `call_${index}`);
    const body = { max_tokens: 100, messages: [
      { role: "user", content: "Inspect records." },
      { role: "assistant", content: null, tool_calls: ids.map(call) },
      ...ids.toReversed().map(result),
      { role: "user", content: "Continue." },
    ] };
    const before = structuredClone(body);
    const wire = translateRequest(FORMATS.OPENAI, target, model, body, false, { connectionId: "fixture" }, provider);
    expect(body).toEqual(before);
    if (target === FORMATS.CLAUDE) {
      expect(wire.messages.filter(item => item.role === "user").flatMap(item => item.content || []).filter(block => block.type === "tool_result").map(block => block.tool_use_id)).toEqual(ids.toReversed());
      expect(wire.max_tokens).toBe(100);
    } else if (target === FORMATS.GEMINI) {
      expect(wire.contents.flatMap(item => item.parts || []).filter(part => part.functionResponse).map(part => part.functionResponse.response)).toHaveLength(ids.length);
      expect(wire.generationConfig.maxOutputTokens).toBe(100);
    } else {
      expect(wire.input.filter(item => item.type === "function_call_output").map(item => item.call_id)).toEqual(ids.toReversed());
      expect(wire.max_output_tokens).toBe(100);
    }
  });
});
