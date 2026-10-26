import fs from "fs";
import path from "path";
import { createSSEParser, parseSSEEvent, streamEventPayload, createEventTransform, isValidStreamIndex, SSE_COMPLETION_GRACE_MS } from "../utils/sse.js";
import { extractResponseError } from "../translator/concerns/responseError.js";
import { sanitizeClientError } from "../utils/clientErrors.js";
import { toOpenAIUsage } from "../translator/concerns/usage.js";

function toResponsesUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const normalized = toOpenAIUsage(usage, "openai");
  const input = normalized.prompt_tokens ?? 0;
  const output = normalized.completion_tokens ?? 0;
  return {
    input_tokens: input, output_tokens: output, total_tokens: input + output,
    ...(normalized.prompt_tokens_details ? { input_tokens_details: normalized.prompt_tokens_details } : {}),
    ...(normalized.completion_tokens_details ? { output_tokens_details: normalized.completion_tokens_details } : {}),
  };
}

export function createResponsesLogger(model, logsDir = null) {
  if (typeof fs.mkdirSync !== "function") return null;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const uniqueId = Math.random().toString(36).slice(2, 8);
  const baseDir = logsDir || (typeof process !== "undefined" ? process.cwd() : ".");
  const logDir = path.join(baseDir, "logs", `responses_${model}_${timestamp}_${uniqueId}`);
  try { fs.mkdirSync(logDir, { recursive: true }); } catch { return null; }
  const inputEvents = [];
  const outputEvents = [];
  return {
    logInput: event => inputEvents.push(event),
    logOutput: event => outputEvents.push(event),
    flush() {
      try {
        fs.writeFileSync(path.join(logDir, "1_input_stream.txt"), inputEvents.join("\n"));
        fs.writeFileSync(path.join(logDir, "2_output_stream.txt"), outputEvents.join("\n"));
      } catch { console.log("[RESPONSES] Failed to write logs"); }
    },
  };
}

