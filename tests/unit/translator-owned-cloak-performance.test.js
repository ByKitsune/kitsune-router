import { describe, expect, it } from "vitest";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { translateRequest, translateResponse, initState } from "../../open-sse/translator/index.js";
import { getThinkingContext, setThinkingContext } from "../../open-sse/translator/concerns/thinking.js";
import { CLAUDE_TOOL_SUFFIX } from "../../open-sse/config/appConstants.js";
import { MAX_TOOL_NAME_LENGTH } from "../../open-sse/utils/toolCompressor.js";

const model = "claude-sonnet-4-6";
const signature = Buffer.from([0x12, 0x04, 0x03, 0x02, 0x01]).toString("base64");
const provenance = Symbol("private-request-provenance");
const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function history(name = "lookup") {
  const body = {
    model,
    max_tokens: 4096,
    metadata: { user_id: "caller-owned-user" },
    opaque: { tags: ["retain"] },
    _toolNameMap: new Map([["previous_alias", "previous_original"]]),
    tools: [{ name, input_schema: { type: "object", properties: { query: { type: "string" } } } }],
    tool_choice: { type: "tool", name },
    messages: [
      { role: "user", content: [{ type: "text", text: "Inspect the record" }] },
      { role: "assistant", content: [
        { type: "thinking", thinking: "Original provider thinking", signature },
        { type: "redacted_thinking", data: "opaque-original-redaction/+=" },
        { type: "tool_use", id: "call_a", name, input: { query: "value" } },
      ] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_a", content: [
        { type: "text", text: "record result" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: image } },
      ] }] },
    ],
    [provenance]: { tags: ["private"] },
  };
  setThinkingContext(body, { explicitBudget: false, providerDefault: true, requestedModel: model });
  return body;
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) freeze(value[key]);
  return Object.freeze(value);
}

const blocks = body => body.messages.flatMap(message => Array.isArray(message.content) ? message.content : []);
const toolUse = body => blocks(body).find(block => block.type === "tool_use");
const toolResult = body => blocks(body).find(block => block.type === "tool_result");
const signedThinking = body => blocks(body).find(block => block.type === "thinking");
const translate = (body, ownership = "borrowed", connectionId = "cloak-copy-fixture") => translateRequest(
  FORMATS.CLAUDE, FORMATS.CLAUDE, body.model || model, body, true,
  { accessToken: "sk-ant-oat-synthetic-fixture", connectionId }, "claude",
  null, [], connectionId, null, null, { ownership },
);

