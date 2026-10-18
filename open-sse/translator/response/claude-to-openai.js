import { register } from "../index.js";
import { FORMATS } from "../formats.js";
import { ROLE, OPENAI_BLOCK, CLAUDE_BLOCK, OPENAI_FINISH } from "../schema/index.js";
import { buildChunk } from "../concerns/chunk.js";
import { getCacheCreationUsage, toOpenAIUsage } from "../concerns/usage.js";
import { reasoningDelta } from "../concerns/reasoning.js";
import { toOpenAIFinish } from "../concerns/finishReason.js";

// Create OpenAI chunk helper
function createChunk(state, delta, finishReason = null) {
  return buildChunk(
    { id: `chatcmpl-${state.messageId}`, created: Math.floor(Date.now() / 1000), model: state.model },
    delta,
    finishReason
  );
}

// Record Anthropic usage on the translator state in the canonical OpenAI
// convention: prompt_tokens is cache-INCLUSIVE and the cache split rides in
// cached_tokens / prompt_tokens_details. stream.js re-emits state.usage to the
// client through filterUsageForFormat() (which keeps only OpenAI field names)
// and hands it to canonicalizeUsage() for logging (which folds cache into the
// prompt only when cached_tokens is absent). Keeping the raw Claude-exclusive
// split here without cached_tokens dropped the cache from the client's final
// chunk and double-counted the prompt in usage logs.
function setUsageState(state, { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, cacheCreation5mTokens, cacheCreation1hTokens }) {
  state.usage = {
    ...toOpenAIUsage({
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_input_tokens: cacheReadTokens,
      cache_creation_input_tokens: cacheCreationTokens,
      cache_creation_5m_tokens: cacheCreation5mTokens,
      cache_creation_1h_tokens: cacheCreation1hTokens,
    }, "claude"),
    cached_tokens: cacheReadTokens,
    input_tokens: inputTokens,
    output_tokens: outputTokens
  };
  if (cacheReadTokens > 0) state.usage.cache_read_input_tokens = cacheReadTokens;
  if (cacheCreationTokens > 0) state.usage.cache_creation_input_tokens = cacheCreationTokens;
  if (cacheCreation5mTokens !== undefined) state.usage.cache_creation_5m_tokens = cacheCreation5mTokens;
  if (cacheCreation1hTokens !== undefined) state.usage.cache_creation_1h_tokens = cacheCreation1hTokens;
}

// The OpenAI-facing subset of state.usage (drops the Claude-native mirror fields).
function clientUsage(usage) {
  const { prompt_tokens, completion_tokens, total_tokens, prompt_tokens_details } = usage;
  return { prompt_tokens, completion_tokens, total_tokens, ...(prompt_tokens_details ? { prompt_tokens_details } : {}) };
}

function flushToolInputSnapshot(state, toolCall, results) {
  if (!toolCall?.inputSnapshot || toolCall.hasInputDeltas || toolCall.snapshotEmitted) return;
  toolCall.snapshotEmitted = true;
  results.push(createChunk(state, { tool_calls: [{
    index: toolCall.index, function: { arguments: toolCall.inputSnapshot },
  }] }));
}

function flushToolInputSnapshots(state, results) {
  if (!state.toolCalls) return;
  for (const toolCall of state.toolCalls.values()) flushToolInputSnapshot(state, toolCall, results);
}

function captureNativeClaudeResponse(chunk, state) {
  if (chunk?.type === "message_start") {
    const message = chunk.message || {};
    state.nativeResponse = { ...message, content: [...(message.content || [])], usage: { ...message.usage } };
    state.nativeBlockChunks = new Map();
  }
  const message = state.nativeResponse;
  if (!message) return;
  if (chunk?.type === "content_block_start") {
    message.content[chunk.index] = { ...chunk.content_block };
    state.nativeBlockChunks.set(chunk.index, {});
  } else if (chunk?.type === "content_block_delta") {
    const delta = chunk.delta;
    const field = delta?.type === "text_delta" ? "text"
      : delta?.type === "thinking_delta" ? "thinking"
        : delta?.type === "signature_delta" ? "signature"
          : delta?.type === "input_json_delta" ? "partial_json" : null;
    const fields = state.nativeBlockChunks.get(chunk.index);
    if (field && fields && typeof delta[field] === "string") (fields[field] ??= []).push(delta[field]);
  } else if (chunk?.type === "message_delta") {
    Object.assign(message, chunk.delta);
    if (chunk.usage) {
      message.usage = {
        ...message.usage, ...chunk.usage,
        ...(chunk.usage.cache_creation ? { cache_creation: { ...message.usage?.cache_creation, ...chunk.usage.cache_creation } } : {}),
      };
    }
  }
  if (!chunk || chunk.type === "message_stop") {
    for (const [index, fields] of state.nativeBlockChunks) {
      const block = message.content[index];
      for (const field of ["text", "thinking", "signature"]) {
        if (fields[field]) block[field] = (block[field] || "") + fields[field].join("");
      }
      if (fields.partial_json) {
        try { block.input = JSON.parse(fields.partial_json.join("")); }
        catch { /* An interrupted tool block has no completed native input object. */ }
      }
    }
    state.nativeBlockChunks.clear();
    message.content = message.content.filter(Boolean);
  }
}