export function createResponsesApiTransformStream(logger = null, options = {}) {
  const customToolNames = new Set(options.customToolNames || []);
  const parser = createSSEParser();
  const encoder = new TextEncoder();
  const messages = new Map();
  const tools = new Map();
  const completedItems = new Map();
  const toolNames = new Map();
  let responseId = `resp_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  let sequence = 0;
  let nextIndex = 0;
  let started = false;
  let terminal = false;
  let finishSeen = false;
  let usage = null;
  let reasoning = null;
  let thinking = false;
  let completionTimer;
  let completionDeadline = null;
  let completing = false;
  let disposed = false;
  const emit = (controller, type, data) => {
    if (type === "response.output_item.done") completedItems.set(data.output_index, data.item);
    const output = `event: ${type}\ndata: ${JSON.stringify({ type, ...data, sequence_number: ++sequence })}\n\n`;
    logger?.logOutput(output.trim());
    controller.enqueue(encoder.encode(output));
  };
  const allocateIndex = () => {
    if (!isValidStreamIndex(nextIndex)) throw new RangeError("Upstream Responses output exceeds limit");
    return nextIndex++;
  };
  const start = (controller, parsed) => {
    if (started) return;
    started = true;
    if (parsed.id) responseId = `resp_${parsed.id}`;
    emit(controller, "response.created", { response: { id: responseId, object: "response", created_at: created, status: "in_progress", background: false, error: null, output: [] } });
    emit(controller, "response.in_progress", { response: { id: responseId, object: "response", created_at: created, status: "in_progress" } });
  };
  const startReasoning = controller => {
    if (reasoning) return;
    const index = allocateIndex();
    reasoning = { id: `rs_${responseId}_${index}`, index, parts: [] };
    emit(controller, "response.output_item.added", { output_index: index, item: { id: reasoning.id, type: "reasoning", status: "in_progress", summary: [] } });
    emit(controller, "response.reasoning_summary_part.added", { item_id: reasoning.id, output_index: index, summary_index: 0, part: { type: "summary_text", text: "" } });
  };
  const reasoningDelta = (controller, text) => {
    if (!text) return;
    startReasoning(controller);
    reasoning.parts.push(text);
    emit(controller, "response.reasoning_summary_text.delta", { item_id: reasoning.id, output_index: reasoning.index, summary_index: 0, delta: text });
  };
  const closeReasoning = controller => {
    if (!reasoning) return;
    const { id, index, parts } = reasoning;
    const text = parts.join("");
    emit(controller, "response.reasoning_summary_text.done", { item_id: id, output_index: index, summary_index: 0, text });
    emit(controller, "response.reasoning_summary_part.done", { item_id: id, output_index: index, summary_index: 0, part: { type: "summary_text", text } });
    emit(controller, "response.output_item.done", { output_index: index, item: { id, type: "reasoning", status: "completed", summary: [{ type: "summary_text", text }] } });
    reasoning = null;
  };
  const closeMessage = (controller, choiceIndex) => {
    const message = messages.get(choiceIndex);
    if (!message || message.closed) return;
    message.closed = true;
    const { id, index } = message;
    const text = message.parts.join("");
    emit(controller, "response.output_text.done", { item_id: id, output_index: index, content_index: 0, text, logprobs: [] });
    emit(controller, "response.content_part.done", { item_id: id, output_index: index, content_index: 0, part: { type: "output_text", annotations: [], logprobs: [], text } });
    emit(controller, "response.output_item.done", { output_index: index, item: { id, type: "message", status: "completed", content: [{ type: "output_text", annotations: [], logprobs: [], text }], role: "assistant" } });
    message.parts = [];
  };
  const closeTool = (controller, tool) => {
    if (tool.closed) return;
    tool.closed = true;
    const args = tool.parts.join("") || "{}";
    const name = tool.names.join("");
    const common = { item_id: `fc_${tool.id}`, output_index: tool.index };
    let input = args;
    if (customToolNames.has(name)) {
      try { const parsed = JSON.parse(args); if (typeof parsed?.input === "string") input = parsed.input; } catch {}
      emit(controller, "response.custom_tool_call_input.done", { ...common, input });
      emit(controller, "response.output_item.done", { output_index: tool.index, item: { id: common.item_id, type: "custom_tool_call", status: "completed", call_id: tool.id, name, input } });
    } else {
      emit(controller, "response.function_call_arguments.done", { ...common, arguments: args });
      emit(controller, "response.output_item.done", { output_index: tool.index, item: { id: common.item_id, type: "function_call", status: "completed", arguments: args, call_id: tool.id, name } });
    }
    tool.parts = [];
  };
  const dispose = () => {
    disposed = true;
    clearTimeout(completionTimer);
    parser.reset();
    messages.clear(); tools.clear(); toolNames.clear(); completedItems.clear();
    reasoning = null;
  };
  const fail = (controller, error) => {
    if (terminal || disposed) return;
    terminal = true;
    emit(controller, "response.failed", { response: { id: responseId, object: "response", created_at: created, status: "failed", error: sanitizeClientError(error), output: [...completedItems.values()], ...(usage ? { usage } : {}) } });
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    controller.terminate();
    dispose();
    logger?.flush();
  };
  const complete = async controller => {
    if (terminal || disposed || completing) return;
    completing = true;
    clearTimeout(completionTimer);
    if (!finishSeen) { fail(controller, { type: "stream_error", code: "stream_disconnected", message: "Upstream stream closed without a finish reason" }); return; }
    closeReasoning(controller);
    for (const index of messages.keys()) { await controller.ready(); closeMessage(controller, index); }
    for (const tool of tools.values()) { await controller.ready(); closeTool(controller, tool); }
    if (disposed) return;
    terminal = true;
    emit(controller, "response.completed", { response: {
      id: responseId, object: "response", created_at: created, status: "completed", background: false, error: null,
      output: [...completedItems.entries()].sort((a, b) => a[0] - b[0]).map(([, item]) => item), ...(usage ? { usage } : {}),
    } });
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    controller.terminate();
    dispose();
    logger?.flush();
  };
  const processEvent = async (event, controller) => {
    const parsed = streamEventPayload(event, parseSSEEvent(event));
    logger?.logInput(`chars=${event.data.length}`);
    if (event.data.trim() === "[DONE]") { await complete(controller); return; }
    if (parsed.usage) usage = toResponsesUsage(parsed.usage);
    const failure = extractResponseError(parsed);
    if (failure) { fail(controller, failure.error); return; }
    for (const choice of parsed.choices || []) {
      await controller.ready();
      if (terminal || disposed) return;
      const index = choice.index ?? 0;
      if (!isValidStreamIndex(index)) throw new RangeError("Invalid upstream choice index");
      if (["network_error", "error", "server_error", "timeout"].includes(choice.native_finish_reason || choice.finish_reason)) {
        fail(controller, { message: "Upstream generation failed", type: "stream_error" }); return;
      }
      start(controller, parsed);
      const delta = choice.delta || {};
      if (delta.reasoning_content || delta.reasoning) reasoningDelta(controller, delta.reasoning_content || delta.reasoning);
      if (typeof delta.content === "string" && delta.content) {
        let content = delta.content;
        if (content.includes("<think>")) { thinking = true; content = content.replace("<think>", ""); startReasoning(controller); }
        if (content.includes("</think>")) {
          const [before, ...after] = content.split("</think>");
          reasoningDelta(controller, before); closeReasoning(controller); thinking = false; content = after.join("</think>");
        }
        if (thinking) { reasoningDelta(controller, content); content = ""; }
        if (content) {
          closeReasoning(controller);
          let message = messages.get(index);
          if (!message || message.closed) {
            const outputIndex = allocateIndex();
            message = { id: `msg_${responseId}_${outputIndex}`, index: outputIndex, parts: [] };
            messages.set(index, message);
            emit(controller, "response.output_item.added", { output_index: outputIndex, item: { id: message.id, type: "message", status: "in_progress", content: [], role: "assistant" } });
            emit(controller, "response.content_part.added", { item_id: message.id, output_index: outputIndex, content_index: 0, part: { type: "output_text", annotations: [], logprobs: [], text: "" } });
          }
          message.parts.push(content);
          emit(controller, "response.output_text.delta", { item_id: message.id, output_index: message.index, content_index: 0, delta: content, logprobs: [] });
        }
      }
      if (delta.tool_calls?.length) {
        closeReasoning(controller); thinking = false; closeMessage(controller, index);
        for (const call of delta.tool_calls) {
          await controller.ready();
          if (disposed) return;
          const toolIndex = call.index ?? 0;
          if (!isValidStreamIndex(toolIndex)) throw new RangeError("Invalid upstream tool index");
          const key = `${index}:${toolIndex}`;
          const names = toolNames.get(key) || [];
          if (call.function?.name) names.push(call.function.name);
          toolNames.set(key, names);
          let tool = tools.get(key);
          if (!tool && call.id) {
            tool = { id: call.id, index: allocateIndex(), names, parts: [] };
            tools.set(key, tool);
            const custom = customToolNames.has(names.join(""));
            emit(controller, "response.output_item.added", { output_index: tool.index, item: {
              id: `fc_${tool.id}`, type: custom ? "custom_tool_call" : "function_call", status: "in_progress", call_id: tool.id,
              name: names.join(""), ...(custom ? { input: "" } : { arguments: "" }),
            } });
          }
          if (tool && call.function?.arguments) {
            tool.parts.push(call.function.arguments);
            emit(controller, customToolNames.has(names.join("")) ? "response.custom_tool_call_input.delta" : "response.function_call_arguments.delta", {
              item_id: `fc_${tool.id}`, output_index: tool.index, delta: call.function.arguments,
            });
          }
        }
      }
      if (choice.finish_reason) {
        finishSeen = true;
        closeReasoning(controller);
        for (const itemIndex of messages.keys()) { await controller.ready(); closeMessage(controller, itemIndex); }
        for (const tool of tools.values()) { await controller.ready(); closeTool(controller, tool); }
      }
    }
    if (finishSeen) completionDeadline ??= Date.now() + SSE_COMPLETION_GRACE_MS;
  };
  const transform = createEventTransform({
    async transform(chunk, controller) {
      clearTimeout(completionTimer);
      try {
        for (const event of parser.feed(chunk)) {
          await controller.ready();
          if (terminal || disposed) break;
          await processEvent(event, controller);
          if (terminal || disposed) break;
        }
      } catch { fail(controller, { message: "Invalid upstream stream event", type: "stream_error" }); }
      if (finishSeen && !terminal && !disposed) completionTimer = setTimeout(() => {
        completionTimer = null;
        void complete(controller).catch(dispose);
      }, Math.max(0, completionDeadline - Date.now()));
    },
    async flush(controller) {
      clearTimeout(completionTimer);
      for (const event of parser.end()) {
        await controller.ready();
        if (terminal || disposed) return;
        await processEvent(event, controller);
      }
      await complete(controller);
    },
    cancel: dispose,
  });
  void transform.whenClosed.then(dispose);
  transform.dispose = dispose;
  transform.isTerminal = () => terminal;
  return transform;
}
