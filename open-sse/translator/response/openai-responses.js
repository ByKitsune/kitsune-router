/**
 * Translator: OpenAI Chat Completions → OpenAI Responses API (response)
 * Converts streaming chunks from Chat Completions to Responses API events
 */
import { register } from "../index.js";
import { FORMATS } from "../formats.js";
import { buildChunk } from "../concerns/chunk.js";
import { getOpenAICacheWriteUsage, toOpenAIUsage } from "../concerns/usage.js";
import { fallbackToolCallId } from "../concerns/toolCall.js";
import { reasoningDelta, extractReasoningText, extractResponsesReasoningText, captureResponsesReasoning } from "../concerns/reasoning.js";
import { ROLE, OPENAI_BLOCK, RESPONSES_ITEM, OPENAI_FINISH, MODEL_FALLBACK } from "../schema/index.js";
import { isCompleteToolName } from "../../utils/toolCompressor.js";
import { extractResponseError, responseErrorToClient } from "../concerns/responseError.js";
import { getResponseServiceTier } from "../../providers/serviceTiers.js";

/**
 * Translate OpenAI chunk to Responses API events
 * @returns {Array} Array of events with { event, data } structure
 */
function toResponsesUsage(usage, allowZero = false) {
  if (!usage || typeof usage !== "object") return null;

  const inputTokens = [usage.input_tokens, usage.prompt_tokens].find(Number.isInteger);
  const outputTokens = [usage.output_tokens, usage.completion_tokens].find(Number.isInteger);
  // Some upstreams attach zeroed placeholders to every chunk. Wait for real counts
  // so response.completed cannot freeze the placeholder before the usage trailer.
  if (inputTokens === undefined || outputTokens === undefined || (!allowZero && inputTokens + outputTokens <= 0)) {
    return null;
  }
  const responseUsage = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens
  };
  const cachedTokens = [usage.input_tokens_details?.cached_tokens, usage.prompt_tokens_details?.cached_tokens].find(Number.isInteger);
  const reasoningTokens = [usage.output_tokens_details?.reasoning_tokens, usage.completion_tokens_details?.reasoning_tokens].find(Number.isInteger);
  if (Number.isInteger(cachedTokens)) responseUsage.input_tokens_details = { cached_tokens: cachedTokens };
  if (Number.isInteger(reasoningTokens)) responseUsage.output_tokens_details = { reasoning_tokens: reasoningTokens };
  const writes = getOpenAICacheWriteUsage(usage);
  if (writes) {
    const details = responseUsage.input_tokens_details ||= {};
    details.cache_write_tokens = writes.total;
    if (writes.thirtyMinute !== undefined || writes.twelveHour !== undefined) {
      details.cache_write_tokens_details = {
        ...(writes.thirtyMinute === undefined ? {} : { ttl_30m_tokens: writes.thirtyMinute }),
        ...(writes.twelveHour === undefined ? {} : { ttl_12h_tokens: writes.twelveHour }),
      };
    }
    if (writes.invalid) responseUsage.cache_write_invalid = true;
  }

  return responseUsage;
}

