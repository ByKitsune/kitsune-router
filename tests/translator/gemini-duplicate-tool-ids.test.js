import { describe, expect, it } from "vitest";
import "./registerAll.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { buildToolCallId, splitToolCallId } from "../../open-sse/translator/concerns/thoughtSignature.js";

const model = "gemini-2.5-flash";
const targets = [FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.ANTIGRAVITY];
const call = (id, name, args) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const response = (id, result) => ({ role: "tool", tool_call_id: id, content: JSON.stringify(result) });
const assistant = (...toolCalls) => ({ role: "assistant", content: null, tool_calls: toolCalls });

function wire(target, body, requestedModel = model) {
  const credentials = { projectId: "duplicate-ids-project", connectionId: "duplicate-ids-session" };
  const translated = translateRequest(FORMATS.OPENAI, target, requestedModel, body, false, credentials, target);
  const payload = target === FORMATS.ANTIGRAVITY
    ? new AntigravityExecutor().transformRequest(requestedModel, translated, false, credentials)
    : translated;
  expect(payload.model).toBe(requestedModel);
  return payload.request || payload;
}

function exchanges(payload) {
  const calls = payload.contents.flatMap((turn) => turn.parts.filter((part) => part.functionCall).map((part) => part.functionCall));
  const responses = payload.contents.flatMap((turn) => turn.parts.filter((part) => part.functionResponse).map((part) => part.functionResponse));
  return { calls, responses };
}

