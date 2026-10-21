import { ROLE, OPENAI_BLOCK, OPENAI_FINISH } from "../translator/schema/index.js";

const DEFAULT_OLLAMA_MODEL = "llama3.2";
const FINISH_REASONS = new Set([OPENAI_FINISH.STOP, OPENAI_FINISH.LENGTH, OPENAI_FINISH.TOOL_CALLS, OPENAI_FINISH.CONTENT_FILTER]);
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const validModel = value => typeof value === "string" && value.trim().length > 0;

function outputHeaders(response, contentType) {
  const headers = new Headers(response.headers);
  headers.set("content-type", contentType);
  // The representation changed; the original length/encoding no longer apply.
  headers.delete("content-length");
  headers.delete("content-encoding");
  return headers;
}

function usageCounts(usage) {
  const result = {};
  if (Number.isSafeInteger(usage?.prompt_tokens) && usage.prompt_tokens >= 0) result.prompt_eval_count = usage.prompt_tokens;
  if (Number.isSafeInteger(usage?.completion_tokens) && usage.completion_tokens >= 0) result.eval_count = usage.completion_tokens;
  return result;
}

function toolCall(name, args) {
  if (typeof name !== "string" || !name.trim()) throw new Error("Invalid tool call name in model output.");
  let parsed = args;
  if (typeof args === "string") {
    try { parsed = JSON.parse(args); } catch { throw new Error("Invalid tool arguments in model output."); }
  }
  if (!record(parsed)) throw new Error("Unsupported tool arguments in model output; an object is required.");
  return { function: { name, arguments: parsed } };
}

function assertTextAndTools(message) {
  if (!record(message) || (message.role != null && message.role !== ROLE.ASSISTANT) ||
      (message.content != null && typeof message.content !== "string") || message.images != null || message.audio != null ||
      (message.tool_calls != null && !Array.isArray(message.tool_calls))) {
    throw new Error("Unsupported model output; this adapter supports assistant text and function tools only.");
  }
}

function jsonCompletion(body, fallbackModel) {
  if (!record(body) || !Array.isArray(body.choices) || body.choices.length !== 1) throw new Error("Unrecognized model completion output.");
  const choice = body.choices[0];
  const message = choice?.message;
  assertTextAndTools(message);
  const calls = (message.tool_calls || []).map(call => {
    if (!record(call) || (call.type != null && call.type !== OPENAI_BLOCK.FUNCTION)) throw new Error("Unsupported tool call in model output.");
    return toolCall(call.function?.name, call.function?.arguments);
  });
  if (choice.finish_reason === OPENAI_FINISH.TOOL_CALLS && !calls.length) throw new Error("Model output finished with tool calls but supplied no actual tools.");
  if (typeof message.content !== "string" && !calls.length) throw new Error("Unrecognized model completion output.");
  if (!FINISH_REASONS.has(choice.finish_reason)) throw new Error("Missing or unsupported model completion finish reason.");
  return {
    model: validModel(body.model) ? body.model : fallbackModel,
    message: { role: ROLE.ASSISTANT, content: message.content ?? "", ...(calls.length ? { tool_calls: calls } : {}) },
    done: true,
    done_reason: choice.finish_reason,
    ...usageCounts(body.usage),
  };
}