export function openaiToOpenAIResponsesResponse(chunk, state = {}) {
  state.seq ??= 0;
  state.responseId ??= `resp_${Date.now()}`;
  state.created ??= Math.floor(Date.now() / 1000);
  state.msgOutputIndexes ??= {};
  state.msgItemAdded ??= {};
  state.msgItemDone ??= {};
  state.msgContentAdded ??= {};
  state.msgTextBuf ??= {};
  state.funcCallIds ??= {};
  state.funcNames ??= {};
  state.funcItemAdded ??= {};
  state.funcArgsDone ??= {};
  state.funcItemDone ??= {};
  state.funcArgsBuf ??= {};
  state.toolOutputIndexes ??= {};

  if (!chunk) {
    return flushEvents(state);
  }
  state.serviceTier = getResponseServiceTier(chunk) ?? state.serviceTier;

  // Capture usage before the choices guard: OpenAI may send it in a trailer
  // whose choices array is empty.
  const responseUsage = toResponsesUsage(chunk.usage, Array.isArray(chunk.choices) && chunk.choices.length === 0);
  const latestUsage = toResponsesUsage(chunk.usage, true);
  if (latestUsage) state.responsesUsage = latestUsage;

  if (!chunk.choices?.length) {
    return state.completionPending && state.responsesUsage ? flushEvents(state) : [];
  }

  const events = [];
  const nextSeq = () => ++state.seq;
  
  const emit = (eventType, data) => {
    data.sequence_number = nextSeq();
    events.push({ event: eventType, data });
  };

  const choice = chunk.choices[0];
  const idx = choice.index || 0;
  const delta = choice.delta || {};

  // Emit initial events
  if (!state.started) {
    state.started = true;
    state.responseId = chunk.id ? `resp_${chunk.id}` : state.responseId;
    
    emit("response.created", {
      type: "response.created",
      response: {
        id: state.responseId,
        object: "response",
        created_at: state.created,
        status: "in_progress",
        background: false,
        error: null,
        output: []
      }
    });

    emit("response.in_progress", {
      type: "response.in_progress",
      response: {
        id: state.responseId,
        object: "response",
        created_at: state.created,
        status: "in_progress"
      }
    });
  }

  // Handle reasoning across vendor shapes (reasoning_content / reasoning / reasoning_details)
  const reasoningText = extractReasoningText(delta);
  if (reasoningText) {
    startReasoning(state, emit, idx);
    emitReasoningDelta(state, emit, reasoningText);
  }

  // Handle text content
  if (delta.content) {
    let content = delta.content;

    // Reasoning arrived via reasoning_content (not inline <think> tags) and now
    // normal text begins → the reasoning section is over. Close it here on the
    // state transition, so consumers get an explicit "reasoning ended" event
    // before the first output_text.delta (#454) without translators having to
    // inject literal tag markers into content.
    if (state.reasoningId && !state.reasoningDone && !state.inThinking) {
      closeReasoning(state, emit);
    }

    if (content.includes("<think>")) {
      state.inThinking = true;
      content = content.replace("<think>", "");
      startReasoning(state, emit, idx);
    }

    if (content.includes("</think>")) {
      const parts = content.split("</think>");
      const thinkPart = parts[0];
      const textPart = parts.slice(1).join("</think>");
      if (thinkPart) emitReasoningDelta(state, emit, thinkPart);
      closeReasoning(state, emit);
      state.inThinking = false;
      content = textPart;
    }

    if (state.inThinking && content) {
      emitReasoningDelta(state, emit, content);
      return events;
    }

    if (content) {
      emitTextContent(state, emit, idx, content);
    }
  }
  if (typeof delta.refusal === "string" && delta.refusal) {
    closeReasoning(state, emit);
    emitTextContent(state, emit, `refusal_${idx}`, delta.refusal, true);
  }

  // Handle tool_calls (empty array is truthy; require a real call)
  if (delta.tool_calls && delta.tool_calls.length) {
    closeReasoning(state, emit);
    state.inThinking = false;
    closeMessage(state, emit, idx);
    for (const tc of delta.tool_calls) {
      emitToolCall(state, emit, tc);
    }
  }

  // Handle finish_reason
  if (choice.finish_reason) {
    state.responsesFinishReason = choice.finish_reason;
    for (const i in state.msgItemAdded) closeMessage(state, emit, i);
    closeReasoning(state, emit);
    for (const i in state.funcCallIds) closeToolCall(state, emit, i);
    // Upstreams report usage either on the finish chunk itself or on a trailing chunk
    // whose `choices` array is empty (OpenAI does the latter). Emitting
    // response.completed here would freeze the payload before that trailing chunk is
    // parsed, so when usage is not known yet we leave completion to flushEvents(),
    // which runs once the upstream stream ends and by then has seen every chunk.
    //
    // That only holds on the direct openai:openai-responses route. When this converter
    // runs as the second hop of a pivot (Claude/Gemini/Kiro upstream), translateResponse()
    // drops the terminal null chunk before reaching us — the first hop returns null for
    // it, leaving nothing to iterate — so flushEvents() is never called and deferring
    // would swallow the terminal event entirely. Keep the old behaviour there.
    const flushReachesUs = state.targetFormat === FORMATS.OPENAI;
    if (responseUsage || !flushReachesUs) sendCompleted(state, emit);
    else state.completionPending = true;
  }

  return events;
}