describe("OAuth tool aliasing preserves the private request ownership boundary", () => {
  it("isolates borrowed schemas, tool inputs, result media, metadata, Symbols and Maps from later hooks", () => {
    const body = freeze(history());
    const before = JSON.stringify(body);
    const output = translate(body);
    expect(signedThinking(output)).toEqual(signedThinking(body));
    expect(blocks(output).find(block => block.type === "redacted_thinking").data).toBe("opaque-original-redaction/+=");
    expect(output._toolNameMap.get(`lookup${CLAUDE_TOOL_SUFFIX}`)).toBe("lookup");

    output.tools[0].input_schema.properties.query.type = "boolean";
    toolUse(output).input.query = "hook";
    toolResult(output).content[1].source.data = "hook";
    output.metadata.user_id = "hook";
    output.opaque.tags.push("hook");
    output[provenance].tags.push("hook");
    output._toolNameMap.set("previous_alias", "hook");
    getThinkingContext(output).providerDefault = false;

    expect(JSON.stringify(body)).toBe(before);
    expect(body[provenance]).toEqual({ tags: ["private"] });
    expect([...body._toolNameMap]).toEqual([["previous_alias", "previous_original"]]);
    expect(getThinkingContext(body).providerDefault).toBe(true);
    const next = translate(body, "borrowed", "other-account");
    expect(next.tools[0].input_schema.properties.query.type).toBe("string");
    expect(toolUse(next).input.query).toBe("value");
    expect(toolResult(next).content[1].source.data).toBe(image);
    expect(next.metadata.user_id).toBe("caller-owned-user");
    expect(next.opaque.tags).toEqual(["retain"]);
    expect(next[provenance].tags).toEqual(["private"]);
    expect(next._toolNameMap.get("previous_alias")).toBe("previous_original");
  });

  it("does not recopy already private nested payloads when aliasing an owned native request", () => {
    const body = history();
    const schema = body.tools[0].input_schema;
    const input = toolUse(body).input;
    const resultContent = toolResult(body).content;
    const metadata = body.metadata;
    const opaque = body.opaque;
    const symbolPayload = body[provenance];
    const output = translate(body, "owned");

    // These payloads are already attempt-owned. Replacing them would repeat a
    // whole-history copy after the required borrowed-input boundary has passed.
    expect(output.tools[0].input_schema).toBe(schema);
    expect(toolUse(output).input).toBe(input);
    expect(toolResult(output).content).toBe(resultContent);
    expect(output.metadata).toBe(metadata);
    expect(output.opaque).toBe(opaque);
    expect(output[provenance]).toBe(symbolPayload);
    expect(signedThinking(output).signature).toBe(signature);
    expect(toolUse(output).name).toBe(`lookup${CLAUDE_TOOL_SUFFIX}`);
    expect(output.tool_choice.name).toBe(toolUse(output).name);
  });

  it("retains the owned body when no tools require an alias pass", () => {
    const body = { model, max_tokens: 4096, opaque: { tags: ["retain"] }, messages: [{ role: "user", content: "Hello" }] };
    const opaque = body.opaque;
    expect(translate(body, "owned")).toBe(body);
    expect(body.opaque).toBe(opaque);
  });

  it("keeps simultaneous attempts from one borrowed history independent across accounts", async () => {
    const body = freeze(history());
    const [first, second] = await Promise.all(["account-one", "account-two"].map(connectionId =>
      Promise.resolve().then(() => translate(body, "borrowed", connectionId))));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first._toolNameMap).not.toBe(second._toolNameMap);
    first._toolNameMap.set(toolUse(first).name, "other-tool");
    first.tools[0].input_schema.properties.query.type = "number";
    toolResult(first).content[1].source.data = "other-account-image";
    first[provenance].tags.push("account-one");
    expect(second._toolNameMap.get(toolUse(second).name)).toBe("lookup");
    expect(second.tools[0].input_schema.properties.query.type).toBe("string");
    expect(toolResult(second).content[1].source.data).toBe(image);
    expect(second[provenance].tags).toEqual(["private"]);
    expect(signedThinking(second).signature).toBe(signature);
  });

  it("retains private generated-budget provenance and original opaque signed blocks through aliasing", () => {
    const body = history();
    body.model = "claude-haiku-4-5";
    body.thinking = { type: "enabled", budget_tokens: 8192 };
    setThinkingContext(body, { requestedModel: body.model });
    freeze(body);
    const output = translate(body);
    expect(output.max_tokens).toBe(4096);
    expect(output.thinking.budget_tokens).toBeLessThan(4096);
    expect(getThinkingContext(output)).toMatchObject({ explicitBudget: false, providerDefault: true, requestedModel: body.model });
    expect(signedThinking(output)).toEqual(signedThinking(body));
    expect(body.thinking.budget_tokens).toBe(8192);
    expect(JSON.stringify(output)).not.toContain("providerDefault");
  });

  it("composes long-name compression and OAuth aliases without losing signed history or response names", () => {
    const originalName = `lookup_${"record_".repeat(16)}`;
    const body = freeze(history(originalName));
    const before = JSON.stringify(body);
    const output = translate(body);
    const wireName = output.tools[0].name;
    expect(wireName.length).toBeLessThanOrEqual(MAX_TOOL_NAME_LENGTH);
    expect(wireName).not.toBe(originalName);
    expect(toolUse(output).name).toBe(wireName);
    expect(output.tool_choice.name).toBe(wireName);
    expect(output._toolNameMap.get(wireName)).toBe(originalName);
    expect(signedThinking(output)).toEqual(signedThinking(body));
    const chunk = { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "new_call", name: wireName, input: {} } };
    const state = { ...initState(FORMATS.CLAUDE), toolNameMap: output._toolNameMap };
    expect(translateResponse(FORMATS.CLAUDE, FORMATS.CLAUDE, chunk, state)[0].content_block.name).toBe(originalName);
    expect(chunk.content_block.name).toBe(wireName);
    expect(JSON.stringify(body)).toBe(before);
  });
});
