import { describe, expect, it } from "vitest";
import { createSSEStream } from "../../open-sse/utils/stream.js";

describe("Chat SSE empty finish-reason compatibility (#4926)", () => {
  it.each(["translate", "passthrough"])("normalizes only the empty nonterminal reason in %s while retaining terminal, usage and DONE exactly once", async mode => {
    const frames = [
      { id: "synthetic", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "hello" }, finish_reason: "" }] },
      { id: "synthetic", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
      { id: "synthetic", choices: [], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } },
    ];
    const wire = frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\ndata: [DONE]\n\n";
    const completed = [];
    const transform = createSSEStream({ mode, sourceFormat: "openai", targetFormat: "openai", provider: "synthetic", model: "model",
      onStreamComplete: info => { completed.push(info); } });
    const text = await new Response(new Response(wire).body.pipeThrough(transform)).text();
    const chunks = text.split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
    const choices = chunks.flatMap(chunk => chunk.choices || []);
    expect(choices[0]).toMatchObject({ delta: { content: "hello" }, finish_reason: null });
    expect(choices.filter(choice => choice.finish_reason === "stop")).toHaveLength(1);
    expect(text.match(/data: \[DONE\]/g)).toHaveLength(1);
    expect(completed).toHaveLength(1);
    expect(chunks.some(chunk => chunk.usage?.total_tokens === 4)).toBe(true);
  });
});
