import { describe, expect, it } from "vitest";
import { FORMATS as F } from "../../open-sse/translator/formats.js";
import { translateRequest, translateResponse, initState } from "../../open-sse/translator/index.js";
import { buildToolCallId } from "../../open-sse/translator/concerns/thoughtSignature.js";

const image = { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" }, extra_content: { google: { thought_signature: "b3BhcXVl" }, vendor: { retained: true } } };

describe("explicit unsupported media contracts", () => {
  it.each([F.CLAUDE, F.OPENAI_RESPONSES])("rejects streaming Chat images for %s without base64 prose or fabricated success", client => {
    const state = { ...initState(client), targetFormat: F.OPENAI, sourceFormat: client };
    const chunk = { choices: [{ delta: { images: [image] }, finish_reason: null }] };
    const events = translateResponse(F.OPENAI, client, chunk, state);
    const error = client === F.CLAUDE ? events[0].error : events[0].data.response.error;
    expect(error.code).toBe("unsupported_response_media");
    expect(JSON.stringify(events)).not.toContain("iVBORw0KGgo=");
    expect(translateResponse(F.OPENAI, client, null, state)).toEqual([]);
    expect(chunk.choices[0].delta.images[0]).toBe(image);
  });

  it.each(["audio/wav", "application/pdf", "video/mp4"])("does not mislabel Gemini %s output as an image", mimeType => {
    const state = initState(F.OPENAI);
    const chunk = { candidates: [{ content: { parts: [{ inlineData: { mimeType, data: "opaque-not-prose" } }] }, finishReason: "STOP" }] };
    const events = translateResponse(F.GEMINI, F.OPENAI, chunk, state);
    expect(events).toEqual([{ error: expect.objectContaining({ code: "unsupported_response_media" }) }]);
    expect(translateResponse(F.GEMINI, F.OPENAI, null, state)).toEqual([]);
    expect(translateResponse(F.GEMINI, F.GEMINI, chunk, initState(F.GEMINI))[0]).toBe(chunk);
  });

  it("preserves signed image and signed text extension containers through final Chat preparation", () => {
    const text = { type: "text", text: "caption", extra_content: { google: { thought_signature: "dGV4dA==" } } };
    const body = { messages: [{ role: "user", content: [text, image] }] };
    const out = translateRequest(F.OPENAI, F.OPENAI, "gpt-4o", body);
    expect(out.messages[0].content).toEqual([text, image]);
    expect(out.messages[0].content[1]).not.toBe(image);
    out.messages[0].content[1].extra_content.vendor.retained = false;
    expect(image.extra_content.vendor.retained).toBe(true);
  });

  it("keeps ordinary Gemini application result records even when nested examples look like unsupported media", () => {
    const result = { inlineData: { mimeType: "audio/wav", data: "literal-json" }, description: "ordinary record" };
    const body = { contents: [{ role: "model", parts: [{ functionCall: { id: "a", name: "lookup", args: {} } }] },
      { role: "user", parts: [{ functionResponse: { id: "a", name: "lookup", response: { result: [result] } } }] }] };
    const out = translateRequest(F.GEMINI, F.OPENAI, "gpt-4o", body);
    expect(JSON.parse(out.messages.find(message => message.role === "tool").content)).toEqual({ result: [result] });
  });

  it.each([F.OPENAI, F.OPENAI_RESPONSES, F.CLAUDE])("rejects audio tool attachments for %s before a text fallback", target => {
    const body = { messages: [{ role: "tool", tool_call_id: "a", content: [{ type: "input_audio", input_audio: { format: "wav", data: "opaque-audio" } }] }] };
    expect(() => translateRequest(F.OPENAI, target, "gpt-4o", body)).toThrow(expect.objectContaining({ code: "unsupported_parameter" }));
    expect(body.messages[0].content[0].input_audio.data).toBe("opaque-audio");
  });

  it("retains incurred Gemini usage on a media admission error", () => {
    const chunk = { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: "not-prose" } }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3, thoughtsTokenCount: 6, totalTokenCount: 21 } };
    const events = translateResponse(F.GEMINI, F.OPENAI, chunk, initState(F.OPENAI));
    expect(events[0]).toMatchObject({ error: { code: "unsupported_response_media" }, usage: { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 } });
    expect(JSON.stringify(events)).not.toContain("not-prose");
  });

  it("rejects an overlong signed ID rather than hashing away its opaque continuity", () => {
    const id = buildToolCallId("lookup", 0, Buffer.from("opaque signature requiring preservation").toString("base64"), "call_native");
    const body = { messages: [{ role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name: "lookup", arguments: "{}" } }] },
      { role: "tool", tool_call_id: id, content: "ok" }] };
    expect(() => translateRequest(F.OPENAI, F.OPENAI_RESPONSES, "gpt-4o", body)).toThrow(expect.objectContaining({ code: "unsupported_parameter", param: "tool_calls.id" }));
    expect(body.messages[0].tool_calls[0].id).toBe(id);
  });
});