// Helper functions
function startReasoning(state, emit, idx) {
  if (!state.reasoningId || state.reasoningDone) {
    state.reasoningIndex = state.nextOutputIndex ?? 0;
    state.nextOutputIndex = state.reasoningIndex + 1;
    state.reasoningId = `rs_${state.responseId}_${state.reasoningIndex}`;
    state.reasoningDone = false;
    state.reasoningBuf = "";
    
    emit("response.output_item.added", {
      type: "response.output_item.added",
      output_index: state.reasoningIndex,
      item: { id: state.reasoningId, type: RESPONSES_ITEM.REASONING, status: "in_progress", summary: [] }
    });

    emit("response.reasoning_summary_part.added", {
      type: "response.reasoning_summary_part.added",
      item_id: state.reasoningId,
      output_index: state.reasoningIndex,
      summary_index: 0,
      part: { type: RESPONSES_ITEM.SUMMARY_TEXT, text: "" }
    });
    state.reasoningPartAdded = true;
  }
}

function emitReasoningDelta(state, emit, text) {
  if (!text) return;
  state.reasoningBuf += text;
  emit("response.reasoning_summary_text.delta", {
    type: "response.reasoning_summary_text.delta",
    item_id: state.reasoningId,
    output_index: state.reasoningIndex,
    summary_index: 0,
    delta: text
  });
}

function closeReasoning(state, emit) {
  if (state.reasoningId && !state.reasoningDone) {
    state.reasoningDone = true;
    
    emit("response.reasoning_summary_text.done", {
      type: "response.reasoning_summary_text.done",
      item_id: state.reasoningId,
      output_index: state.reasoningIndex,
      summary_index: 0,
      text: state.reasoningBuf
    });

    emit("response.reasoning_summary_part.done", {
      type: "response.reasoning_summary_part.done",
      item_id: state.reasoningId,
      output_index: state.reasoningIndex,
      summary_index: 0,
      part: { type: RESPONSES_ITEM.SUMMARY_TEXT, text: state.reasoningBuf }
    });

    const item = {
      id: state.reasoningId,
      type: RESPONSES_ITEM.REASONING,
      status: "completed",
      summary: [{ type: RESPONSES_ITEM.SUMMARY_TEXT, text: state.reasoningBuf }]
    };

    emit("response.output_item.done", {
      type: "response.output_item.done",
      output_index: state.reasoningIndex,
      item
    });

    recordCompletedOutputItem(state, state.reasoningIndex, item);
  }
}

function emitTextContent(state, emit, idx, content, refusal = false) {
  state.msgOutputIndexes ??= {};
  if (!state.msgItemAdded[idx] || state.msgItemDone[idx]) {
    state.msgOutputIndexes[idx] = state.nextOutputIndex ?? 0;
    state.nextOutputIndex = state.msgOutputIndexes[idx] + 1;
    state.msgItemAdded[idx] = true;
    state.msgItemDone[idx] = false;
    state.msgContentAdded[idx] = false;
    state.msgTextBuf[idx] = "";
    state.msgRefusal ??= {};
    state.msgRefusal[idx] = refusal;
    const msgId = `msg_${state.responseId}_${state.msgOutputIndexes[idx]}`;
    
    emit("response.output_item.added", {
      type: "response.output_item.added",
      output_index: state.msgOutputIndexes[idx],
      item: { id: msgId, type: RESPONSES_ITEM.MESSAGE, status: "in_progress", content: [], role: ROLE.ASSISTANT }
    });
  }

  if (!state.msgContentAdded[idx]) {
    state.msgContentAdded[idx] = true;
    
    emit("response.content_part.added", {
      type: "response.content_part.added",
      item_id: `msg_${state.responseId}_${state.msgOutputIndexes[idx]}`,
      output_index: state.msgOutputIndexes[idx],
      content_index: 0,
      part: refusal ? { type: RESPONSES_ITEM.REFUSAL, refusal: "" } : { type: RESPONSES_ITEM.OUTPUT_TEXT, annotations: [], logprobs: [], text: "" }
    });
  }

  const event = refusal ? "response.refusal.delta" : "response.output_text.delta";
  emit(event, {
    type: event,
    item_id: `msg_${state.responseId}_${state.msgOutputIndexes[idx]}`,
    output_index: state.msgOutputIndexes[idx],
    content_index: 0,
    delta: content,
    ...(!refusal ? { logprobs: [] } : {})
  });

  if (!state.msgTextBuf[idx]) state.msgTextBuf[idx] = "";
  state.msgTextBuf[idx] += content;
}

