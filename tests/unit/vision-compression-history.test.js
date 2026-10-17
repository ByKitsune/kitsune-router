import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { compressMessages } from "../../open-sse/rtk/index.js";
import { compressWithHeadroom } from "../../open-sse/rtk/headroom.js";
import { compressWithPxpipe } from "../../open-sse/rtk/pxpipe.js";
import { dedupLog } from "../../open-sse/rtk/filters/dedupLog.js";
import { claudeToOpenAIRequest } from "../../open-sse/translator/request/claude-to-openai.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const IMAGE_URL = `data:image/png;base64,${PNG}`;
const LOG_LINE = "capture completed for camera alpha with a stable, readable frame";
const LONG_LOG = Array(12).fill(LOG_LINE).join("\n");
const SHORT_LOG = `${LOG_LINE}\n  ... (11 duplicate lines)`;
const ERROR_LOG = Array(12).fill("capture failed: preserve the complete error trace and all diagnostic frames").join("\n");
const servers = [];

function serialized(body) {
  return JSON.parse(JSON.stringify(body));
}

function imageCount(body) {
  return JSON.stringify(body).split(PNG).length - 1;
}

// Exercise the real HTTP adapter against a text-only compressor. The service
// actually compresses text, but does not promise to return multimodal blocks.
async function startCompressor(mode = "compress") {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    requests.push(payload);
    if (mode === "http_error") {
      response.writeHead(503, { "Content-Type": "application/json", Connection: "close" });
      response.end(JSON.stringify({ error: "synthetic compressor failure" }));
      return;
    }

    let messages = payload.messages.map((message) => {
      const text = typeof message.content === "string"
        ? message.content
        : (message.content || []).filter((part) => part?.type === "text").map((part) => part.text).join("\n");
      return { ...message, content: dedupLog(text) };
    });
    if (mode === "drop_last") messages = messages.slice(0, -1);
    if (mode === "reverse_tools") {
      const tools = messages.filter((message) => message.role === "tool").reverse();
      let toolIndex = 0;
      messages = messages.map((message) => message.role === "tool" ? tools[toolIndex++] : message);
    }
    response.writeHead(200, { "Content-Type": "application/json", Connection: "close" });
    response.end(JSON.stringify({ messages, tokens_before: 500, tokens_after: 100, tokens_saved: 400 }));
  });
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

async function headroom(body, format, compressor) {
  return compressWithHeadroom(body, {
    enabled: true,
    url: compressor.url,
    model: "offline-vision-fixture",
    format,
    compressUserMessages: true,
    timeoutMs: 2000,
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
});

function translatedErrorBody() {
  return claudeToOpenAIRequest("offline-vision-fixture", {
    messages: [
      { role: "user", content: [{ type: "text", text: "Inspect the failed capture." }, { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } }] },
      { role: "assistant", content: [{ type: "tool_use", id: "capture_error", name: "capture", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "capture_error", is_error: true, content: ERROR_LOG }] },
    ],
  }, false);
}

describe("translated error traces remain intact during compression", () => {
  it("does not RTK-compress an explicit Claude error translated to OpenAI tool text", () => {
    const body = translatedErrorBody();

    compressMessages(body, true);

    expect(serialized(body).messages.find((message) => message.role === "tool").content).toBe(`[tool_error] ${ERROR_LOG}`);
    expect(imageCount(body)).toBe(1);
  });

  it("does not send translated error traces to the Headroom text compressor", async () => {
    const compressor = await startCompressor();
    const body = translatedErrorBody();

    expect(await headroom(body, "openai", compressor)).not.toBeNull();

    expect(serialized(body).messages.find((message) => message.role === "tool").content).toBe(`[tool_error] ${ERROR_LOG}`);
    expect(imageCount(body)).toBe(1);
    expect(JSON.stringify(compressor.requests)).not.toContain(ERROR_LOG);
  });
});

