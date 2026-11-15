import { describe, expect, it, vi } from "vitest";
import { createSSEStream } from "../../open-sse/utils/stream.js";
import { FORMATS as F } from "../../open-sse/translator/formats.js";

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
}));

const usage = { input_tokens: 7, output_tokens: 3, total_tokens: 10 };
const message = (id, content) => ({ id, type: "message", role: "assistant", status: "completed", content });
const part = (text, refusal) => refusal ? { type: "refusal", refusal: text } : { type: "output_text", text };
const terminal = output => ({ type: "response.completed", response: { id: "resp_snapshots", status: "completed", output, usage } });

async function consume(events, sourceFormat) {
  const complete = vi.fn();
  const wire = events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  const bytes = new TextEncoder().encode(wire);
  const upstream = new ReadableStream({ start(controller) {
    for (let index = 0; index < bytes.length; index += 19) controller.enqueue(bytes.subarray(index, index + 19));
    controller.close();
  } });
  const text = await new Response(upstream.pipeThrough(createSSEStream({
    targetFormat: F.OPENAI_RESPONSES, sourceFormat, onStreamComplete: complete,
  }))).text();
  const output = text.split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
  return {
    output, complete,
    content: output.map(event => sourceFormat === F.OPENAI
      ? event.choices?.[0]?.delta?.content || event.choices?.[0]?.delta?.refusal || ""
      : event.delta?.type === "text_delta" ? event.delta.text : "").join(""),
  };
}

describe.each([F.OPENAI, F.CLAUDE])("Responses text snapshots for %s", format => {
  it.each([false, true])("recovers final-only content with refusal=%s", async refusal => {
    const { content, output, complete } = await consume([terminal([message("msg_one", [part("Answer 🌍", refusal)])])], format);
    expect(content).toBe("Answer 🌍");
    expect(complete.mock.calls[0][0].content).toBe("Answer 🌍");
    expect(complete.mock.calls[0][1]).toMatchObject({ prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 });
    expect(complete.mock.calls[0][3]).toMatchObject({ failed: false });
    expect(format === F.OPENAI
      ? output.flatMap(event => event.choices || []).filter(choice => choice.finish_reason).length
      : output.filter(event => event.type === "message_stop").length).toBe(1);
  });

  it.each([false, true])("recovers only unseen suffixes across done/item/terminal snapshots with refusal=%s", async refusal => {
    const type = refusal ? "refusal" : "output_text";
    const finalItem = message("msg_one", [part("Hello 🌍!", refusal)]);
    const { content, complete } = await consume([
      { type: `response.${type}.delta`, item_id: "msg_one", output_index: 0, content_index: 0, delta: "Hello " },
      { type: `response.${type}.done`, item_id: "msg_one", output_index: 0, content_index: 0, [refusal ? "refusal" : "text"]: "Hello 🌍" },
      { type: "response.content_part.done", item_id: "msg_one", output_index: 0, content_index: 0, part: part("Hello 🌍", refusal) },
      { type: "response.output_item.done", output_index: 0, item: finalItem },
      terminal([finalItem]),
    ], format);
    expect(content).toBe("Hello 🌍!");
    expect(complete.mock.calls[0][0].content).toBe(content);
  });

  it("keeps equal text in independent items and content parts", async () => {
    const { content } = await consume([
      { type: "response.output_text.delta", item_id: "msg_a", output_index: 0, content_index: 0, delta: "Same" },
      { type: "response.output_item.done", output_index: 0, item: message("msg_a", [part("Same"), part("Same")]) },
      terminal([message("msg_a", [part("Same"), part("Same")]), message("msg_b", [part("Same")])]),
    ], format);
    expect(content).toBe("SameSameSame");
  });

  it("does not replay text from a shorter final snapshot", async () => {
    const { content } = await consume([
      { type: "response.output_text.delta", item_id: "msg_a", output_index: 0, content_index: 0, delta: "Long answer" },
      terminal([message("msg_a", [part("Long")])]),
    ], format);
    expect(content).toBe("Long answer");
  });
});