function closeMessage(state, emit, idx) {
  if (state.msgItemAdded[idx] && !state.msgItemDone[idx]) {
    state.msgItemDone[idx] = true;
    const fullText = state.msgTextBuf[idx] || "";
    const outputIndex = state.msgOutputIndexes[idx];
    const msgId = `msg_${state.responseId}_${outputIndex}`;

    const refusal = state.msgRefusal?.[idx];
    const event = refusal ? "response.refusal.done" : "response.output_text.done";
    const part = refusal ? { type: RESPONSES_ITEM.REFUSAL, refusal: fullText }
      : { type: RESPONSES_ITEM.OUTPUT_TEXT, annotations: [], logprobs: [], text: fullText };
    emit(event, {
      type: event, item_id: msgId, output_index: outputIndex, content_index: 0,
      ...(refusal ? { refusal: fullText } : { text: fullText, logprobs: [] })
    });
    emit("response.content_part.done", {
      type: "response.content_part.done", item_id: msgId, output_index: outputIndex, content_index: 0, part
    });
    const item = {
      id: msgId, type: RESPONSES_ITEM.MESSAGE, status: "completed", content: [part], role: ROLE.ASSISTANT
    };

    emit("response.output_item.done", {
      type: "response.output_item.done",
      output_index: outputIndex,
      item
    });

    recordCompletedOutputItem(state, outputIndex, item);
  }
}

function isCustomTool(state, name) {
  return !!name && state.customToolNames?.has(name);
}

function extractCustomToolInput(argumentsText) {
  if (typeof argumentsText !== "string") return "";
  try {
    const parsed = JSON.parse(argumentsText);
    if (parsed && typeof parsed === "object" && typeof parsed.input === "string") return parsed.input;
  } catch { /* incomplete or raw freeform input */ }
  return argumentsText;
}

function startToolCall(state, emit, idx) {
  const callId = state.funcCallIds[idx];
  if (state.funcItemAdded[idx] || !callId || !state.funcNames[idx]) return;
  state.funcItemAdded[idx] = true;
  state.funcNames[idx] = state.toolNameMap?.get(state.funcNames[idx]) || state.funcNames[idx];
  const custom = isCustomTool(state, state.funcNames[idx]);
  emit("response.output_item.added", {
    type: "response.output_item.added", output_index: state.funcOutputIndexes[idx],
    item: { id: `${custom ? "ctc" : "fc"}_${callId}`,
      type: custom ? RESPONSES_ITEM.CUSTOM_TOOL_CALL : RESPONSES_ITEM.FUNCTION_CALL,
      status: "in_progress", ...(custom ? { input: "" } : { arguments: "" }),
      call_id: callId, name: state.funcNames[idx] }
  });
  const pending = state.funcArgsBuf[idx];
  if (pending?.length && !custom) {
    emit("response.function_call_arguments.delta", {
      type: "response.function_call_arguments.delta", item_id: `fc_${callId}`,
      output_index: state.funcOutputIndexes[idx], delta: pending.join("")
    });
  }
}

function emitToolCall(state, emit, tc) {
  const idx = tc.index ?? 0;
  state.funcOutputIndexes ??= {};
  if (state.funcOutputIndexes[idx] === undefined) {
    state.funcOutputIndexes[idx] = state.nextOutputIndex ?? 0;
    state.nextOutputIndex = state.funcOutputIndexes[idx] + 1;
  }
  if (!state.funcItemAdded[idx]) {
    if (tc.function?.name) state.funcNames[idx] = (state.funcNames[idx] || "") + tc.function.name;
    if (tc.id) state.funcCallIds[idx] = tc.id;
  }
  const args = tc.function?.arguments;
  const name = state.toolNameMap?.get(state.funcNames[idx]) || state.funcNames[idx];
  if (args || isCompleteToolName(name, state.customToolNames) || isCompleteToolName(name, state.declaredToolNames) || (state.targetFormat && state.targetFormat !== FORMATS.OPENAI)) {
    startToolCall(state, emit, idx);
  }
  state.funcArgsBuf[idx] ??= [];
  if (args) {
    if (state.funcItemAdded[idx] && !isCustomTool(state, state.funcNames[idx])) {
      emit("response.function_call_arguments.delta", {
        type: "response.function_call_arguments.delta", item_id: `fc_${state.funcCallIds[idx]}`,
        output_index: state.funcOutputIndexes[idx], delta: args
      });
    }
    state.funcArgsBuf[idx].push(args);
  }
}

