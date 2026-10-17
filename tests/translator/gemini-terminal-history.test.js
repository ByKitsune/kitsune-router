import { describe, expect, it } from "vitest";
import "./registerAll.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";

const credentials = { projectId: "terminal-history-project", connectionId: "terminal-history" };
const targets = [FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.VERTEX];
const call = (id, name) => ({ id, type: "function", function: { name, arguments: '{"path":"notes.txt"}' } });
const translate = (target, messages) => translateRequest(
  FORMATS.OPENAI, target, "gemini-2.5-flash", { messages }, false, credentials,
  target === FORMATS.GEMINI_CLI ? "gemini-cli" : target
);
const request = (output) => output.request || output;

describe.each([FORMATS.GEMINI, FORMATS.GEMINI_CLI])("%s incoming thought history", (source) => {
  it.each([
    ["answer", [{ text: "Answer" }], "Answer"],
    ["thought-only", [], ""],
  ])("keeps thought text separate from %s", (_name, visible, content) => {
    const output = translateRequest(source, FORMATS.OPENAI, "gpt-4o", {
      contents: [{ role: "model", parts: [
        { thought: true, text: "First." },
        { thought: true, text: "Second." },
        ...visible,
      ] }, { role: "user", parts: [{ text: "Next" }] }],
    });
    expect(output.messages).toEqual([
      { role: "assistant", content, reasoning_content: "First.Second." },
      { role: "user", content: "Next" },
    ]);
  });

  it("keeps thought text with a paired function call rather than visible tool content", () => {
    const output = translateRequest(source, FORMATS.OPENAI, "gpt-4o", {
      contents: [{ role: "model", parts: [
        { thought: true, text: "First." },
        { thought: true, text: "Second." },
        { functionCall: { id: "call_1", name: "lookup", args: { key: "value" } } },
      ] }, { role: "user", parts: [
        { functionResponse: { id: "call_1", name: "lookup", response: { result: "done" } } },
      ] }],
    });
    const assistant = output.messages.find((message) => message.tool_calls);
    const tool = output.messages.find((message) => message.role === "tool");
    expect(assistant.reasoning_content).toBe("First.Second.");
    expect(assistant.content).toBeUndefined();
    expect(assistant.tool_calls).toEqual([
      { id: "call_1", type: "function", function: { name: "lookup", arguments: '{"key":"value"}' } },
    ]);
    expect(tool.tool_call_id).toBe(assistant.tool_calls[0].id);
    for (let pass = 0, history = output; pass < 3; pass++) {
      const roundTrip = translateRequest(FORMATS.OPENAI, FORMATS.GEMINI, "gemini-2.5-flash", history, false);
      const response = roundTrip.contents.flatMap((turn) => turn.parts).find((part) => part.functionResponse).functionResponse;
      expect(response).toEqual({ id: "call_1", name: "lookup", response: { result: "done" } });
      history = translateRequest(FORMATS.GEMINI, FORMATS.OPENAI, "gpt-4o", roundTrip, false);
    }
  });
});

// #4345: exercise the registered production translator, not the previously dead helper.
describe.each(targets)("%s terminal history", (target) => {
  it.each([
    { role: "assistant", content: "Previous answer" },
    { role: "assistant", content: null, reasoning_content: "Previous reasoning" },
  ])("adds a terminal user turn after assistant text or reasoning: %j", (assistant) => {
    const output = request(translate(target, [
      { role: "system", content: "Keep this rule" },
      { role: "user", content: [
        { type: "text", text: "Inspect this" },
        { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
      ] },
      assistant,
    ]));
    expect(output.contents.at(-1)).toEqual({ role: "user", parts: [{ text: "Continue." }] });
    expect(output.contents.at(-2).parts).toContainEqual(expect.objectContaining({
      text: assistant.content || assistant.reasoning_content,
    }));
    expect(output.contents[0].parts).toContainEqual({ inlineData: { mime_type: "image/png", data: "AAAA" } });
    expect(output.systemInstruction.parts).toEqual([{ text: "Keep this rule" }]);
  });

  it("reconciles every unanswered terminal parallel function call", () => {
    const output = request(translate(target, [
      { role: "user", content: "Read the notes" },
      { role: "assistant", content: null, tool_calls: [call("call_one", "read_file"), call("call_two", "stat_file")] },
    ]));
    const calls = output.contents.at(-2).parts.map((part) => part.functionCall);
    const responses = output.contents.at(-1);
    expect(responses.role).toBe("user");
    expect(responses.parts.map((part) => part.functionResponse)).toEqual(calls.map((fn) => ({
      name: fn.name,
      ...(target === FORMATS.VERTEX ? {} : { id: fn.id }),
      response: { result: "Continue." },
    })));
    expect(calls.map((fn) => fn.args)).toEqual([{ path: "notes.txt" }, { path: "notes.txt" }]);
    if (target !== FORMATS.VERTEX) expect(calls.map((fn) => fn.id)).toEqual(["call_one", "call_two"]);
  });

  it("keeps answered tool loops without adding synthetic responses", () => {
    const output = request(translate(target, [
      { role: "user", content: "Read the notes" },
      { role: "assistant", content: null, tool_calls: [call("call_one", "read_file")] },
      { role: "tool", tool_call_id: "call_one", content: '{"contents":"actual notes"}' },
    ]));
    expect(output.contents.map((turn) => turn.role)).toEqual(["user", "model", "user"]);
    expect(output.contents.at(-1).parts).toEqual([{ functionResponse: {
      name: "read_file",
      ...(target === FORMATS.VERTEX ? {} : { id: "call_one" }),
      response: { contents: "actual notes" },
    } }]);
  });

  it("keeps an existing terminal user turn unchanged", () => {
    const output = request(translate(target, [
      { role: "user", content: "First question" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "Next question" },
    ]));
    expect(output.contents.map((turn) => turn.parts)).toEqual([
      [{ text: "First question" }], [{ text: "First answer" }], [{ text: "Next question" }],
    ]);
  });
});

describe("Antigravity terminal history protocol", () => {
  it.each(["gemini-2.5-flash", "claude-sonnet-4-6"])("preserves the answered tool result role for %s", (model) => {
    const body = translateRequest(FORMATS.OPENAI, FORMATS.ANTIGRAVITY, model, {
      messages: [
        { role: "user", content: "Read the notes" },
        { role: "assistant", content: null, tool_calls: [call("call_one", "read_file")] },
        { role: "tool", tool_call_id: "call_one", content: '{"contents":"actual notes"}' },
      ],
    }, false, credentials, "antigravity");
    const output = new AntigravityExecutor().transformRequest(model, body, false, credentials);
    const responseTurn = output.request.contents.find((turn) => turn.parts.some((part) => part.functionResponse));
    expect(responseTurn.role).toBe("user");
    expect(responseTurn.parts.filter((part) => part.functionResponse).map((part) => part.functionResponse.response))
      .toEqual([{ contents: "actual notes" }]);
    expect(output.request.contents.flatMap((turn) => turn.parts).filter((part) => part.text === "Continue."))
      .toEqual([]);
  });
});