describe.each([
  { format: "openai", label: "is_error string", makeBody: () => ({ messages: [
    { role: "user", content: [{ type: "text", text: "Inspect the failed capture." }, { type: "image_url", image_url: { url: IMAGE_URL } }] },
    { role: "assistant", content: null, tool_calls: [{ id: "capture_error", type: "function", function: { name: "capture", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "capture_error", is_error: true, content: ERROR_LOG },
  ] }) },
  { format: "openai", label: "status error array", makeBody: () => ({ messages: [
    { role: "user", content: "Inspect the failed capture." },
    { role: "assistant", content: null, tool_calls: [{ id: "capture_error", type: "function", function: { name: "capture", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "capture_error", status: "error", content: [{ type: "text", text: ERROR_LOG }, { type: "image_url", image_url: { url: IMAGE_URL } }] },
  ] }) },
  { format: "openai-responses", label: "status error function output", makeBody: () => ({ input: [
    { type: "message", role: "user", content: [{ type: "input_text", text: "Inspect the failed capture." }, { type: "input_image", image_url: IMAGE_URL }] },
    { type: "function_call", call_id: "capture_error", name: "capture", arguments: "{}" },
    { type: "function_call_output", call_id: "capture_error", status: "error", output: ERROR_LOG },
  ] }) },
  { format: "openai-responses", label: "is_error custom output array", makeBody: () => ({ input: [
    { type: "message", role: "user", content: [{ type: "input_text", text: "Inspect the failed capture." }] },
    { type: "custom_tool_call", call_id: "capture_error", name: "capture", input: "camera-alpha" },
    { type: "custom_tool_call_output", call_id: "capture_error", is_error: true, output: [{ type: "input_text", text: ERROR_LOG }, { type: "input_image", image_url: IMAGE_URL }] },
  ] }) },
])("$format $label preservation", ({ format, makeBody }) => {
  it("keeps the complete error output and typed media unchanged through RTK", () => {
    const body = makeBody();
    const before = JSON.stringify(body);

    compressMessages(body, true);

    expect(JSON.stringify(body)).toBe(before);
  });

  it("keeps error text out of Headroom and preserves the original tool history", async () => {
    const compressor = await startCompressor();
    const body = makeBody();
    const before = JSON.stringify(body);

    expect(await headroom(body, format, compressor)).not.toBeNull();

    expect(JSON.stringify(body)).toBe(before);
    expect(JSON.stringify(compressor.requests)).not.toContain(ERROR_LOG);
    expect(JSON.stringify(compressor.requests)).not.toContain(PNG);
  });
});

describe("RTK preserves typed media while compressing tool history", () => {
  it("compresses OpenAI tool text without flattening images or repeating earlier images", () => {
    const body = {
      messages: [
        { role: "user", content: [{ type: "text", text: "Inspect this capture." }, { type: "image_url", image_url: { url: IMAGE_URL, detail: "high" } }] },
        { role: "assistant", content: null, tool_calls: [{ id: "capture_1", type: "function", function: { name: "capture", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "capture_1", content: [{ type: "text", text: LONG_LOG }, { type: "image_url", image_url: { url: IMAGE_URL, detail: "low" } }] },
      ],
    };

    compressMessages(body, true);
    compressMessages(body, true);

    const wire = serialized(body);
    expect(wire.messages).toHaveLength(3);
    expect(wire.messages[0].content[0].text).toBe("Inspect this capture.");
    expect(wire.messages[0].content[1]).toEqual({ type: "image_url", image_url: { url: IMAGE_URL, detail: "high" } });
    expect(wire.messages[2]).toEqual({ role: "tool", tool_call_id: "capture_1", content: [{ type: "text", text: SHORT_LOG }, { type: "image_url", image_url: { url: IMAGE_URL, detail: "low" } }] });
    expect(imageCount(wire)).toBe(2);
  });

  it("compresses Claude tool-result text but leaves image sources and error results byte-exact", () => {
    const body = {
      messages: [{ role: "user", content: [
        { type: "tool_result", tool_use_id: "capture_1", content: [{ type: "text", text: LONG_LOG }, { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } }] },
        { type: "tool_result", tool_use_id: "capture_2", is_error: true, content: [{ type: "text", text: ERROR_LOG }, { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } }] },
        { type: "text", text: "Keep the successful and failed captures separate." },
      ] }],
    };

    compressMessages(body, true);
    compressMessages(body, true);

    const wire = serialized(body);
    expect(wire.messages[0].content[0]).toEqual({ type: "tool_result", tool_use_id: "capture_1", content: [{ type: "text", text: SHORT_LOG }, { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } }] });
    expect(wire.messages[0].content[1]).toEqual({ type: "tool_result", tool_use_id: "capture_2", is_error: true, content: [{ type: "text", text: ERROR_LOG }, { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } }] });
    expect(wire.messages[0].content[2].text).toBe("Keep the successful and failed captures separate.");
    expect(imageCount(wire)).toBe(2);
  });

  it.each(["function_call_output", "custom_tool_call_output"])("preserves Responses %s image/file parts and call identity", (type) => {
    const body = {
      input: [
        { type: "reasoning", id: "rs_prior", encrypted_content: "opaque-prior-state", summary: [] },
        { type, call_id: "capture_1", output: [{ type: "input_text", text: LONG_LOG }, { type: "input_image", image_url: IMAGE_URL, detail: "high" }, { type: "input_file", file_id: "file-capture-notes" }] },
      ],
    };

    compressMessages(body, true);
    compressMessages(body, true);

    const wire = serialized(body);
    expect(wire.input[0]).toEqual({ type: "reasoning", id: "rs_prior", encrypted_content: "opaque-prior-state", summary: [] });
    expect(wire.input[1]).toEqual({ type, call_id: "capture_1", output: [{ type: "input_text", text: SHORT_LOG }, { type: "input_image", image_url: IMAGE_URL, detail: "high" }, { type: "input_file", file_id: "file-capture-notes" }] });
    expect(imageCount(wire)).toBe(1);
  });

  it("preserves Kiro history/current images and skips failed tool traces", () => {
    const body = {
      conversationState: {
        history: [{ userInputMessage: { content: "Inspect the earlier capture.", images: [{ format: "png", source: { bytes: PNG } }] } }],
        currentMessage: { userInputMessage: {
          content: "Compare with the current capture.",
          images: [{ format: "png", source: { bytes: PNG } }],
          userInputMessageContext: { toolResults: [
            { toolUseId: "capture_1", status: "success", content: [{ text: LONG_LOG }] },
            { toolUseId: "capture_2", status: "error", content: [{ text: ERROR_LOG }] },
          ] },
        } },
      },
    };

    compressMessages(body, true);
    compressMessages(body, true);

    const wire = serialized(body);
    expect(wire.conversationState.history[0].userInputMessage).toEqual({ content: "Inspect the earlier capture.", images: [{ format: "png", source: { bytes: PNG } }] });
    expect(wire.conversationState.currentMessage.userInputMessage.images).toEqual([{ format: "png", source: { bytes: PNG } }]);
    expect(wire.conversationState.currentMessage.userInputMessage.userInputMessageContext.toolResults).toEqual([
      { toolUseId: "capture_1", status: "success", content: [{ text: SHORT_LOG }] },
      { toolUseId: "capture_2", status: "error", content: [{ text: ERROR_LOG }] },
    ]);
    expect(imageCount(wire)).toBe(2);
  });
});

describe("Headroom compresses text without rebuilding multimodal history", () => {
  it("retains Claude image ownership, error blocks, signatures and system text across repeated compression", async () => {
    const compressor = await startCompressor();
    const body = {
      system: [{ type: "text", text: "Preserve the original images.", cache_control: { type: "ephemeral" } }],
      messages: [
        { role: "user", content: [{ type: "text", text: "Inspect this capture." }, { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } }] },
        { role: "assistant", content: [
          { type: "thinking", thinking: "Need another capture.", signature: "opaque-thinking-signature" },
          { type: "tool_use", id: "capture_1", name: "capture", input: { camera: "alpha" } },
          { type: "tool_use", id: "capture_2", name: "capture", input: { camera: "beta" } },
        ] },
        { role: "user", content: [
          { type: "tool_result", tool_use_id: "capture_1", content: [{ type: "text", text: LONG_LOG }, { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } }], cache_control: { type: "ephemeral" } },
          { type: "tool_result", tool_use_id: "capture_2", is_error: true, content: ERROR_LOG },
          { type: "text", text: "Compare only the successful capture." },
        ] },
      ],
    };
    const originalSystem = serialized(body.system);
    const originalAssistant = serialized(body.messages[1]);

    expect(await headroom(body, "claude", compressor)).not.toBeNull();
    expect(await headroom(body, "claude", compressor)).not.toBeNull();

    const wire = serialized(body);
    expect(wire.system).toEqual(originalSystem);
    expect(wire.messages).toHaveLength(3);
    expect(wire.messages[0].content).toEqual([{ type: "text", text: "Inspect this capture." }, { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } }]);
    expect(wire.messages[1]).toEqual(originalAssistant);
    expect(wire.messages[2].content).toEqual([
      { type: "tool_result", tool_use_id: "capture_1", content: [{ type: "text", text: SHORT_LOG }, { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } }], cache_control: { type: "ephemeral" } },
      { type: "tool_result", tool_use_id: "capture_2", is_error: true, content: ERROR_LOG },
      { type: "text", text: "Compare only the successful capture." },
    ]);
    expect(imageCount(wire)).toBe(2);
    expect(JSON.stringify(compressor.requests)).not.toContain(PNG);
    expect(JSON.stringify(compressor.requests)).not.toContain(ERROR_LOG);
  });

  it("retains OpenAI typed images and tool-call metadata when the text compressor returns strings", async () => {
    const compressor = await startCompressor();
    const body = {
      messages: [
        { role: "user", name: "operator", content: [{ type: "text", text: "Inspect this capture." }, { type: "image_url", image_url: { url: IMAGE_URL, detail: "high" } }] },
        { role: "assistant", content: null, tool_calls: [{ id: "capture_1", type: "function", function: { name: "capture", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "capture_1", content: [{ type: "text", text: LONG_LOG }, { type: "image_url", image_url: { url: IMAGE_URL, detail: "low" } }] },
      ],
    };
    const originalAssistant = serialized(body.messages[1]);

    expect(await headroom(body, "openai", compressor)).not.toBeNull();

    const wire = serialized(body);
    expect(wire.messages).toHaveLength(3);
    expect(wire.messages[0]).toEqual({ role: "user", name: "operator", content: [{ type: "text", text: "Inspect this capture." }, { type: "image_url", image_url: { url: IMAGE_URL, detail: "high" } }] });
    expect(wire.messages[1]).toEqual(originalAssistant);
    expect(wire.messages[2]).toEqual({ role: "tool", tool_call_id: "capture_1", content: [{ type: "text", text: SHORT_LOG }, { type: "image_url", image_url: { url: IMAGE_URL, detail: "low" } }] });
    expect(imageCount(wire)).toBe(2);
    expect(JSON.stringify(compressor.requests)).not.toContain(PNG);
  });

  it("leaves the complete OpenAI history unchanged when compression drops a message", async () => {
    const compressor = await startCompressor("drop_last");
    const body = { messages: [
      { role: "user", content: [{ type: "text", text: "Inspect this capture." }, { type: "image_url", image_url: { url: IMAGE_URL } }] },
      { role: "tool", tool_call_id: "capture_1", content: LONG_LOG },
    ] };
    const before = JSON.stringify(body);

    expect(await headroom(body, "openai", compressor)).toBeNull();
    expect(JSON.stringify(body)).toBe(before);
  });

  it("leaves accepted single-block Claude content unchanged on a real compressor HTTP failure", async () => {
    const compressor = await startCompressor("http_error");
    const body = { messages: [
      { role: "user", content: { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } } },
      { role: "user", content: LONG_LOG },
    ] };
    const before = JSON.stringify(body);

    expect(await headroom(body, "claude", compressor)).toBeNull();
    expect(JSON.stringify(body)).toBe(before);
    expect(compressor.requests).toHaveLength(1);
  });

  it("compresses successful Kiro results without rewriting failed results or image history", async () => {
    const compressor = await startCompressor();
    const body = { conversationState: {
      history: [{ userInputMessage: { content: "Earlier capture.", images: [{ format: "png", source: { bytes: PNG } }] } }],
      currentMessage: { userInputMessage: {
        content: "Current capture.",
        images: [{ format: "png", source: { bytes: PNG } }],
        userInputMessageContext: { toolResults: [
          { toolUseId: "capture_1", status: "success", content: [{ text: LONG_LOG }] },
          { toolUseId: "capture_2", status: "error", content: [{ text: ERROR_LOG }] },
        ] },
      } },
    } };

    expect(await headroom(body, "kiro", compressor)).not.toBeNull();

    const wire = serialized(body);
    expect(wire.conversationState.currentMessage.userInputMessage.userInputMessageContext.toolResults).toEqual([
      { toolUseId: "capture_1", status: "success", content: [{ text: SHORT_LOG }] },
      { toolUseId: "capture_2", status: "error", content: [{ text: ERROR_LOG }] },
    ]);
    expect(wire.conversationState.history[0].userInputMessage.images).toEqual([{ format: "png", source: { bytes: PNG } }]);
    expect(wire.conversationState.currentMessage.userInputMessage.images).toEqual([{ format: "png", source: { bytes: PNG } }]);
    expect(imageCount(wire)).toBe(2);
    expect(JSON.stringify(compressor.requests)).not.toContain(PNG);
    expect(JSON.stringify(compressor.requests)).not.toContain(ERROR_LOG);
  });

  it.each(["gemini", "antigravity"])("retains %s native functionResponse image parts while compressing response text", async (format) => {
    const compressor = await startCompressor();
    const request = { contents: [
      { role: "user", parts: [{ text: "Inspect this capture." }, { inlineData: { mimeType: "image/png", data: PNG } }, { fileData: { mimeType: "image/png", fileUri: "gs://offline-fixtures/earlier.png" } }] },
      { role: "model", parts: [{ functionCall: { id: "capture_1", name: "capture", args: {} }, thoughtSignature: "opaque-gemini-signature" }] },
      { role: "user", parts: [{ functionResponse: { id: "capture_1", name: "capture", response: { output: LONG_LOG, frame: 1 }, parts: [{ inlineData: { mimeType: "image/png", data: PNG } }] } }] },
    ] };
    const body = format === "antigravity" ? { request, project: "offline-project" } : request;
    const originalUser = serialized(request.contents[0]);
    const originalCall = serialized(request.contents[1]);

    expect(await headroom(body, format, compressor)).not.toBeNull();

    const wire = serialized(format === "antigravity" ? body.request : body);
    expect(wire.contents[0]).toEqual(originalUser);
    expect(wire.contents[1]).toEqual(originalCall);
    expect(wire.contents[2]).toEqual({ role: "user", parts: [{ functionResponse: { id: "capture_1", name: "capture", response: { output: SHORT_LOG, frame: 1 }, parts: [{ inlineData: { mimeType: "image/png", data: PNG } }] } }] });
    expect(imageCount(wire)).toBe(2);
    expect(JSON.stringify(compressor.requests)).not.toContain(PNG);
  });

  it("preserves Gemini error functionResponse text instead of compressing away its trace", async () => {
    const compressor = await startCompressor();
    const body = { contents: [{ role: "user", parts: [
      { text: "Inspect the failed capture." },
      { functionResponse: { id: "capture_1", name: "capture", response: { error: "camera unavailable", output: ERROR_LOG }, parts: [{ inlineData: { mimeType: "image/png", data: PNG } }] } },
    ] }] };
    const before = JSON.stringify(body);

    expect(await headroom(body, "gemini", compressor)).not.toBeNull();

    expect(JSON.stringify(body)).toBe(before);
    expect(JSON.stringify(compressor.requests)).not.toContain(ERROR_LOG);
    expect(JSON.stringify(compressor.requests)).not.toContain(PNG);
  });

  it("compresses Responses text in place without losing reasoning, typed image outputs or custom tool metadata", async () => {
    const compressor = await startCompressor();
    const body = { input: [
      { type: "message", role: "user", content: [{ type: "input_text", text: "Inspect this capture." }, { type: "input_image", image_url: IMAGE_URL, detail: "high" }] },
      { type: "reasoning", id: "rs_prior", encrypted_content: "opaque-prior-state", summary: [] },
      { type: "function_call", call_id: "capture_1", name: "capture", arguments: "{}" },
      { type: "function_call_output", call_id: "capture_1", output: [{ type: "input_text", text: LONG_LOG }, { type: "input_image", image_url: IMAGE_URL, detail: "low" }] },
      { type: "custom_tool_call", call_id: "annotate_1", name: "annotate", input: "capture.png" },
      { type: "custom_tool_call_output", call_id: "annotate_1", output: [{ type: "input_text", text: LONG_LOG }, { type: "input_file", file_id: "file-capture-notes" }] },
    ] };
    const expected = serialized(body);
    expected.input[3].output[0].text = SHORT_LOG;
    expected.input[5].output[0].text = SHORT_LOG;

    expect(await headroom(body, "openai-responses", compressor)).not.toBeNull();
    expect(await headroom(body, "openai-responses", compressor)).not.toBeNull();

    expect(serialized(body)).toEqual(expected);
    expect(imageCount(body)).toBe(2);
    expect(JSON.stringify(compressor.requests)).not.toContain(PNG);
  });

  it.each([
    { format: "openai-responses", makeBody: () => ({ input: [
      { type: "function_call_output", call_id: "capture_1", output: [{ type: "input_text", text: LONG_LOG }, { type: "input_image", image_url: IMAGE_URL }] },
      { type: "function_call_output", call_id: "capture_2", output: "Different capture result." },
    ] }) },
    { format: "kiro", makeBody: () => ({ conversationState: { currentMessage: { userInputMessage: {
      content: "Compare the captures.", images: [{ format: "png", source: { bytes: PNG } }],
      userInputMessageContext: { toolResults: [
        { toolUseId: "capture_1", status: "success", content: [{ text: LONG_LOG }] },
        { toolUseId: "capture_2", status: "success", content: [{ text: "Different capture result." }] },
      ] },
    } } } }) },
    { format: "gemini", makeBody: () => ({ contents: [{ role: "user", parts: [
      { inlineData: { mimeType: "image/png", data: PNG } },
      { functionResponse: { id: "capture_1", name: "capture_alpha", response: { output: LONG_LOG } } },
      { functionResponse: { id: "capture_2", name: "capture_beta", response: { output: "Different capture result." } } },
    ] }] }) },
  ])("rejects reordered $format tool outputs instead of assigning results to another call", async ({ format, makeBody }) => {
    const compressor = await startCompressor("reverse_tools");
    const body = makeBody();
    const before = JSON.stringify(body);

    expect(await headroom(body, format, compressor)).toBeNull();
    expect(JSON.stringify(body)).toBe(before);
  });
});

describe("PXPIPE failure isolation for existing multimodal history", () => {
  it("keeps original typed image/tool content intact when the transformer mutates its encoded input and throws", async () => {
    const body = { messages: [{ role: "user", content: [
      { type: "tool_result", tool_use_id: "capture_1", content: [{ type: "text", text: LONG_LOG }, { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } }] },
      { type: "text", text: "Inspect the successful capture." },
    ] }] };
    const before = JSON.stringify(body);
    let sentBody;

    const result = await compressWithPxpipe(body, {
      enabled: true, format: "claude", minChars: 1, timeoutMs: 20,
      transform: async ({ body: encoded }) => {
        sentBody = JSON.parse(new TextDecoder().decode(encoded));
        encoded.fill(0);
        throw new Error("synthetic rendering failure");
      },
    });

    expect(result.body).toBeNull();
    expect(result.summary.reason).toBe("transform_error");
    expect(JSON.stringify(body)).toBe(before);
    expect(sentBody.messages[0].content[0].content[1]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: PNG } });
  });

  it("keeps images unchanged even if a timed-out transformer finishes after fallback", async () => {
    const body = { messages: [{ role: "user", content: [{ type: "text", text: LONG_LOG }, { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } }] }] };
    const before = JSON.stringify(body);
    let finish;
    let encodedInput;
    const completion = new Promise((resolve) => { finish = resolve; });

    const result = await compressWithPxpipe(body, {
      enabled: true, format: "claude", minChars: 1, timeoutMs: 20,
      transform: ({ body: encoded }) => {
        encodedInput = encoded;
        return completion;
      },
    });
    encodedInput.fill(0);
    finish({ applied: true, body: encodedInput, info: {} });
    await completion;

    expect(result.body).toBeNull();
    expect(result.summary.reason).toBe("timeout");
    expect(JSON.stringify(body)).toBe(before);
    expect(imageCount(body)).toBe(1);
  });
});