function closeToolCall(state, emit, idx) {
  const callId = state.funcCallIds[idx];
  if (callId && !state.funcItemDone[idx]) {
    state.funcOutputIndexes ??= {};
    if (state.funcOutputIndexes[idx] === undefined) {
      state.funcOutputIndexes[idx] = state.nextOutputIndex ?? 0;
      state.nextOutputIndex = state.funcOutputIndexes[idx] + 1;
    }
    startToolCall(state, emit, idx);
    const outputIndex = state.funcOutputIndexes[idx];
    const args = state.funcArgsBuf[idx]?.length ? state.funcArgsBuf[idx].join("") : "{}";
    const custom = isCustomTool(state, state.funcNames[idx]);

    if (custom) {
      const input = extractCustomToolInput(args);
      emit("response.custom_tool_call_input.delta", {
        type: "response.custom_tool_call_input.delta",
        item_id: `ctc_${callId}`,
        output_index: outputIndex,
        delta: input
      });
      emit("response.custom_tool_call_input.done", {
        type: "response.custom_tool_call_input.done",
        item_id: `ctc_${callId}`,
        output_index: outputIndex,
        input
      });
    } else {
      emit("response.function_call_arguments.done", {
        type: "response.function_call_arguments.done",
        item_id: `fc_${callId}`,
        output_index: outputIndex,
        arguments: args
      });
    }

    const item = {
      id: `${custom ? "ctc" : "fc"}_${callId}`,
      type: custom ? RESPONSES_ITEM.CUSTOM_TOOL_CALL : RESPONSES_ITEM.FUNCTION_CALL,
      status: "completed",
      ...(custom ? { input: extractCustomToolInput(args) } : { arguments: args }),
      call_id: callId,
      name: state.funcNames[idx] || ""
    };

    emit("response.output_item.done", {
      type: "response.output_item.done",
      output_index: outputIndex,
      item
    });

    recordCompletedOutputItem(state, outputIndex, item);

    state.funcItemDone[idx] = true;
    state.funcArgsDone[idx] = true;
  }
}

// response.completed carries the finished Response object, so response.output has
// to repeat the items already delivered in response.output_item.done. Clients that
// build their final result from the terminal event (GitHub Copilot CLI, the OpenAI
// SDK "final response" helpers) otherwise treat the turn as empty even though the
// text was streamed - see issue #4307.
//
// Keyed by the unique output_index allocated when each item is opened, so repeated
// closes cannot duplicate an item and response.output preserves item-added order.
// Lazily created because stream.js can hand us a state it built itself rather
// than one from initState().
function recordCompletedOutputItem(state, outputIndex, item) {
  state.completedOutputItems ??= new Map();
  const index = Number.isInteger(outputIndex) ? outputIndex : Number.parseInt(outputIndex, 10) || 0;
  state.completedOutputItems.set(index, item);
}

function collectCompletedOutputItems(state) {
  const recorded = state.completedOutputItems;
  if (!(recorded instanceof Map) || recorded.size === 0) return [];
  return [...recorded.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, item]) => item);
}

function sendCompleted(state, emit) {
  if (!state.completedSent) {
    state.completedSent = true;
    const incomplete = state.responsesFinishReason === OPENAI_FINISH.LENGTH;
    const event = incomplete ? "response.incomplete" : "response.completed";
    emit(event, {
      type: event,
      response: {
        id: state.responseId,
        object: "response",
        created_at: state.created,
        status: incomplete ? "incomplete" : "completed",
        ...(incomplete ? { incomplete_details: { reason: "max_output_tokens" } } : {}),
        background: false,
        error: null,
        output: collectCompletedOutputItems(state),
        ...(state.serviceTier ? { service_tier: state.serviceTier } : {}),
        ...(state.responsesUsage ? { usage: state.responsesUsage } : {})
      }
    });
  }
}

