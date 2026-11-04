import { describe, expect, it, vi } from "vitest";
import { geminiToolHistory } from "../../open-sse/translator/concerns/geminiToolHistory.js";
import { splitToolCallId } from "../../open-sse/translator/concerns/thoughtSignature.js";
import { geminiToOpenAIRequest } from "../../open-sse/translator/request/gemini-to-openai.js";

const signature = label => Buffer.from(`synthetic opaque ${label} signature `.repeat(5)).toString("base64");
const call = (name, id, sig) => ({ functionCall: { name, ...(id === undefined ? {} : { id }), args: {} }, ...(sig ? { thoughtSignature: sig } : {}) });
const response = (name, id) => ({ functionResponse: { name, ...(id === undefined ? {} : { id }), response: { result: name } } });

describe("request-local Google history indexing", () => {
  it("matches a reversed parallel result run with linear ID reads", () => {
    const count = 2048;
    let reads = 0;
    const calls = Array.from({ length: count }, (_, index) => call("lookup", `id_${index}`));
    const responses = calls.toReversed().map(part => ({ functionResponse: {
      name: "lookup", get id() { reads++; return part.functionCall.id; }, response: { found: true },
    } }));
    const ids = geminiToolHistory([{ role: "model", parts: calls }, { role: "user", parts: responses }]);
    expect(responses.map(part => ids.get(part))).toEqual(calls.toReversed().map(part => part.functionCall.id));
    expect(reads).toBeLessThanOrEqual(count * 3);
  });

  it("allocates repeated ID-free names with linear collision probes", () => {
    const NativeSet = Set;
    let probes = 0;
    class CountingSet extends NativeSet {
      has(value) {
        if (typeof value === "string" && value.startsWith("call_lookup")) probes++;
        return super.has(value);
      }
    }
    const calls = Array.from({ length: 2048 }, () => call("lookup"));
    let ids;
    vi.stubGlobal("Set", CountingSet);
    try { ids = geminiToolHistory([{ role: "model", parts: calls }]); }
    finally { vi.unstubAllGlobals(); }
    expect(calls.map(part => ids.get(part))).toEqual(calls.map((_, index) => index === 0 ? "call_lookup" : `call_lookup_d${index + 1}`));
    expect(probes).toBeLessThanOrEqual(calls.length * 6);
  });

  it("reserves future explicit IDs while preserving the first available generated suffix", () => {
    const calls = [call("lookup"), call("lookup", "call_lookup_d2"), call("lookup"), call("lookup", "call_lookup"), call("lookup", "call_lookup_d4"), call("lookup")];
    const ids = geminiToolHistory([{ role: "model", parts: calls }]);
    expect(calls.map(part => ids.get(part))).toEqual(["call_lookup_d3", "call_lookup_d2", "call_lookup_d5", "call_lookup", "call_lookup_d4", "call_lookup_d6"]);
  });

  it("consumes each signed occurrence once across interleaved ID and name lookups", () => {
    const calls = [call("a", "same", signature("first")), call("b", "same", signature("second")), call("b", undefined, signature("third"))];
    const replies = [response("b"), response("ignored-name", "same"), response("b"), response("a", "missing"), response("b")];
    const ids = geminiToolHistory([{ role: "model", parts: calls }, { role: "user", parts: replies }]);
    expect(replies.map(part => ids.get(part))).toEqual([ids.get(calls[1]), ids.get(calls[0]), ids.get(calls[2]), "missing", "call_b"]);
    expect(calls.map(part => splitToolCallId(ids.get(part)).thoughtSignature)).toEqual([signature("first"), signature("second"), signature("third")]);
  });

  it("retains strict key equality and unmatched-result fallbacks", () => {
    const calls = [call(NaN, "nan"), call(undefined, "undefined"), call("0", 0), call("n", 7)];
    const replies = [response(NaN), response(undefined), response("0", 0), response("n", "7"), response("n", 7)];
    const ids = geminiToolHistory([{ role: "model", parts: calls }, { role: "user", parts: replies }]);
    expect(replies.map(part => ids.get(part))).toEqual(["call_NaN", "undefined", "call_0", "7", 7]);
  });

  it("preserves the serialized Google-to-Chat history and never mutates its source", () => {
    const sig = signature("native");
    const body = { contents: [
      { role: "model", parts: [call("a", "a", sig), call("b", "b")] },
      { role: "user", parts: [response("b", "b"), response("a", "a"), { text: "Continue" }] },
    ] };
    const before = structuredClone(body);
    const wire = geminiToOpenAIRequest("gpt-6-luna", body, true);
    const ids = wire.messages.find(message => message.tool_calls).tool_calls.map(part => part.id);
    expect(wire.messages.filter(message => message.role === "tool").map(message => message.tool_call_id)).toEqual(ids.toReversed());
    expect(splitToolCallId(ids[0]).thoughtSignature).toBe(sig);
    expect(wire.messages.at(-1).content).toBe("Continue");
    expect(body).toEqual(before);
  });
});
