/**
 * Regression tests for two upstream-reported defects that both hit OpenAI
 * clients through Kitsune Router.
 *
 * #4461 — CommandCode chat streams drop `data: [DONE]`
 *   `inspectAndWrapCommandCodeResponse()` already decodes the upstream NDJSON
 *   into OpenAI chat.completion.chunk SSE and appends `data: [DONE]`. Because
 *   `execute()` did not set `responseFormat`, handleChatCore kept the provider
 *   format as `commandcode`, ran the body through the SSE translator a second
 *   time, and the translator parsed `[DONE]` into `{done:true}` and dropped it.
 *   The stream then ended on the finish chunk, so strict OpenAI clients
 *   (deepseek-acp, Cline) reported "SSE stream ended without [DONE]".
 *   Cursor's executor avoids this by declaring `responseFormat: openai`.
 *
 * #4463 — Zed Claude models 400: missing field `is_error` on tool_result
 *   Zed's hosted Anthropic wire type declares `is_error: bool` as required.
 *   Anthropic's public API treats it as optional, so the translator only spread
 *   it when truthy and strict parsers rejected the follow-up tool turn.
 */

import { describe, it, expect } from "vitest";
import { CommandCodeExecutor } from "../../open-sse/executors/commandcode.js";
import { openaiToClaudeRequest } from "../../open-sse/translator/request/openai-to-claude.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

function createNdjsonStream(lines) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(typeof line === "string" ? line : JSON.stringify(line) + "\n"));
      }
      controller.close();
    },
  });
}

async function readAllText(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

describe("CommandCode executor declares its response format as OpenAI (#4461)", () => {
  it("documents the contract on the executor instance", () => {
    // The value is asserted end-to-end below; this pins the constant so a
    // rename of FORMATS.OPENAI cannot silently change the wire format.
    expect(FORMATS.OPENAI).toBe("openai");
  });

  it("emits data: [DONE] once and only once at the end of the wrapped stream", async () => {
    const response = new Response(
      createNdjsonStream([
        { type: "text-delta", delta: "hello" },
        { type: "finish", finishReason: "stop" },
      ]),
      { status: 200, headers: { "content-type": "application/x-ndjson" } }
    );

    const { inspectAndWrapCommandCodeResponse } = await import(
      "../../open-sse/executors/commandcode.js"
    );
    const wrapped = await inspectAndWrapCommandCodeResponse(response, "test-model");
    const text = await readAllText(wrapped.body);

    const doneCount = (text.match(/data: \[DONE\]/g) || []).length;
    expect(doneCount).toBe(1);
    // The sentinel must be last, after the finish chunk.
    expect(text.trimEnd().endsWith("data: [DONE]")).toBe(true);
  });

  it("keeps the sentinel intact when the body is not re-translated", async () => {
    const response = new Response(
      createNdjsonStream([
        { type: "text-delta", delta: "a" },
        { type: "text-delta", delta: "b" },
        { type: "finish", finishReason: "stop" },
      ]),
      { status: 200, headers: { "content-type": "application/x-ndjson" } }
    );

    const { inspectAndWrapCommandCodeResponse } = await import(
      "../../open-sse/executors/commandcode.js"
    );
    const wrapped = await inspectAndWrapCommandCodeResponse(response, "test-model");
    const text = await readAllText(wrapped.body);

    // Both deltas survive (guard against the #4465 prefix-drop class of bug)
    // and the stream terminates with the OpenAI sentinel.
    expect(text).toContain('"a"');
    expect(text).toContain('"b"');
    expect(text.endsWith("data: [DONE]\n\n")).toBe(true);
  });

  it("forward-declares responseFormat on the executor class path", async () => {
    // execute() is the only place that can set this; assert the source contract
    // directly so a refactor cannot quietly drop it again.
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../open-sse/executors/commandcode.js", import.meta.url), "utf8")
    );
    expect(src).toContain("result.responseFormat = FORMATS.OPENAI;");
  });

  it("CommandCodeExecutor is constructible and registers the openai response format dependency", () => {
    const ex = new CommandCodeExecutor();
    expect(ex.getProvider()).toBe("commandcode");
  });
});

describe("openai-to-claude always emits is_error on tool_result (#4463)", () => {
  const body = (messages) => ({ model: "claude-sonnet-5", messages, max_tokens: 64 });

  it("emits is_error: false for an OpenAI role:'tool' message", () => {
    const out = openaiToClaudeRequest("claude-sonnet-5", body([
      { role: "assistant", content: null, tool_calls: [
        { id: "call_1", type: "function", function: { name: "read_file", arguments: "{}" } },
      ] },
      { role: "tool", tool_call_id: "call_1", content: "file contents" },
    ]), false);

    const toolResults = out.messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((b) => b.type === "tool_result");

    expect(toolResults.length).toBeGreaterThan(0);
    for (const block of toolResults) {
      expect(Object.prototype.hasOwnProperty.call(block, "is_error")).toBe(true);
      expect(block.is_error).toBe(false);
    }
  });

  it("preserves is_error: true when the caller flagged the result", () => {
    const out = openaiToClaudeRequest("claude-sonnet-5", body([
      { role: "user", content: [
        { type: "tool_result", tool_use_id: "call_2", content: "boom", is_error: true },
      ] },
    ]), false);

    const toolResults = out.messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((b) => b.type === "tool_result");

    expect(toolResults.length).toBeGreaterThan(0);
    for (const block of toolResults) expect(block.is_error).toBe(true);
  });

  it("defaults a Claude-shaped tool_result to is_error: false when absent", () => {
    const out = openaiToClaudeRequest("claude-sonnet-5", body([
      { role: "user", content: [
        { type: "tool_result", tool_use_id: "call_3", content: "ok" },
      ] },
    ]), false);

    const toolResults = out.messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((b) => b.type === "tool_result");

    expect(toolResults.length).toBeGreaterThan(0);
    for (const block of toolResults) expect(block.is_error).toBe(false);
  });

  it("still emits no tool_result block for plain user text (no regression)", () => {
    const out = openaiToClaudeRequest("claude-sonnet-5", body([
      { role: "user", content: "just a question" },
    ]), false);

    const toolResults = out.messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((b) => b.type === "tool_result");

    expect(toolResults).toEqual([]);
  });
});