function flushEvents(state) {
  if (state.completedSent) return [];
  
  const events = [];
  const nextSeq = () => ++state.seq;
  const emit = (eventType, data) => {
    data.sequence_number = nextSeq();
    events.push({ event: eventType, data });
  };

  for (const i in state.msgItemAdded) closeMessage(state, emit, i);
  closeReasoning(state, emit);
  for (const i in state.funcCallIds) closeToolCall(state, emit, i);
  sendCompleted(state, emit);
  
  return events;
}

// currentToolCallId is intentionally sticky for the current turn so flush/completion
  // can still finalize as tool_calls even if the tool call was emitted before stream end.
function computeFinishReason(state) {
   return state.toolCallIndex > 0 || state.currentToolCallId
    ? OPENAI_FINISH.TOOL_CALLS
    : OPENAI_FINISH.STOP;
}

function responseTool(state, data, item = data.item) {
  state.responsesToolsByIndex ??= new Map();
  state.responsesToolsById ??= new Map();
  let tool = state.responsesToolsById.get(data.item_id)
    || state.responsesToolsById.get(item?.id)
    || state.responsesToolsById.get(item?.call_id)
    || state.responsesToolsByIndex.get(data.output_index);
  if (!tool && !item && data.output_index === undefined && !data.item_id) tool = state.responsesCurrentTool;
  if (!tool && item) {
    tool = { index: state.toolCallIndex++, id: item.call_id || fallbackToolCallId(),
      name: item.name || "", custom: item.type === RESPONSES_ITEM.CUSTOM_TOOL_CALL,
      started: false, argumentsSeen: false, inputParts: [], inputEmitted: false };
  }
  if (!tool) return null;
  if (!tool.started && item?.name) tool.name = state.toolNameMap?.get(item.name) || item.name;
  if (data.output_index !== undefined) state.responsesToolsByIndex.set(data.output_index, tool);
  for (const id of [data.item_id, item?.id, item?.call_id]) if (id) state.responsesToolsById.set(id, tool);
  state.responsesCurrentTool = tool;
  state.currentToolCallId = tool.id;
  return tool;
}

function responseToolChunks(tool, state, args) {
  if (!tool) return [];
  const meta = { id: state.chatId, created: state.created, model: state.model || MODEL_FALLBACK };
  const results = [];
  if (!tool.started) {
    tool.started = true;
    results.push(buildChunk(meta, { tool_calls: [{ index: tool.index, id: tool.id,
      type: OPENAI_BLOCK.FUNCTION, function: { name: tool.name, arguments: "" } }] }));
  }
  if (typeof args === "string" && args) {
    tool.argumentsSeen = true;
    results.push(buildChunk(meta, { tool_calls: [{ index: tool.index, function: { arguments: args } }] }));
  }
  return results;
}

function completeResponseTool(tool, state, item = {}) {
  if (!tool) return [];
  if (tool.custom) {
    if (tool.inputEmitted) return [];
    tool.inputEmitted = true;
    const input = tool.inputParts.length ? tool.inputParts.join("") : item.input ?? "";
    return responseToolChunks(tool, state, JSON.stringify({ input }));
  }
  return responseToolChunks(tool, state, tool.argumentsSeen ? null : item.arguments);
}

/**
 * Translate OpenAI Responses API chunk to OpenAI Chat Completions format
 * This is for when Codex returns data and we need to send it to an OpenAI-compatible client
 */