// #4532: assert the registered translator and Antigravity executor's Google wire payload.
describe.each(targets)("%s duplicate tool call IDs", (target) => {
  it("pairs reused IDs with each turn's own name, arguments and result without mutating fallback input", () => {
    const body = {
      messages: [
        { role: "user", content: "Run step one" },
        assistant(call("call_51859", "read_file", { path: "first.txt" })),
        response("call_51859", { contents: "first result" }),
        { role: "user", content: "Run step two" },
        assistant(call("call_51859", "write_file", { path: "second.txt", text: "updated" })),
        response("call_51859", { written: "second result" }),
      ],
    };
    const before = structuredClone(body);
    const payload = wire(target, body);
    const { calls, responses } = exchanges(payload);
    expect(calls.map((fn) => fn.name)).toEqual(["read_file", "write_file"]);
    expect(calls.map((fn) => fn.args)).toEqual([{ path: "first.txt" }, { path: "second.txt", text: "updated" }]);
    expect(new Set(calls.map((fn) => fn.id)).size).toBe(2);
    expect(calls[0].id).toBe("call_51859");
    expect(responses).toEqual([
      { id: calls[0].id, name: "read_file", response: { contents: "first result" } },
      { id: calls[1].id, name: "write_file", response: { written: "second result" } },
    ]);
    const responseTurns = payload.contents.filter((turn) => turn.parts.some((part) => part.functionResponse));
    for (const turn of responseTurns) {
      expect(turn.role).toBe("user");
    }
    expect(body).toEqual(before);
    expect(wire(target, body).contents).toEqual(payload.contents);
  });

  it("pairs parallel duplicate occurrences in order and avoids IDs reserved by later calls", () => {
    const body = { messages: [
      { role: "user", content: "Read both files" },
      assistant(call("call_shared", "read_first", { path: "a" }), call("call_shared", "read_second", { path: "b" })),
      response("call_shared", { file: "a" }),
      response("call_shared", { file: "b" }),
      { role: "user", content: "Inspect reserved IDs" },
      assistant(call("call_shared_d2", "stat_first", { path: "c" }), call("call_shared_d3", "stat_second", { path: "d" })),
      response("call_shared_d3", { file: "d" }),
      response("call_shared_d2", { file: "c" }),
      { role: "user", content: "Read again" },
      assistant(call("call_shared", "read_again", { path: "e" })),
      response("call_shared", { file: "e" }),
    ] };
    const before = structuredClone(body);
    const { calls, responses } = exchanges(wire(target, body));
    expect(new Set(calls.map((fn) => fn.id)).size).toBe(5);
    expect(calls.map((fn) => fn.name)).toEqual(["read_first", "read_second", "stat_first", "stat_second", "read_again"]);
    expect(calls.map((fn) => fn.args)).toEqual(["a", "b", "c", "d", "e"].map((path) => ({ path })));
    expect(calls[0].id).toBe("call_shared");
    expect(calls[2].id).toBe("call_shared_d2");
    expect(calls[3].id).toBe("call_shared_d3");
    expect(responses).toEqual(calls.map((fn, index) => ({
      id: fn.id, name: fn.name, response: { file: ["a", "b", "c", "d", "e"][index] },
    })));
    expect(calls.every((fn) => splitToolCallId(fn.id).rawId === fn.id)).toBe(true);
    expect(body).toEqual(before);
  });

  it("deduplicates raw IDs without losing their historical thought signatures", () => {
    const signature = Buffer.from("historical Gemini thought signature").toString("base64");
    const signedId = buildToolCallId("read_file", 0, signature);
    const rawId = splitToolCallId(signedId).rawId;
    const body = { messages: [
      { role: "user", content: "Read first" },
      assistant(call(signedId, "read_file", { path: "a" })),
      response(rawId, { file: "a" }),
      { role: "user", content: "Read second" },
      assistant(call(signedId, "read_file", { path: "b" })),
      response(signedId, { file: "b" }),
    ] };
    const before = structuredClone(body);
    const payload = wire(target, body);
    const parts = payload.contents.flatMap((turn) => turn.parts).filter((part) => part.functionCall);
    const { calls, responses } = exchanges(payload);
    expect(calls[0].id).toBe(rawId);
    expect(new Set(calls.map((fn) => fn.id)).size).toBe(2);
    expect(parts.map((part) => part.thoughtSignature)).toEqual([signature, signature]);
    expect(responses).toEqual(calls.map((fn, index) => ({ id: fn.id, name: fn.name, response: { file: ["a", "b"][index] } })));
    expect(calls.every((fn) => splitToolCallId(fn.id).rawId === fn.id)).toBe(true);
    expect(body).toEqual(before);
  });

  it("leaves unique answered chains and signatures unchanged", () => {
    const signature = Buffer.from("unique historical signature").toString("base64");
    const signedId = buildToolCallId("lookup", 1, signature);
    const rawId = splitToolCallId(signedId).rawId;
    const payload = wire(target, { messages: [
      { role: "user", content: "Look up both" },
      assistant(call("call_unique", "lookup", { key: "first" }), call(signedId, "lookup", { key: "second" })),
      response(signedId, { value: "second" }),
      response("call_unique", { value: "first" }),
    ] });
    expect(payload.contents.flatMap((turn) => turn.parts).filter((part) => part.functionCall)).toEqual([
      { functionCall: { id: "call_unique", name: "lookup", args: { key: "first" } } },
      { thoughtSignature: signature, functionCall: { id: rawId, name: "lookup", args: { key: "second" } } },
    ]);
    expect(exchanges(payload).responses).toEqual([
      { id: "call_unique", name: "lookup", response: { value: "first" } },
      { id: rawId, name: "lookup", response: { value: "second" } },
    ]);
  });
});

it("keeps Vertex's ID-free answered history convention", () => {
  const payload = wire(FORMATS.VERTEX, { messages: [
    { role: "user", content: "First" },
    assistant(call("same_id", "read_file", { path: "a" })),
    response("same_id", { file: "a" }),
    { role: "user", content: "Second" },
    assistant(call("same_id", "write_file", { path: "b" })),
    response("same_id", { file: "b" }),
  ] });
  const { calls, responses } = exchanges(payload);
  expect(calls).toEqual([
    { name: "read_file", args: { path: "a" } },
    { name: "write_file", args: { path: "b" } },
  ]);
  expect(responses).toEqual([
    { name: "read_file", response: { file: "a" } },
    { name: "write_file", response: { file: "b" } },
  ]);
});
