// 9router #4637: the Responses→Chat translator deleted every Responses-only
// field except `text` (verbosity + structured-output format), so a strict chat
// backend rejected the whole body — OpenCode Go's glm-5.3-flash answers
// HTTP 400 `unknown field "text"`. The field must never reach a chat endpoint;
// its structured-output intent is carried as response_format instead.
import { describe, it, expect } from "vitest";
import "./registerAll.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const toChat = (body) =>
  translateRequest(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, "m", body, false, null, null);

const schema = { type: "object", properties: { guests: { type: "integer" } }, required: ["guests"] };

describe("Responses→Chat drops the Responses-only text field (#4637)", () => {
  it("removes text even when it only carries verbosity", () => {
    const out = toChat({
      input: [{ role: "user", content: "hi" }],
      text: { verbosity: "low" },
    });
    expect(out).not.toHaveProperty("text");
    expect(out.response_format).toBeUndefined();
  });

  it("removes text and preserves json_schema intent as response_format", () => {
    const out = toChat({
      input: [{ role: "user", content: "2 people" }],
      text: { format: { type: "json_schema", name: "reading", strict: true, schema } },
    });
    expect(out).not.toHaveProperty("text");
    expect(out.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "reading", strict: true, schema },
    });
  });

  it("maps json_object text.format onto response_format", () => {
    const out = toChat({
      input: [{ role: "user", content: "hi" }],
      text: { format: { type: "json_object" } },
    });
    expect(out).not.toHaveProperty("text");
    expect(out.response_format).toEqual({ type: "json_object" });
  });

  it("keeps an explicit response_format when both are present", () => {
    const out = toChat({
      input: [{ role: "user", content: "hi" }],
      text: { format: { type: "json_object" } },
      response_format: { type: "text" },
    });
    expect(out).not.toHaveProperty("text");
    expect(out.response_format).toEqual({ type: "text" });
  });

  it("round-trips the Chat→Responses structured-output mapping (#4547)", () => {
    // Chat body → Responses → Chat: the schema must survive both hops.
    const chatBody = {
      messages: [{ role: "user", content: "2 people" }],
      response_format: { type: "json_schema", json_schema: { name: "reading", strict: true, schema } },
    };
    const responsesBody = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, "m", chatBody, false, null, null);
    expect(responsesBody.text.format.type).toBe("json_schema");
    const back = toChat(responsesBody);
    expect(back).not.toHaveProperty("text");
    expect(back.response_format.json_schema.schema).toEqual(schema);
  });
});