// Convert Claude stream chunk to OpenAI format
export function claudeToOpenAIResponse(chunk, state) {
  if (state.collectNativeResponse) captureNativeClaudeResponse(chunk, state);
  if (!chunk) {
    const results = [];
    flushToolInputSnapshots(state, results);
    return results.length > 0 ? results : null;
  }

  const results = [];
  const event = chunk.type;

  switch (event) {
    case "message_start": {
      state.messageId = chunk.message?.id || `msg_${Date.now()}`;
      state.model = chunk.message?.model;
      state.toolCallIndex = 0;
      // Claude sends input_tokens + cache_read + cache_creation here; message_delta
      // later carries only the final output_tokens. Capture cache now so the
      // delta (output-only) doesn't reset it to zero.
      const startUsage = chunk.message?.usage;
      if (startUsage && typeof startUsage === "object") {
        const creation = getCacheCreationUsage(startUsage);
        setUsageState(state, {
          inputTokens: typeof startUsage.input_tokens === "number" ? startUsage.input_tokens : 0,
          outputTokens: 0,
          cacheReadTokens: typeof startUsage.cache_read_input_tokens === "number" ? startUsage.cache_read_input_tokens : 0,
          cacheCreationTokens: creation?.total || 0,
          cacheCreation5mTokens: creation?.fiveMinute,
          cacheCreation1hTokens: creation?.oneHour,
        });
      }
      results.push(createChunk(state, { role: ROLE.ASSISTANT }));
      break;
    }

    case "content_block_start": {
      const block = chunk.content_block;
      if (block?.type === "server_tool_use") {
        // Built-in tool (web search) - Claude handles internally, skip
        state.serverToolBlockIndex = chunk.index;
        break;
      }
      if (block?.type === CLAUDE_BLOCK.TEXT) {
        state.textBlockStarted = true;
        if (typeof block.text === "string" && block.text) results.push(createChunk(state, { content: block.text }));
      } else if (block?.type === CLAUDE_BLOCK.THINKING) {
        // Track the thinking block internally only. Thinking text flows through
        // reasoning_content (see thinking_delta below) — never inject literal
        // <think>/</think> markers into content: they leak as visible text to
        // any external OpenAI consumer (Claude Code / Zed via a downstream
        // proxy render them verbatim) and displace the thinking block from
        // first position when a downstream proxy rebuilds a Claude message.
        state.inThinkingBlock = true;
        state.currentBlockIndex = chunk.index;
        if (typeof block.thinking === "string" && block.thinking) results.push(createChunk(state, reasoningDelta(block.thinking)));
      } else if (block?.type === CLAUDE_BLOCK.TOOL_USE) {
        const toolCallIndex = state.toolCallIndex++;
        // Restore original tool name from mapping (Claude OAuth)
        const toolName = state.toolNameMap?.get(block.name) || block.name;
        const toolCall = {
          index: toolCallIndex,
          id: block.id,
          type: OPENAI_BLOCK.FUNCTION,
          function: {
            name: toolName,
            arguments: ""
          }
        };
        state.toolCalls.set(chunk.index, {
          index: toolCallIndex,
          inputSnapshot: block.input && Object.keys(block.input).length > 0 ? JSON.stringify(block.input) : null,
          hasInputDeltas: false, snapshotEmitted: false,
        });
        results.push(createChunk(state, { tool_calls: [toolCall] }));
      }
      break;
    }

    case "content_block_delta": {
      // Skip deltas for built-in server tool blocks (web search)
      if (chunk.index === state.serverToolBlockIndex) break;
      const delta = chunk.delta;
      if (delta?.type === "text_delta" && delta.text) {
        results.push(createChunk(state, { content: delta.text }));
      } else if (delta?.type === "thinking_delta" && delta.thinking) {
        results.push(createChunk(state, reasoningDelta(delta.thinking)));
      } else if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
        const toolCall = state.toolCalls.get(chunk.index);
        if (toolCall) {
          if (!delta.partial_json) break;
          toolCall.hasInputDeltas = true;
          results.push(createChunk(state, {
            tool_calls: [{
              index: toolCall.index,
              function: { arguments: delta.partial_json }
            }]
          }));
        }
      }
      break;
    }

    case "content_block_stop": {
      // Skip stop for built-in server tool blocks (web search)
      if (chunk.index === state.serverToolBlockIndex) {
        state.serverToolBlockIndex = -1;
        break;
      }
      flushToolInputSnapshot(state, state.toolCalls.get(chunk.index), results);
      if (state.inThinkingBlock && chunk.index === state.currentBlockIndex) {
        // End of thinking is signaled by state, not by a literal </think> text
        // chunk (see content_block_start above). Consumers that need an explicit
        // "reasoning ended" event (#454) detect the reasoning_content → content
        // transition instead (see openai-responses.js).
        state.inThinkingBlock = false;
      }
      state.textBlockStarted = false;
      state.thinkingBlockStarted = false;
      break;
    }

    case "message_delta": {
      // Extract usage from message_delta event (Claude native format).
      // Anthropic sends input/cache in message_start and only output here, so
      // fall back to cache captured in message_start when the delta omits it.
      if (chunk.usage && typeof chunk.usage === "object") {
        const prev = state.usage || {};
        const creation = getCacheCreationUsage(chunk.usage);
        const previousCreation = getCacheCreationUsage(prev);
        setUsageState(state, {
          inputTokens: typeof chunk.usage.input_tokens === "number" ? chunk.usage.input_tokens : (prev.input_tokens || 0),
          outputTokens: typeof chunk.usage.output_tokens === "number" ? chunk.usage.output_tokens : 0,
          cacheReadTokens: typeof chunk.usage.cache_read_input_tokens === "number" ? chunk.usage.cache_read_input_tokens : (prev.cache_read_input_tokens || 0),
          cacheCreationTokens: Math.max(creation?.total || 0, previousCreation?.total || 0),
          cacheCreation5mTokens: creation?.fiveMinute ?? previousCreation?.fiveMinute,
          cacheCreation1hTokens: creation?.oneHour ?? previousCreation?.oneHour,
        });
      }

      if (chunk.delta?.stop_reason) {
        flushToolInputSnapshots(state, results);
        state.finishReason = convertStopReason(chunk.delta.stop_reason);
        const finalChunk = createChunk(state, {}, state.finishReason);

        if (state.usage) {
          // state.usage already merges cache from message_start with output from message_delta.
          finalChunk.usage = clientUsage(state.usage);
        }

        if (chunk.safeguard_results !== undefined || chunk.delta?.safeguard_results !== undefined) {
          finalChunk.safeguard_results = chunk.safeguard_results || chunk.delta?.safeguard_results;
        }

        results.push(finalChunk);
        state.finishReasonSent = true;
      }
      break;
    }

    case "message_stop": {
      flushToolInputSnapshots(state, results);
      if (!state.finishReasonSent) {
        const finishReason = state.finishReason || (state.toolCalls?.size > 0 ? OPENAI_FINISH.TOOL_CALLS : OPENAI_FINISH.STOP);
        const usageObj = (state.usage && typeof state.usage === "object") ? { usage: clientUsage(state.usage) } : {};
        results.push({ ...createChunk(state, {}, finishReason), ...usageObj });
        state.finishReasonSent = true;
      }
      break;
    }

    case "error": {
      // Mid-stream upstream failure (e.g. overloaded_error, which is HTTP 529
      // in non-streaming). Previously swallowed (no case → null), so the
      // client saw a clean empty stream. Surface it as terminal content + STOP
      // so combo failover and clients can tell failure from empty success.
      const errVal = chunk.error ?? chunk.message ?? "unknown";
      const errStr = typeof errVal === "string" ? errVal : JSON.stringify(errVal);
      results.push(createChunk(state, { content: `\n\n[Claude error: ${errStr}]` }));
      results.push(createChunk(state, {}, OPENAI_FINISH.STOP));
      state.finishReason = OPENAI_FINISH.STOP;
      state.finishReasonSent = true;
      break;
    }

    case "ping": {
      // Keepalive — no client-visible content by design (outbound pings are
      // generated by streamHandler, inbound ones must not leak as text).
      break;
    }
  }

  return results.length > 0 ? results : null;
}

const convertStopReason = (reason) => toOpenAIFinish(reason, "claude");

// Register
register(FORMATS.CLAUDE, FORMATS.OPENAI, null, claudeToOpenAIResponse);