export function openaiResponsesToOpenAIResponse(chunk, state) {
  if (!chunk) {
    // Flush: send final chunk with finish_reason
    if (state.finishReasonSent || !state.started) return null;

    const finishReason = computeFinishReason(state);

    state.finishReasonSent = true;
    state.finishReason = finishReason;

    const finalChunk = buildChunk(
      { id: state.chatId || `chatcmpl-${Date.now()}`, created: state.created || Math.floor(Date.now() / 1000), model: state.model || MODEL_FALLBACK },
      {},
      finishReason
    );

    if (state.usage && typeof state.usage === "object") {
      finalChunk.usage = state.usage;
    }
    if (state.serviceTier) finalChunk.service_tier = state.serviceTier;

    return finalChunk;
  }

  // Handle different event types from Responses API
  const eventType = chunk.type || chunk.event;
  const data = chunk.data || chunk;
  state.serviceTier = getResponseServiceTier(data) ?? state.serviceTier;

  // Initialize state
  if (!state.started) {
    state.started = true;
    state.chatId = `chatcmpl-${Date.now()}`;
    state.created = Math.floor(Date.now() / 1000);
    state.toolCallIndex = 0;
    state.currentToolCallId = null;
  }

  const reasoning = state.finishReasonSent ? "" : captureResponsesReasoning(chunk, state);
  const reasoningChunk = reasoning ? buildChunk(
    { id: state.chatId, created: state.created, model: state.model || MODEL_FALLBACK },
    reasoningDelta(reasoning)
  ) : null;

  // Text content delta
  if (eventType === "response.output_text.delta") {
    const delta = data.delta || "";
    if (!delta) return null;

    return buildChunk(
      { id: state.chatId, created: state.created, model: state.model || MODEL_FALLBACK },
      { content: delta }
    );
  }
  if (eventType === "response.refusal.delta") {
    return typeof data.delta === "string" && data.delta
      ? buildChunk({ id: state.chatId, created: state.created, model: state.model || MODEL_FALLBACK }, { refusal: data.delta }) : null;
  }

  // Text content done (ignore, we handle via delta)
  if (eventType === "response.output_text.done") {
    return null;
  }

  const toolItem = data.item;
  const isToolItem = toolItem?.type === RESPONSES_ITEM.FUNCTION_CALL || toolItem?.type === RESPONSES_ITEM.CUSTOM_TOOL_CALL;
  if (eventType === "response.output_item.added" && isToolItem) {
    return responseToolChunks(responseTool(state, data), state);
  }
  if (eventType === "response.function_call_arguments.delta") {
    return responseToolChunks(responseTool(state, data), state, data.delta);
  }
  if (eventType === "response.custom_tool_call_input.delta") {
    const tool = responseTool(state, data);
    if (tool && typeof data.delta === "string") tool.inputParts.push(data.delta);
    return null;
  }
  if (eventType === "response.function_call_arguments.done" || eventType === "response.custom_tool_call_input.done") {
    return completeResponseTool(responseTool(state, data), state, data);
  }
  if (eventType === "response.output_item.done" && isToolItem) {
    return completeResponseTool(responseTool(state, data), state, toolItem);
  }

  // Response completed
  if (["response.completed", "response.done", "response.incomplete"].includes(eventType)) {
    const pendingTools = [];
    for (const item of data.response?.output || []) {
      if (item.type === RESPONSES_ITEM.FUNCTION_CALL || item.type === RESPONSES_ITEM.CUSTOM_TOOL_CALL) {
        const tool = responseTool(state, { item });
        pendingTools.push(...completeResponseTool(tool, state, item));
      }
    }
    // Extract usage from response.completed event
    const responseUsage = data.response?.usage;
    if (responseUsage && typeof responseUsage === "object") {
      // Input is already inclusive of cache reads/writes. Preserve native
      // 30m/12h subsets through the shared normalizer; never add them as extra
      // Anthropic-style input or invent a missing lifetime split.
      state.usage = toOpenAIUsage({
        ...responseUsage,
        cached_tokens: responseUsage.input_tokens_details?.cached_tokens ?? responseUsage.cache_read_input_tokens ?? responseUsage.cached_tokens,
      }, "responses");
    }
    
    if (!state.finishReasonSent) {
      const incomplete = data.response?.incomplete_details?.reason;
      const finishReason = eventType === "response.incomplete" && incomplete === "max_output_tokens"
        ? OPENAI_FINISH.LENGTH : eventType === "response.incomplete" && incomplete === "content_filter"
          ? OPENAI_FINISH.CONTENT_FILTER : computeFinishReason(state);

      state.finishReasonSent = true;
      state.finishReason = finishReason; // Mark for usage injection in stream.js
      
      const finalChunk = buildChunk(
        { id: state.chatId, created: state.created, model: state.model || MODEL_FALLBACK },
        {},
        finishReason
      );

      // Include usage in final chunk if available
      if (state.usage && typeof state.usage === "object") {
        finalChunk.usage = state.usage;
      }
      if (state.serviceTier) finalChunk.service_tier = state.serviceTier;
      
      const results = [...pendingTools];
      if (reasoningChunk) results.push(reasoningChunk);
      results.push(finalChunk);
      return results.length === 1 ? finalChunk : results;
    }
    return null;
  }

  // Error events from Responses API (e.g. model_not_found)
  if (eventType === "error" || eventType === "response.failed") {
    // Avoid emitting duplicate errors (error + response.failed arrive back-to-back)
    if (state.finishReasonSent) return null;

    const failure = extractResponseError(data);
    if (!failure) return null;
    state.error = failure.error;
    state.finishReasonSent = true;
    return responseErrorToClient(FORMATS.OPENAI, failure, state);
  }

  return reasoningChunk;
}

