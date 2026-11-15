import { describe, expect, it, vi } from "vitest";
import { createSSEStream } from "../../open-sse/utils/stream.js";

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
}));

const call = (index, id, args, name) => ({
  index, id, type: "function", function: { ...(name === undefined ? {} : { name }), arguments: args },
});
const chat = (tool_calls, index = 0) => ({ choices: [{ index, delta: { tool_calls } }] });
const finish = { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] };

async function consume(chunks, options = {}) {
  const input = chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
  const wire = await new Response(new Response(input).body.pipeThrough(createSSEStream(options))).text();
  return wire.split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
}
const calls = output => output.flatMap(event => event.choices || []).flatMap(choice => choice.delta?.tool_calls || []);

// Generic Chat IDs are append-only fragments. Without an explicit provider
// contract, equality cannot distinguish a repeated full ID from a valid fragment.
describe("generic Chat tool ID fragment preservation", () => {
  it.each(["translate", "passthrough"])("preserves equal ID fragments carrying arguments in generic %s mode", async mode => {
    const output = await consume([
      chat([call(0, "call_", "", "lookup")]),
      chat([call(0, "call_", '{"x":1}')]),
      finish,
    ], { mode });
    expect(calls(output).map(tool => tool.id || "").join("")).toBe("call_call_");
    expect(calls(output).map(tool => tool.function.arguments).join("")).toBe('{"x":1}');
  });

  it.each(["translate", "passthrough"])("preserves every repeated ID without a provider contract in %s mode", async mode => {
    const output = await consume([
      chat([call(0, "toolu_repeated", "", "lookup")]),
      chat([call(0, "toolu_repeated", '{"q":')]),
      chat([call(0, "toolu_repeated", '"x"}')]),
      finish,
    ], { mode });
    const actual = calls(output);
    expect(actual.map(tool => tool.id)).toEqual(["toolu_repeated", "toolu_repeated", "toolu_repeated"]);
    expect(actual.map(tool => tool.function.arguments).join("")).toBe('{"q":"x"}');
  });

  it("keeps identical IDs owned independently by choice and parallel tool index", async () => {
    const chunks = [0, 1].flatMap(choice => [
      chat([call(0, "same", "", "first"), call(1, "same", "", "second")], choice),
      chat([call(1, "same", "{}"), call(0, "same", "{}")], choice),
    ]);
    const output = await consume([...chunks, {
      choices: [0, 1].map(index => ({ index, delta: {}, finish_reason: "tool_calls" })),
    }], { body: { n: 2 } });
    for (const choice of [0, 1]) {
      const owned = output.flatMap(event => event.choices || []).filter(item => item.index === choice).flatMap(item => item.delta.tool_calls || []);
      for (const index of [0, 1]) expect(owned.filter(tool => tool.index === index).map(tool => tool.id)).toEqual(["same", "same"]);
    }
  });

  it("does not share identity state between simultaneous or later requests", async () => {
    const chunks = [chat([call(0, "shared", "", "lookup")]), chat([call(0, "shared", "{}")]), finish];
    const results = await Promise.all([consume(chunks), consume(chunks)]);
    results.push(await consume(chunks));
    expect(results.map(output => calls(output).map(tool => tool.id))).toEqual([
      ["shared", "shared"], ["shared", "shared"], ["shared", "shared"],
    ]);
  });

  it("preserves argument bytes and opaque metadata while restoring a compressed name", async () => {
    const name = `mcp_${"long_".repeat(20)}`;
    const output = await consume([
      chat([call(0, "toolu_named", "", "short")]),
      chat([{ ...call(0, "toolu_named", '{"raw":"a"}'), extra_content: { signature: "opaque==" } }]),
      finish,
    ], { toolNameMap: new Map([["short", name]]) });
    const actual = calls(output);
    expect(actual.map(tool => tool.id)).toEqual(["toolu_named", "toolu_named"]);
    expect(actual.map(tool => tool.function.name || "").join("")).toBe(name);
    expect(actual[1]).toMatchObject({ function: { arguments: '{"raw":"a"}' }, extra_content: { signature: "opaque==" } });
  });

  it("does not remove distinct ID fragments or assign index-less deltas to another tool", async () => {
    const output = await consume([
      chat([call(0, "call_", "", "lookup")]),
      chat([call(0, "fragment", "{}"), { id: "fragment", function: { arguments: "untouched" } }]),
      finish,
    ]);
    expect(calls(output).map(tool => tool.id)).toEqual(["call_", "fragment", "fragment"]);
  });

  it("preserves an ambiguous whole-ID-shaped fragment after fragmented delivery", async () => {
    const output = await consume([
      chat([call(0, "call_", "", "lookup")]),
      chat([call(0, "part", "")]),
      chat([call(0, "part", "")]),
      chat([call(0, "call_partpart", "{}")]),
      finish,
    ]);
    expect(calls(output).map(tool => tool.id)).toEqual(["call_", "part", "part", "call_partpart"]);
    expect(calls(output).map(tool => tool.function.arguments).join("")).toBe("{}");
  });

  it("preserves ambiguous adjacent equal ID-only fragments after a named opener", async () => {
    const output = await consume([
      chat([call(0, "call_", "", "lookup")]),
      chat([{ index: 0, id: "call_" }]),
      chat([{ index: 0, id: "tail" }]),
      chat([{ index: 0, function: { arguments: "{}" } }]),
      finish,
    ]);
    expect(calls(output).map(tool => tool.id || "").join("")).toBe("call_call_tail");
  });

  it("does not guess a complete ID before any named opener", async () => {
    const output = await consume([
      chat([{ index: 0, id: "call_" }]),
      chat([call(0, "call_", "")]),
      chat([call(0, "tail", "{}", "lookup")]),
      finish,
    ]);
    expect(calls(output).map(tool => tool.id || "").join("")).toBe("call_call_tail");
  });

  it.each(["function", "custom"])("preserves repeated %s ID fragments when the name arrives separately", async kind => {
    const input = kind === "function" ? "arguments" : "input";
    const output = await consume([
      chat([{ index: 0, id: "call_late", type: kind }]),
      chat([{ index: 0, [kind]: { name: "lookup" } }]),
      chat([{ index: 0, id: "call_late", [kind]: { [input]: "{}" } }]),
      finish,
    ]);
    expect(calls(output).map(tool => tool.id || "").join("")).toBe("call_latecall_late");
    expect(calls(output).map(tool => tool[kind]?.name || "").join("")).toBe("lookup");
    expect(calls(output).map(tool => tool[kind]?.[input] || "").join("")).toBe("{}");
  });

  it("preserves repeated custom ID fragments on input-only continuations", async () => {
    const output = await consume([
      chat([{ index: 0, id: "custom_1", type: "custom", custom: { name: "run", input: "" } }]),
      chat([{ index: 0, id: "custom_1", custom: { input: "code" } }]),
      finish,
    ]);
    expect(calls(output).map(tool => tool.id)).toEqual(["custom_1", "custom_1"]);
    expect(calls(output).map(tool => tool.custom?.input || "").join("")).toBe("code");
  });
});
