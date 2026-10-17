import { describe, expect, it } from "vitest";
import { openaiToClaudeResponse } from "../../open-sse/translator/response/openai-to-claude.js";

function createState() {
  return { toolCalls: new Map(), nextBlockIndex: 0 };
}

function getInputJsonDeltas(events) {
  return events
    .filter((event) => event.type === "content_block_delta" && event.delta?.type === "input_json_delta")
    .map((event) => event.delta.partial_json);
}

const ARGS = JSON.stringify({ file_path: "F:/repo/file.js" });

function startToolCall(state) {
  openaiToClaudeResponse({
    id: "chatcmpl-test-dup",
    model: "test-model",
    choices: [{ delta: { tool_calls: [{ index: 0, id: "toolu_dup", function: { name: "Read" } }] } }],
  }, state);
}

describe("openaiToClaudeResponse arg doubling guards (#2869)", () => {
  it("preserves argument deltas literally instead of guessing cumulative snapshots from a shared prefix", () => {
    const state = createState();
    startToolCall(state);

    openaiToClaudeResponse({
      id: "chatcmpl-test-dup",
      model: "test-model",
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ARGS.slice(0, 10) } }] } }],
    }, state);
    openaiToClaudeResponse({
      id: "chatcmpl-test-dup",
      model: "test-model",
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ARGS } }] } }],
    }, state);

    const events = openaiToClaudeResponse({
      id: "chatcmpl-test-dup",
      model: "test-model",
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    }, state);

    const partials = getInputJsonDeltas(events);
    expect(partials).toHaveLength(1);
    expect(partials[0]).toBe(ARGS.slice(0, 10) + ARGS);
  });

  it("emits buffered args only once when finish_reason repeats on a trailing chunk", () => {
    const state = createState();
    startToolCall(state);

    openaiToClaudeResponse({
      id: "chatcmpl-test-dup",
      model: "test-model",
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ARGS } }] } }],
    }, state);

    const first = openaiToClaudeResponse({
      id: "chatcmpl-test-dup",
      model: "test-model",
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    }, state);
    const second = openaiToClaudeResponse({
      id: "chatcmpl-test-dup",
      model: "test-model",
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }, state);

    const firstPartials = getInputJsonDeltas(first || []);
    const secondPartials = getInputJsonDeltas(second || []);
    expect(firstPartials).toHaveLength(1);
    expect(secondPartials).toHaveLength(0);
  });

  it("still appends for true incremental providers", () => {
    const state = createState();
    startToolCall(state);

    const firstChunk = '{"file_';
    const secondChunk = 'path":"x"}';

    openaiToClaudeResponse({
      id: "chatcmpl-test-dup",
      model: "test-model",
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: firstChunk } }] } }],
    }, state);
    openaiToClaudeResponse({
      id: "chatcmpl-test-dup",
      model: "test-model",
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: secondChunk } }] } }],
    }, state);

    const events = openaiToClaudeResponse({
      id: "chatcmpl-test-dup",
      model: "test-model",
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    }, state);

    expect(JSON.parse(getInputJsonDeltas(events)[0])).toEqual({ file_path: "x" });
  });
});