/**
 * Convert a completed Responses-API JSON body (`object:"response"`) into an
 * OpenAI Chat Completions response. Used when a chat-native client talks to a
 * provider that only speaks the Responses transport (e.g. OpenCode zen muse)
 * and the upstream answered non-streaming.
 */
export function openaiResponsesObjectToCompletion(body) {
  if (!body || typeof body !== "object" || body.object !== "response") return body;
  const output = Array.isArray(body.output) ? body.output : [];

  let content = "";
  let reasoning = "";
  const toolCalls = [];
  let refusal = "";

  for (const item of output) {
    if (item?.type === RESPONSES_ITEM.MESSAGE && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part?.type === RESPONSES_ITEM.OUTPUT_TEXT && typeof part.text === "string") {
          content += part.text;
        }
        if (part?.type === RESPONSES_ITEM.REFUSAL && typeof part.refusal === "string") refusal += part.refusal;
      }
    } else if (item?.type === RESPONSES_ITEM.REASONING) {
      reasoning += extractResponsesReasoningText(item);
    } else if (item?.type === RESPONSES_ITEM.FUNCTION_CALL || item?.type === RESPONSES_ITEM.CUSTOM_TOOL_CALL) {
      toolCalls.push({
        id: item.call_id || item.id || `call_${item.name}_${Date.now()}`,
        type: "function",
        function: {
          name: item.name,
          arguments: item.type === RESPONSES_ITEM.CUSTOM_TOOL_CALL
            ? JSON.stringify({ input: item.input ?? "" })
            : typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}),
        },
      });
    }
  }

  const message = { role: ROLE.ASSISTANT, content };
  if (reasoning) message.reasoning_content = reasoning;
  if (refusal) message.refusal = refusal;
  if (toolCalls.length > 0) message.tool_calls = toolCalls;

  const usageIn = body.usage?.input_tokens;
  const usageOut = body.usage?.output_tokens;
  const completion = {
    id: body.id || `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body.model,
    ...(getResponseServiceTier(body) ? { service_tier: body.service_tier } : {}),
    choices: [{
      index: 0,
      message,
      finish_reason: body.status === "incomplete" && body.incomplete_details?.reason === "max_output_tokens"
        ? OPENAI_FINISH.LENGTH : body.status === "incomplete" && body.incomplete_details?.reason === "content_filter"
          ? OPENAI_FINISH.CONTENT_FILTER : toolCalls.length > 0 ? OPENAI_FINISH.TOOL_CALLS : OPENAI_FINISH.STOP,
    }],
  };
  if (usageIn != null || usageOut != null) {
    completion.usage = {
      prompt_tokens: usageIn || 0,
      completion_tokens: usageOut || 0,
      total_tokens: body.usage?.total_tokens ?? (usageIn || 0) + (usageOut || 0),
      ...(body.usage?.input_tokens_details ? { prompt_tokens_details: body.usage.input_tokens_details } : {}),
      ...(body.usage?.output_tokens_details ? { completion_tokens_details: body.usage.output_tokens_details } : {}),
    };
  }
  return completion;
}

// Register both directions
register(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, null, openaiToOpenAIResponsesResponse);
register(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, null, openaiResponsesToOpenAIResponse);