// Adapt the handler's already-authenticated response, never the request body.
// HTTP failures retain their original status, body and diagnostic/rate headers.
export async function transformToOllama(response, model = DEFAULT_OLLAMA_MODEL) {
  if (!response.ok) return response;
  const fallbackModel = validModel(model) ? model : DEFAULT_OLLAMA_MODEL;
  const contentType = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  const init = { status: response.status, statusText: response.statusText };
  if (!response.body) {
    // These statuses are bodyless by HTTP contract, not model completions.
    if (response.status === 204 || response.status === 205) return response;
    return new Response(JSON.stringify({ error: "Missing model response body." }), { ...init, headers: outputHeaders(response, "application/json") });
  }
  if (contentType !== "text/event-stream") {
    const headers = outputHeaders(response, "application/json");
    let result;
    try {
      if (contentType !== "application/json" && !contentType.endsWith("+json")) throw new Error("Unsupported model response content type.");
      let body;
      try { body = await response.json(); } catch { throw new Error("Invalid JSON model output."); }
      result = body?.error ? body : jsonCompletion(body, fallbackModel);
    } catch (error) {
      result = { error: error.message };
    }
    return new Response(JSON.stringify(result), { ...init, headers });
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const encoder = new TextEncoder();
  const pendingTools = new Map();
  let modelName = fallbackModel;
  let buffer = "";
  let eventData = [];
  let finishReason = null;
  let usage = {};
  let sawOutput = false;
  let terminal = false;
  const emit = (controller, value) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
  const fail = (controller, error) => {
    if (terminal) return;
    terminal = true;
    emit(controller, { error: error.message || "Invalid model output stream." });
  };
  const complete = controller => {
    if (terminal) return;
    if (!finishReason || !sawOutput) throw new Error("Model output stream ended without a supported completion.");
    const calls = [...pendingTools.entries()].sort(([left], [right]) => left - right)
      .map(([, call]) => toolCall(call.names.join(""), call.arguments.join("")));
    if (finishReason === OPENAI_FINISH.TOOL_CALLS && !calls.length) throw new Error("Model output finished with tool calls but supplied no actual tools.");
    emit(controller, {
      model: modelName,
      message: { role: ROLE.ASSISTANT, content: "", ...(calls.length ? { tool_calls: calls } : {}) },
      done: true,
      done_reason: finishReason,
      ...usage,
    });
    terminal = true;
  };
  const consumeEvent = controller => {
    if (!eventData.length || terminal) { eventData = []; return; }
    const data = eventData.join("\n").trim();
    eventData = [];
    if (!data) return;
    if (data === "[DONE]") { complete(controller); return; }
    let parsed;
    try { parsed = JSON.parse(data); } catch { throw new Error("Invalid JSON event in model output stream."); }
    if (!record(parsed)) throw new Error("Unrecognized model output stream event.");
    if (parsed.error) throw new Error(typeof parsed.error === "string" ? parsed.error : parsed.error.message || "Model output stream failed.");
    if (validModel(parsed.model)) modelName = parsed.model;
    if (record(parsed.usage)) usage = { ...usage, ...usageCounts(parsed.usage) };
    if (!Array.isArray(parsed.choices) || parsed.choices.length > 1 || (!parsed.choices.length && !record(parsed.usage))) {
      throw new Error("Unrecognized model output stream event.");
    }
    if (!parsed.choices.length) return; // Real usage trailers can follow finish.
    const choice = parsed.choices[0];
    const delta = choice?.delta;
    assertTextAndTools(delta);
    if (delta.tool_calls?.length) {
      if (finishReason) throw new Error("Tool output arrived after the completion finish reason.");
      for (const call of delta.tool_calls) {
        if (!Number.isSafeInteger(call?.index) || call.index < 0 || (call.type != null && call.type !== OPENAI_BLOCK.FUNCTION) ||
            (call.function?.name != null && typeof call.function.name !== "string") ||
            (call.function?.arguments != null && typeof call.function.arguments !== "string")) {
          throw new Error("Unsupported tool call fragment in model output stream.");
        }
        const pending = pendingTools.get(call.index) || { id: call.id, names: [], arguments: [] };
        if (call.id != null && pending.id != null && call.id !== pending.id) throw new Error("Conflicting tool identities in model output stream.");
        if (call.id != null) pending.id = call.id;
        if (call.function?.name) pending.names.push(call.function.name);
        if (call.function?.arguments) pending.arguments.push(call.function.arguments);
        pendingTools.set(call.index, pending);
      }
      sawOutput = true;
    }
    if (typeof delta.content === "string") {
      if (finishReason && delta.content) throw new Error("Text output arrived after the completion finish reason.");
      sawOutput = true;
      if (delta.content) emit(controller, { model: modelName, message: { role: ROLE.ASSISTANT, content: delta.content }, done: false });
    }
    if (choice.finish_reason != null && choice.finish_reason !== "") {
      if (!FINISH_REASONS.has(choice.finish_reason)) throw new Error("Unsupported finish reason in model output stream.");
      finishReason = choice.finish_reason;
    }
  };
  const consumeLine = (line, controller) => {
    if (!line) { consumeEvent(controller); return; }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    if (field !== "data") return; // SSE event/id/retry fields are framing.
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    eventData.push(value);
  };
  const consumeLines = (controller, eof = false) => {
    while (buffer.length && !terminal) {
      const index = buffer.search(/[\r\n]/);
      if (index < 0 || (!eof && buffer[index] === "\r" && index === buffer.length - 1)) break;
      const width = buffer[index] === "\r" && buffer[index + 1] === "\n" ? 2 : 1;
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + width);
      consumeLine(line, controller);
    }
    if (eof && buffer && !terminal) { consumeLine(buffer, controller); buffer = ""; }
  };
  const transform = new TransformStream({
    transform(chunk, controller) {
      if (terminal) return;
      try {
        buffer += decoder.decode(chunk, { stream: true });
        consumeLines(controller);
      } catch (error) { fail(controller, error); }
      // Do not wait for the socket to close after a terminal/error record.
      // Termination closes the client body and cancels the upstream pipe.
      if (terminal) controller.terminate();
    },
    flush(controller) {
      if (terminal) return;
      try {
        buffer += decoder.decode();
        consumeLines(controller, true);
        consumeEvent(controller);
        complete(controller);
      } catch (error) { fail(controller, error); }
    },
  });
  return new Response(response.body.pipeThrough(transform), {
    ...init, headers: outputHeaders(response, "application/x-ndjson"),
  });
}
