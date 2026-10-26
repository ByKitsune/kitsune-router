import { register } from "../index.js";
import { FORMATS } from "../formats.js";
import { ROLE, CLAUDE_BLOCK, MODEL_FALLBACK } from "../schema/index.js";
import { fromOpenAIFinish } from "../concerns/finishReason.js";
import { extractReasoningText } from "../concerns/reasoning.js";
import { isCompleteToolName } from "../../utils/toolCompressor.js";

// Sanitize tool call arguments to fix bad params from non-Anthropic models
function sanitizeToolArgs(toolName, argsJson) {
  if (toolName !== "Read") return argsJson;
  try {
    const args = JSON.parse(argsJson);
    const before = JSON.stringify(args);
    sanitizeReadArgs(args);
    const after = JSON.stringify(args);
    return before === after ? argsJson : after;
  } catch {
    return argsJson;
  }
}

function sanitizeReadArgs(args) {
  if (typeof args.limit === "string" && /^\d+$/.test(args.limit)) args.limit = Number(args.limit);
  if (typeof args.offset === "string" && /^-?\d+$/.test(args.offset)) args.offset = Number(args.offset);

  if (typeof args.limit === "number") {
    if (args.limit > 2000) args.limit = 2000;
    if (args.limit < 1) delete args.limit;
  }
  if (typeof args.offset === "number" && args.offset < 0) args.offset = 0;

  if ("pages" in args && !isValidPdfPagesArg(args.file_path, args.pages)) {
    delete args.pages;
  }
}

function isValidPdfPagesArg(filePath, pages) {
  return typeof filePath === "string" &&
    filePath.toLowerCase().endsWith(".pdf") &&
    typeof pages === "string" &&
    /^\d+(?:-\d+)?$/.test(pages);
}

// Helper: stop thinking block if started
function stopThinkingBlock(state, results) {
  if (!state.thinkingBlockStarted) return;
  results.push({
    type: "content_block_stop",
    index: state.thinkingBlockIndex
  });
  state.thinkingBlockStarted = false;
}

// Helper: stop text block if started
function stopTextBlock(state, results) {
  if (!state.textBlockStarted || state.textBlockClosed) return;
  state.textBlockClosed = true;
  results.push({
    type: "content_block_stop",
    index: state.textBlockIndex
  });
  state.textBlockStarted = false;
}

function startPendingTools(state, results, finishing = false) {
  for (const [index, tool] of state.toolCalls) {
    if (!tool.started) {
      if (!tool.id || !tool.name || (!finishing && !tool.ready)) break;
      tool.started = true;
      tool.name = state.toolNameMap?.get(tool.name) || tool.name;
      results.push({ type: "content_block_start", index: tool.blockIndex,
        content_block: { type: CLAUDE_BLOCK.TOOL_USE, id: tool.id, name: tool.name, input: {} } });
    }
    const parts = state.toolArgBuffers?.get(index);
    if (tool.name === "Read" || !parts?.length) continue;
    results.push({ type: "content_block_delta", index: tool.blockIndex,
      delta: { type: "input_json_delta", partial_json: parts.join("") } });
    state.toolArgBuffers.delete(index);
  }
}

function emitClaudeTerminal(state) {
  if (!state.claudeFinishPending || state.claudeTerminalEmitted) return null;
  state.claudeTerminalEmitted = true;
  const finishReason = state.claudeFinishPending;
  state.claudeFinishPending = null;
  return [
    { type: "message_delta", delta: { stop_reason: convertFinishReason(finishReason) }, usage: state.claudeUsage || { input_tokens: 0, output_tokens: 0 } },
    { type: "message_stop" },
  ];
}

