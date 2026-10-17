// OpenAI → Gemini / Cursor / CommandCode request translation.
import { describe, it, expect } from "vitest";
import "./registerAll.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const O2G = (body) => translateRequest(FORMATS.OPENAI, FORMATS.GEMINI, "m", body, true, null, "gemini");
const O2CC = (body) => translateRequest(FORMATS.OPENAI, FORMATS.COMMANDCODE, "m", body, true, null, "commandcode");

describe("OpenAI → Gemini", () => {
  it("multiple system messages are all kept", () => {
    const out = O2G({
      messages: [
        { role: "system", content: "RULE_ONE" },
        { role: "system", content: "RULE_TWO" },
        { role: "user", content: "hi" },
      ],
    });
    const serialized = JSON.stringify(out.systemInstruction);
    expect(serialized, "earlier system lost").toContain("RULE_ONE");
    expect(serialized, "later system lost").toContain("RULE_TWO");
    expect(out.systemInstruction.parts).toHaveLength(2);
  });
});


describe("OpenAI → CommandCode", () => {
  // FIXED (partly, by design): safeParseJson still falls back to {} on malformed
  // JSON — that part is deliberate, because throwing would fail the whole request
  // and partial JSON is routine from weaker models. What changed is that the loss
  // is no longer SILENT: it is logged. The translator deliberately does not
  // fabricate parameters the model never produced, so this asserts the honest
  // contract (fail-open, call preserved, args empty) rather than inventing data.
  it("keeps a malformed tool call rather than dropping it, without fabricating arguments", () => {
    const out = O2CC({
      messages: [
        { role: "user", content: "go" },
        { role: "assistant", content: "", tool_calls: [
          { id: "c1", type: "function", function: { name: "f", arguments: "{bad" } },
        ] },
        { role: "tool", tool_call_id: "c1", content: "r" },
      ],
    });
    const asst = out.params.messages.find((m) => m.role === "assistant");
    const call = asst.content.find((b) => b.type === "tool-call");
    // The call survives (a dropped call would desynchronise the tool pairing).
    expect(call, "tool call must not be dropped").toBeTruthy();
    expect(call.toolName).toBe("f");
    // Arguments are empty rather than invented.
    expect(call.input).toEqual({});
  });


  // FIXED: data-URI images are forwarded as Anthropic-style base64 blocks.
  it("preserves inline image content as a base64 image block", () => {
    const out = O2CC({
      messages: [{ role: "user", content: [
        { type: "text", text: "look" },
        { type: "image_url", image_url: { url: "data:image/png;base64,BBBB" } },
      ] }],
    });
    const blocks = out.params.messages[0].content;
    expect(blocks).toContainEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "BBBB" },
    });
    expect(JSON.stringify(out), "image not omitted").not.toContain("[image omitted]");
  });

  // FIXED: AI SDK-style `{type:"image", image:"data:..."}` parts are preserved
  // (issue #1330 shape), not just `{type:"image_url"}`.
  it("preserves AI SDK-style image parts", () => {
    const out = O2CC({
      messages: [{ role: "user", content: [
        { type: "image", image: "data:image/jpeg;base64,CCCC" },
      ] }],
    });
    expect(out.params.messages[0].content).toContainEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "CCCC" },
    });
  });

  // FIXED: remote http(s) image URLs are forwarded as URL image blocks.
  it("preserves remote image URLs", () => {
    const out = O2CC({
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: "https://example.com/a.png" } },
      ] }],
    });
    expect(out.params.messages[0].content).toContainEqual({
      type: "image",
      source: { type: "url", url: "https://example.com/a.png" },
    });
  });

  // Unfetchable/opaque image URLs still degrade to a placeholder rather than
  // producing an invalid block.
  it("falls back to a placeholder for non-fetchable image URLs", () => {
    const out = O2CC({
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: "ftp://example.com/a.png" } },
      ] }],
    });
    expect(out.params.messages[0].content).toContainEqual({ type: "text", text: "[image omitted]" });
  });
});