// Convert OpenAI stream chunk to Claude format
export function openaiToClaudeResponse(chunk, state) {
  if (!chunk) return emitClaudeTerminal(state);

  const results = [];

  // Track usage from OpenAI chunk if available
  if (chunk.usage && typeof chunk.usage === "object") {
    const promptTokens = typeof chunk.usage.prompt_tokens === "number" ? chunk.usage.prompt_tokens : 0;
    const outputTokens = typeof chunk.usage.completion_tokens === "number" ? chunk.usage.completion_tokens : 0;

    // Extract cache tokens from prompt_tokens_details
    const cachedTokens = chunk.usage.prompt_tokens_details?.cached_tokens;
    const cacheCreationTokens = chunk.usage.prompt_tokens_details?.cache_creation_tokens;
    const cacheReadTokens = typeof cachedTokens === "number" ? cachedTokens : 0;
    const cacheCreateTokens = typeof cacheCreationTokens === "number" ? cacheCreationTokens : 0;

    // input_tokens = prompt_tokens - cached_tokens - cache_creation_tokens
    // Because OpenAI's prompt_tokens includes all prompt-side tokens
    const inputTokens = promptTokens - cacheReadTokens - cacheCreateTokens;

    state.usage = {
      input_tokens: inputTokens,
      output_tokens: outputTokens
    };

    // Add cache_read_input_tokens if present
    if (cacheReadTokens > 0) {
      state.usage.cache_read_input_tokens = cacheReadTokens;
    }

    // Add cache_creation_input_tokens if present
    if (cacheCreateTokens > 0) {
      state.usage.cache_creation_input_tokens = cacheCreateTokens;
    }

    // Preserve reasoning tokens for usage tracking: Claude clients ignore the
    // extra field, but saveUsageStats/canonicalizeUsage need it populated or
    // the pivot drops every reasoning count for translated streams.
    const reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens;
    if (typeof reasoningTokens === "number" && reasoningTokens > 0) {
      state.usage.reasoning_tokens = reasoningTokens;
    }
    state.claudeUsage = state.usage;
  }
  const completeUsage = typeof chunk.usage?.prompt_tokens === "number" && typeof chunk.usage?.completion_tokens === "number";
  if (!chunk.choices?.[0]) return completeUsage ? emitClaudeTerminal(state) : null;
  const choice = chunk.choices[0];
  const delta = choice.delta;
  if (state.claudeTerminalEmitted) return null;
  // First chunk - ALWAYS send message_start first
  if (!state.messageStartSent) {
    state.messageStartSent = true;
    state.messageId = chunk.id?.replace("chatcmpl-", "") || `msg_${Date.now()}`;
    if (!state.messageId || state.messageId === "chat" || state.messageId.length < 8) {
      state.messageId = chunk.extend_fields?.requestId ||
        chunk.extend_fields?.traceId ||
        `msg_${Date.now()}`;
    }
    state.model = state.responseModel || state.model || chunk.model || MODEL_FALLBACK;
    state.nextBlockIndex = 0;
    results.push({
      type: "message_start",
      message: {
        id: state.messageId,
        type: "message",
        role: ROLE.ASSISTANT,
        model: state.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 }
      }
    });
  }

  // Handle reasoning (thinking) across vendor shapes - GLM/DeepSeek/Qwen/MiniMax/etc.
  const reasoningContent = extractReasoningText(delta);
  if (reasoningContent) {
    stopTextBlock(state, results);

    if (!state.thinkingBlockStarted) {
      state.thinkingBlockIndex = state.nextBlockIndex++;
      state.thinkingBlockStarted = true;
      results.push({
        type: "content_block_start",
        index: state.thinkingBlockIndex,
        content_block: { type: CLAUDE_BLOCK.THINKING, thinking: "" }
      });
    }

    results.push({
      type: "content_block_delta",
      index: state.thinkingBlockIndex,
      delta: { type: "thinking_delta", thinking: reasoningContent }
    });
  }

  // Messages has text blocks and a refusal stop reason, not a refusal text block.
  const textContent = (typeof delta?.content === "string" ? delta.content : "") +
    (typeof delta?.refusal === "string" ? delta.refusal : "");
  if (textContent) {
    stopThinkingBlock(state, results);

    if (!state.textBlockStarted) {
      state.textBlockIndex = state.nextBlockIndex++;
      state.textBlockStarted = true;
      state.textBlockClosed = false;
      results.push({
        type: "content_block_start",
        index: state.textBlockIndex,
        content_block: { type: CLAUDE_BLOCK.TEXT, text: "" }
      });
    }

    results.push({
      type: "content_block_delta",
      index: state.textBlockIndex,
      delta: { type: "text_delta", text: textContent }
    });
  }

  // Chat names can be fragmented independently of ids/arguments. Reserve block
  // order on first sight, but publish each immutable native start only once its
  // name is complete (the first argument, an exact declaration, or terminal).
  if (delta?.tool_calls) {
    for (const tc of delta.tool_calls) {
      const idx = tc.index ?? 0;
      let tool = state.toolCalls.get(idx);
      if (!tool) {
        stopThinkingBlock(state, results);
        stopTextBlock(state, results);
        tool = { id: tc.id, name: "", blockIndex: state.nextBlockIndex++, started: false, ready: false };
        state.toolCalls.set(idx, tool);
      }
      if (!tool.started) {
        if (tc.id) tool.id = tc.id;
        if (tc.function?.name) tool.name += tc.function.name;
        const name = state.toolNameMap?.get(tool.name) || tool.name;
        if ((state.targetFormat && state.targetFormat !== FORMATS.OPENAI) || isCompleteToolName(name, state.declaredToolNames)) tool.ready = true;
      }
      if (typeof tc.function?.arguments === "string" && tc.function.arguments) {
        state.toolArgBuffers ??= new Map();
        let parts = state.toolArgBuffers.get(idx);
        if (!parts) { parts = []; state.toolArgBuffers.set(idx, parts); }
        parts.push(tc.function.arguments);
        tool.ready = true;
      }
    }
    startPendingTools(state, results);
  }

  // Finish. Guarded: some providers repeat finish_reason on a trailing usage
  // chunk — re-running this block would emit the buffered args a second time.
  if (choice.finish_reason && !state.claudeFinishPending) {

    stopThinkingBlock(state, results);
    stopTextBlock(state, results);
    startPendingTools(state, results, true);

    for (const [idx, toolInfo] of state.toolCalls) {
      if (!toolInfo.started) continue;
      const parts = state.toolArgBuffers?.get(idx);
      if (parts?.length) {
        const args = sanitizeToolArgs(toolInfo.name, parts.join(""));
        results.push({ type: "content_block_delta", index: toolInfo.blockIndex,
          delta: { type: "input_json_delta", partial_json: args } });
      }
      results.push({
        type: "content_block_stop",
        index: toolInfo.blockIndex
      });
    }
    state.toolArgBuffers?.clear();

    state.finishReason = choice.finish_reason;
    state.claudeFinishPending = choice.finish_reason;
    // A native upstream may also put usage in a separate trailer before EOF.
    if (completeUsage) {
      results.push(...emitClaudeTerminal(state));
    }
  }
  if (state.claudeFinishPending && completeUsage) results.push(...emitClaudeTerminal(state));

  return results.length > 0 ? results : null;
}

const convertFinishReason = (reason) => fromOpenAIFinish(reason, "claude");

// Register
register(FORMATS.OPENAI, FORMATS.CLAUDE, null, openaiToClaudeResponse);
