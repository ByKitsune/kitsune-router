import { BaseExecutor } from "./base.js";
import { PROVIDERS, PROVIDER_OAUTH } from "../config/providers.js";
import { HTTP_STATUS } from "../config/runtimeConfig.js";
import { CURSOR_CONNECT_ERROR_STATUS } from "../config/cursorConstants.js";
import {
  encodeField,
  encodeMcpTools,
  encodeAgentSelectedContext,
  encodeAgentHistoryMessage,
  wrapConnectRPCFrame,
  decodeMcpArgs,
  AGENT_TOOL_PROVIDER,
  validateAgentRequestControls,
  decodeMessage,
  extractTextFromResponse
} from "../utils/cursorProtobuf.js";
import { buildCursorHeaders } from "../utils/cursorChecksum.js";
import { estimateUsage } from "../utils/usageTracking.js";
import { SSE_DONE, SSE_HEADERS } from "../utils/sseConstants.js";
import { chatChunkSse, sseChunk } from "../utils/sse.js";
import { FORMATS } from "../translator/formats.js";
import { ROLE, OPENAI_BLOCK, CLAUDE_BLOCK } from "../translator/schema/index.js";
import { normalizeMediaPart } from "../translator/concerns/multimodal.js";
import { fetchImageAsBase64, parseDataUri } from "../translator/concerns/image.js";
import { cloneRequestBody } from "../utils/requestBody.js";
import { getEnvProxyUrl, resolveConnectionProxyUrl } from "../utils/proxyFetch.js";
import zlib from "zlib";
import crypto from "crypto";

// Detect cloud environment
const isCloudEnv = () => {
  if (typeof caches !== "undefined" && typeof caches === "object") return true;
  if (typeof EdgeRuntime !== "undefined") return true;
  return false;
};

// Lazy import http2 (only in Node.js environment)
let http2 = null;
if (!isCloudEnv()) {
  try {
    http2 = await import("http2");
  } catch {
    // http2 not available
  }
}

const COMPRESS_FLAG = {
  NONE: 0x00,
  GZIP: 0x01,
  TRAILER: 0x02,
  GZIP_TRAILER: 0x03
};

const AGENT_RUN_PATH = "/agent.v1.AgentService/Run";
const PROTOBUF_LEN = 2;
const PROTOBUF_VARINT = 0;

function concatBuffers(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

const agentString = (field, value) => encodeField(field, PROTOBUF_LEN, value);
const agentMessage = (field, value) => encodeField(field, PROTOBUF_LEN, value);
const agentBool = (field, value) => encodeField(field, PROTOBUF_VARINT, value ? 1 : 0);

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === OPENAI_BLOCK.TEXT && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

export function isAgentCapableRequest(body) {
  if (!Array.isArray(body?.messages) || !body.messages.length) return false;
  return body.messages.every((message) => {
    const role = message?.role;
    if (![ROLE.SYSTEM, ROLE.DEVELOPER, ROLE.USER, ROLE.ASSISTANT, ROLE.TOOL].includes(role)) return false;
    const content = message.content;
    if (typeof content === "string") return true;
    if (content == null) return Boolean(message.tool_calls?.length || role === ROLE.TOOL);
    if (!Array.isArray(content)) return false;
    return content.every((part) => {
      if (part?.type === OPENAI_BLOCK.TEXT && typeof part.text === "string") return true;
      if (role === ROLE.ASSISTANT && [CLAUDE_BLOCK.THINKING, CLAUDE_BLOCK.REDACTED_THINKING].includes(part?.type)) return true;
      return (role === ROLE.USER || role === ROLE.TOOL) && normalizeMediaPart(part)?.type === OPENAI_BLOCK.IMAGE_URL;
    });
  });
}

async function resolveAgentImages(body, signal) {
  let resolved = body;
  let fetched = null;
  for (let i = 0; i < body.messages.length; i++) {
    const content = body.messages[i].content;
    if (!Array.isArray(content)) continue;
    for (let j = 0; j < content.length; j++) {
      const media = normalizeMediaPart(content[j]);
      if (media?.type !== OPENAI_BLOCK.IMAGE_URL || parseDataUri(media.image_url.url)) continue;
      const url = media.image_url.url;
      fetched ||= new Map();
      if (!fetched.has(url)) fetched.set(url, await fetchImageAsBase64(url, { signal }));
      if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
      const image = fetched.get(url);
      if (!image) throw new Error("Unable to fetch Cursor image as safe inline image data");
      if (resolved === body) resolved = cloneRequestBody(body);
      resolved.messages[i].content[j] = { ...media, image_url: { ...media.image_url, url: image.url } };
    }
  }
  return resolved;
}

export function buildAgentRunFrame(messages, model, tools = []) {
  const isSystem = (message) => message?.role === ROLE.SYSTEM || message?.role === ROLE.DEVELOPER;
  const system = messages.filter(isSystem).map((message) => textFromContent(message.content)).filter(Boolean).join("\n\n");
  const chatMessages = messages.filter((message) => !isSystem(message));
  const currentIndex = chatMessages.findLastIndex((message) => message?.role === ROLE.USER);
  const current = currentIndex >= 0 ? chatMessages[currentIndex] : null;
  const toolNames = new Map();
  for (const message of chatMessages) {
    for (const call of message.tool_calls || []) toolNames.set(call.id, call.function?.name);
  }
  const encodeHistory = (entries) => entries.length
    ? concatBuffers(...entries.map((message) => agentMessage(1, encodeAgentHistoryMessage(message, toolNames))))
    : null;
  const history = encodeHistory(currentIndex >= 0 ? chatMessages.slice(0, currentIndex) : chatMessages);
  const trailing = currentIndex >= 0 ? encodeHistory(chatMessages.slice(currentIndex + 1)) : null;
  const userText = textFromContent(current?.content);
  const selectedContext = encodeAgentSelectedContext(current?.content);
  // agent.v1.UserMessageAction.user_message and its optional history.
  const userMessage = concatBuffers(
    agentString(1, userText),
    agentString(2, crypto.randomUUID()),
    ...(selectedContext ? [agentMessage(3, selectedContext)] : []),
  );
  // Calls/results following the last real user turn remain trailing history.
  // Client-executed results resume in the next Run, never a fabricated reply.
  const userAction = concatBuffers(
    agentMessage(1, userMessage),
    ...(history ? [agentMessage(7, history)] : []),
    ...(trailing ? [agentMessage(8, trailing)] : []),
  );
  const conversationAction = agentMessage(1, userAction);
  const requestedModel = concatBuffers(agentString(1, model), agentBool(7, true));
  // RunRequest.mcp_tools is only emitted when the client actually declared
  // tools — an empty/absent list keeps the field omitted entirely.
  const mcpTools = tools?.length ? agentMessage(4, encodeMcpTools(tools)) : null;
  const runRequest = concatBuffers(
    // An empty ConversationStateStructure starts a fresh local agent session.
    agentMessage(1, new Uint8Array()),
    agentMessage(2, conversationAction),
    ...(mcpTools ? [mcpTools] : []),
    ...(system ? [agentString(8, system)] : []),
    agentMessage(9, requestedModel),
  );

  // agent.v1.AgentClientMessage.run_request.
  return wrapConnectRPCFrame(agentMessage(1, runRequest));
}

function extractAgentString(message, field) {
  const value = message?.get(field)?.[0]?.value;
  return value ? Buffer.from(value).toString("utf8") : "";
}

function decodeAgentFrames(buffer, onFrame, onEnd) {
  let pending = Buffer.from(buffer || []);
  while (pending.length >= 5) {
    const flags = pending[0];
    const length = pending.readUInt32BE(1);
    if (pending.length < 5 + length) break;
    let payload = pending.subarray(5, 5 + length);
    pending = pending.subarray(5 + length);
    if (flags & COMPRESS_FLAG.GZIP) {
      payload = zlib.gunzipSync(payload);
    }
    if (flags & COMPRESS_FLAG.TRAILER) {
      // Connect EndStreamResponse is JSON even for application/connect+proto.
      // The pinned official SDK treats a missing envelope as LostConnection.
      // https://connectrpc.com/docs/protocol/#error-end-stream
      let terminal;
      try {
        terminal = JSON.parse(payload.toString("utf8"));
      } catch {
        throw Object.assign(new Error("Cursor protocol error: invalid EndStreamResponse JSON"), { code: "protocol_error" });
      }
      if (!terminal || typeof terminal !== "object" || Array.isArray(terminal)) {
        throw Object.assign(new Error("Cursor protocol error: invalid EndStreamResponse"), { code: "protocol_error" });
      }
      onEnd(terminal);
    } else {
      onFrame(payload);
    }
  }
  return pending;
}

function createAgentExecResponse(execRequest, field, payload) {
  const message = concatBuffers(
    ...(execRequest?.has(1) ? [encodeField(1, PROTOBUF_VARINT, execRequest.get(1)[0].value >>> 0)] : []),
    ...(execRequest?.has(15) ? [agentString(15, extractAgentString(execRequest, 15))] : []),
    agentMessage(field, payload),
  );
  return wrapConnectRPCFrame(agentMessage(2, message));
}

function createRequestContextResponse(execRequest) {
  // AgentService asks every run for client context. zenrouter has no IDE file
  // context, so acknowledge with an empty RequestContext.
  const requestContextSuccess = agentMessage(1, new Uint8Array());
  const requestContextResult = agentMessage(1, requestContextSuccess);
  return createAgentExecResponse(execRequest, 10, requestContextResult);
}

const CURSOR_STREAM_DEBUG = process.env.CURSOR_STREAM_DEBUG === "1";
const debugLog = (...args) => {
  if (CURSOR_STREAM_DEBUG) console.log(...args);
};

function isComposerModel(model) {
  const modelId = String(model || "").split("/").pop();
  return /^composer(?:-|$)/i.test(modelId);
}

function visibleComposerContentFromThinking(thinking) {
  if (!thinking) return "";
  const endTag = "</think>";
  const endIdx = thinking.lastIndexOf(endTag);
  if (endIdx < 0) return "";
  return thinking.slice(endIdx + endTag.length).trimStart();
}

function decompressPayload(payload, flags) {
  // Check if payload is JSON error (starts with {"error")
  if (payload.length > 10 && payload[0] === 0x7b && payload[1] === 0x22) {
    try {
      const text = payload.toString("utf-8");
      if (text.startsWith('{"error"')) {
        debugLog(`[DECOMPRESS] Detected JSON error, skipping decompression`);
        return payload;
      }
    } catch {}
  }

  if (
    flags === COMPRESS_FLAG.GZIP ||
    flags === COMPRESS_FLAG.TRAILER ||
    flags === COMPRESS_FLAG.GZIP_TRAILER
  ) {
    // Primary: try gzip decompression (standard gzip header 0x1f 0x8b)
    try {
      return zlib.gunzipSync(payload);
    } catch (gzipErr) {
      // Fallback: TRAILER and GZIP_TRAILER frames sometimes use raw zlib deflate format
      try {
        return zlib.inflateSync(payload);
      } catch (deflateErr) {
        // Last resort: try raw deflate (no zlib header)
        try {
          return zlib.inflateRawSync(payload);
        } catch (rawErr) {
          debugLog(
            `[DECOMPRESS ERROR] flags=${flags}, payloadSize=${payload.length}, gzip=${gzipErr.message}, deflate=${deflateErr.message}, raw=${rawErr.message}`
          );
          debugLog(
            `[DECOMPRESS ERROR] First 50 bytes (hex):`,
            payload.slice(0, 50).toString("hex")
          );
          return payload;
        }
      }
    }
  }
  return payload;
}

// Read one cursor protobuf frame: header + bounds + decompress. Returns status + payload + new offset.
function readCursorFrame(buffer, offset, frameNum, tag) {
  if (offset + 5 > buffer.length) {
    debugLog(`[CURSOR BUFFER${tag}] Reached end, offset=${offset}, remaining=${buffer.length - offset}`);
    return { status: "done" };
  }

  const flags = buffer[offset];
  const length = buffer.readUInt32BE(offset + 1);
  debugLog(`[CURSOR BUFFER${tag}] Frame ${frameNum + 1}: flags=0x${flags.toString(16).padStart(2, "0")}, length=${length}`);

  if (offset + 5 + length > buffer.length) {
    debugLog(`[CURSOR BUFFER${tag}] Incomplete frame, offset=${offset}, length=${length}, buffer.length=${buffer.length}`);
    return { status: "done" };
  }

  let payload = buffer.slice(offset + 5, offset + 5 + length);
  const newOffset = offset + 5 + length;
  payload = decompressPayload(payload, flags);
  if (!payload) {
    debugLog(`[CURSOR BUFFER${tag}] Frame ${frameNum + 1}: decompression failed, skipping`);
    return { status: "skip", offset: newOffset };
  }
  return { status: "ok", payload, offset: newOffset };
}

function createErrorResponse(jsonError) {
  const errorMsg = jsonError?.error?.details?.[0]?.debug?.details?.title
    || jsonError?.error?.details?.[0]?.debug?.details?.detail
    || jsonError?.error?.message
    || "API Error";
  
  const isRateLimit = jsonError?.error?.code === "resource_exhausted";
  
  return new Response(JSON.stringify({
    error: {
      message: errorMsg,
      type: isRateLimit ? "rate_limit_error" : "api_error",
      code: jsonError?.error?.details?.[0]?.debug?.error || "unknown"
    }
  }), {
    status: isRateLimit ? HTTP_STATUS.RATE_LIMITED : HTTP_STATUS.BAD_REQUEST,
    headers: { "Content-Type": "application/json" }
  });
}

export class CursorExecutor extends BaseExecutor {
  constructor() {
    super("cursor", PROVIDERS.cursor);
  }

  buildUrl() {
    const endpoint = PROVIDER_OAUTH.cursor?.agentEndpoint;
    if (!endpoint) throw new Error("Cursor AgentService endpoint is not configured");
    return `${endpoint}${AGENT_RUN_PATH}`;
  }

  buildHeaders(credentials) {
    const accessToken = credentials.accessToken;
    const machineId = credentials.providerSpecificData?.machineId;
    const ghostMode = credentials.providerSpecificData?.ghostMode !== false;

    if (!machineId) {
      throw new Error("Machine ID is required for Cursor API");
    }

    return buildCursorHeaders(accessToken, machineId, ghostMode);
  }

  /**
   * AgentService (agent.api5.cursor.sh) is HTTP/2-only. Node's fetch/undici speaks
   * HTTP/1.1 and fails with HTTPParserError on the h2 preface — use http2 duplex.
   */
  openAgentHttp2Stream(url, headers, signal) {
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    if (!http2) {
      throw new Error("HTTP/2 is required for Cursor AgentService (endpoint is h2-only)");
    }

    const urlObj = new URL(url);
    const client = http2.connect(urlObj.origin);
    const chunkQueue = [];
    let waiting = null;
    let ended = false;
    let closed = false;
    let streamError = null;
    let req = null;
    let settleHeaders = null;

    const wake = (result) => {
      if (!waiting) return;
      const resolve = waiting;
      waiting = null;
      resolve(result);
    };

    const close = () => {
      if (closed) return;
      closed = true;
      signal?.removeEventListener("abort", onAbort);
      req?.off("response", onResponse);
      settleHeaders?.(new Error("Cursor AgentService connection closed before response headers"));
      ended = true;
      wake({ value: undefined, done: true });
      try { req?.destroy(); } catch {}
      try { client.destroy(); } catch {}
    };

    const fail = (error) => {
      if (closed) return;
      streamError = error;
      settleHeaders?.(error);
      close();
    };
    const onAbort = () => fail(new DOMException("Request aborted", "AbortError"));
    const onResponse = (hdrs) => settleHeaders?.(null, hdrs);
    const onClose = () => {
      if (!ended) fail(new Error("Cursor AgentService stream closed unexpectedly"));
      else close();
    };

    client.on("error", fail);
    client.once("close", onClose);

    try {
      req = client.request({
        ":method": "POST",
        ":path": urlObj.pathname,
        ":authority": urlObj.host,
        ":scheme": urlObj.protocol.slice(0, -1),
        ...headers,
      });
    } catch (error) {
      close();
      throw error;
    }

    const responseHeaders = new Promise((resolve, reject) => {
      settleHeaders = (error, hdrs) => {
        settleHeaders = null;
        req.off("response", onResponse);
        if (error) reject(error);
        else resolve(hdrs);
      };
      req.once("response", onResponse);
    });

    req.on("error", fail);
    req.once("close", onClose);
    req.on("data", (chunk) => {
      if (waiting) wake({ value: chunk, done: false });
      else chunkQueue.push(chunk);
    });
    req.once("end", () => {
      if (settleHeaders) {
        fail(new Error("Cursor AgentService stream ended before response headers"));
        return;
      }
      ended = true;
      wake({ value: undefined, done: true });
    });

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    }

    return {
      responseHeaders,
      write(frame) {
        if (req && !req.destroyed) req.write(frame);
      },
      end() {
        try { if (req && !req.destroyed) req.end(); } catch {}
      },
      close,
      async read() {
        if (chunkQueue.length) return { value: chunkQueue.shift(), done: false };
        if (ended) {
          if (streamError) throw streamError;
          return { value: undefined, done: true };
        }
        const result = await new Promise((resolve) => { waiting = resolve; });
        if (streamError) throw streamError;
        return result || { value: undefined, done: true };
      },
    };
  }

  async executeAgent({ model, body, stream, credentials, signal, proxyOptions = null }) {
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    validateAgentRequestControls(body);
    const tools = body.tool_choice === "none" ? [] : body.tools || [];
    const url = this.buildUrl();
    const relay = typeof proxyOptions?.vercelRelayUrl === "string" && proxyOptions.vercelRelayUrl.trim();
    if (relay || resolveConnectionProxyUrl(url, proxyOptions) || getEnvProxyUrl(url) || proxyOptions?.strictProxy === true) {
      throw new Error("Cursor native HTTP/2 cannot honor the required proxy or relay policy; no direct connection was opened");
    }
    const headers = this.buildHeaders(credentials);
    const preparedBody = await resolveAgentImages(body, signal);
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    const runFrame = buildAgentRunFrame(preparedBody.messages || [], model, tools);
    const requestController = new AbortController();
    const requestSignal = signal ? AbortSignal.any([signal, requestController.signal]) : requestController.signal;

    let session;
    try {
      session = this.openAgentHttp2Stream(url, headers, requestSignal);
      session.write(runFrame);
    } catch (error) {
      session?.close();
      if (error.name === "AbortError") throw error;
      throw new Error(`Cursor AgentService request failed: ${error.message}`);
    }

    let responseHeaders;
    try {
      responseHeaders = await session.responseHeaders;
    } catch (error) {
      session.close();
      if (error.name === "AbortError") throw error;
      throw new Error(`Cursor AgentService request failed: ${error.message}`);
    }

    const status = Number(responseHeaders[":status"] || 0);
    if (status !== 200) {
      let errorText = "";
      try {
        while (true) {
          const { done, value } = await session.read();
          if (done) break;
          errorText += Buffer.from(value).toString("utf8");
        }
      } catch {}
      session.close();
      return {
        response: new Response(JSON.stringify({
          error: { message: `Cursor AgentService ${status}: ${errorText || "request failed"}`, type: "api_error" },
        }), { status: status || HTTP_STATUS.SERVER_ERROR, headers: { "Content-Type": "application/json" } }),
        url,
        headers,
        transformedBody: body,
        responseFormat: FORMATS.OPENAI,
      };
    }

    // The Claude SSE translator derives Anthropic's message ID by stripping
    // `chatcmpl-`. Keep the remaining ID in Anthropic's required `msg_` form
    // so strict clients such as Claude Code accept the completed stream.
    const responseId = `chatcmpl-msg_${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    let pending = Buffer.alloc(0);
    let finished = false;
    let endStreamReceived = false;
    const toolCalls = [];
    const toolCallIds = new Map();
    const declaredToolNames = new Set(tools.map((tool) => tool.function?.name || tool.name));
    let expectedToolCalls = null;
    const finishTools = (onEvent) => {
      if (finished || !toolCalls.length) return;
      finished = true;
      onEvent({ type: "done", finishReason: "tool_calls" });
    };

    const consume = async (onEvent) => {
      try {
        while (!finished) {
          const { done, value } = await session.read();
          if (done) break;
          pending = Buffer.concat([pending, Buffer.from(value)]);
          pending = decodeAgentFrames(pending, (payload) => {
            // A single read can carry several frames; once the turn is over the
            // rest of the batch must not reach the already-closed controller.
            if (finished) return;
            if (endStreamReceived) throw Object.assign(new Error("Cursor protocol error: data after EndStreamResponse"), { code: "protocol_error" });
            const serverMessage = decodeMessage(payload);

            // agent.v1.AgentServerMessage.interaction_update
            if (serverMessage.has(1)) {
              const update = decodeMessage(serverMessage.get(1)[0].value);
              if (update.has(1)) {
                const textDelta = extractAgentString(decodeMessage(update.get(1)[0].value), 1);
                if (textDelta) onEvent({ type: "text", value: textDelta });
              }
              if (update.has(27)) {
                const listed = decodeMessage(update.get(27)[0].value);
                expectedToolCalls = listed.get(1)?.[0]?.value ?? null;
              }
              // Cursor's AgentService emits internal reasoning without the
              // cryptographic signature required by Anthropic thinking blocks.
              // Forwarding it makes strict Anthropic clients (Claude Code)
              // discard or wait on an otherwise complete response. Keep the
              // reasoning upstream-only and emit the normal answer text.
              if (update.has(14)) {
                if (expectedToolCalls != null && toolCalls.length && toolCalls.length < expectedToolCalls) {
                  throw new Error("Cursor ended an incomplete MCP tool-call batch");
                }
              }
            }

            // AgentService requests IDE context before producing a response.
            // Return an empty context; zenrouter is not coupled to an editor.
            if (serverMessage.has(2)) {
              const execRequest = decodeMessage(serverMessage.get(2)[0].value);
              if (execRequest.has(10)) {
                session.write(createRequestContextResponse(execRequest));
              } else if (execRequest.has(42)) {
                const args = decodeMessage(execRequest.get(42)[0].value);
                const provider = extractAgentString(args, 1);
                const name = extractAgentString(args, 2);
                const allowlisted = provider === AGENT_TOOL_PROVIDER && declaredToolNames.has(name);
                session.write(createAgentExecResponse(execRequest, 42, agentBool(1, allowlisted)));
              } else if (execRequest.has(11)) {
                const call = decodeMcpArgs(execRequest.get(11)[0].value);
                const name = declaredToolNames.has(call.toolName) ? call.toolName : call.name;
                if (!call.toolCallId || !declaredToolNames.has(name) || call.providerIdentifier && call.providerIdentifier !== AGENT_TOOL_PROVIDER) {
                  finished = true;
                  onEvent({ type: "error", value: "Cursor AgentService requested an unsupported IDE tool or malformed MCP call" });
                } else {
                  const toolCall = { id: call.toolCallId, type: OPENAI_BLOCK.FUNCTION, function: { name, arguments: JSON.stringify(call.args) } };
                  const previous = toolCallIds.get(call.toolCallId);
                  if (previous && (previous.function.name !== name || previous.function.arguments !== toolCall.function.arguments)) {
                    throw new Error("Cursor reused a tool-call ID with conflicting arguments");
                  }
                  if (!previous) {
                    toolCallIds.set(call.toolCallId, toolCall);
                    toolCalls.push(toolCall);
                    onEvent({ type: "tool_call", value: toolCall, index: toolCalls.length - 1 });
                  }
                }
              } else {
                // Every other ExecServerMessage variant is an editor-backed tool
                // (shell, read, write, …) that zenrouter cannot service. Fail the
                // turn rather than narrating protocol state as assistant text.
                debugLog(`[CURSOR AGENT] Unsupported exec request fields: ${[...execRequest.keys()].join(",")}`);
                finished = true;
                onEvent({ type: "error", value: "Cursor AgentService requested an unsupported IDE tool" });
              }
            }
          }, (terminal) => {
            if (finished) return;
            if (endStreamReceived) throw Object.assign(new Error("Cursor protocol error: duplicate EndStreamResponse"), { code: "protocol_error" });
            endStreamReceived = true;
            if (Object.hasOwn(terminal, "error")) {
              const error = terminal.error;
              if (!error || typeof error !== "object" || typeof error.code !== "string" || !error.code || error.message !== undefined && typeof error.message !== "string") {
                throw Object.assign(new Error("Cursor protocol error: invalid EndStreamResponse error"), { code: "protocol_error" });
              }
              throw Object.assign(new Error(error.message || `Cursor AgentService returned ${error.code}`), {
                code: error.code,
                status: Object.hasOwn(CURSOR_CONNECT_ERROR_STATUS, error.code) ? CURSOR_CONNECT_ERROR_STATUS[error.code] : HTTP_STATUS.BAD_GATEWAY,
              });
            }
          });
          if (endStreamReceived && !finished) {
            if (pending.length) throw Object.assign(new Error("Cursor protocol error: data after EndStreamResponse"), { code: "protocol_error" });
            if (expectedToolCalls != null && toolCalls.length && toolCalls.length < expectedToolCalls) throw new Error("Cursor ended an incomplete MCP tool-call batch");
            finished = true;
            onEvent({ type: "done", finishReason: toolCalls.length ? "tool_calls" : "stop" });
          } else if (toolCalls.length && (expectedToolCalls == null || toolCalls.length >= expectedToolCalls)) {
            // Deliberate client-tool handoff cancels the run while the server
            // awaits real client results; no EndStreamResponse is expected.
            finishTools(onEvent);
          }
        }
        if (!finished) {
          const message = pending.length ? "Cursor protocol error: truncated protobuf frame" : "Cursor protocol error: missing EndStreamResponse (unexpected EOF)";
          throw Object.assign(new Error(message), { code: "protocol_error" });
        }
      } catch (error) {
        if (!finished) {
          finished = true;
          onEvent({ type: "error", value: error.message, code: error.code || "connection_error", status: error.status || HTTP_STATUS.BAD_GATEWAY });
        }
      } finally {
        try { session.end(); } catch {}
        try { session.close(); } catch {}
      }
    };

    if (stream === false) {
      const contentChunks = [];
      const reasoningChunks = [];
      let agentError = null;
      await consume((event) => {
        if (event.type === "text") contentChunks.push(event.value);
        else if (event.type === "thinking") reasoningChunks.push(event.value);
        else if (event.type === "error") agentError = event;
      });
      const content = contentChunks.join("");
      const reasoning = reasoningChunks.join("");
      if (agentError) {
        return {
          response: new Response(JSON.stringify({ error: { message: agentError.value, type: "api_error", ...(agentError.code ? { code: agentError.code } : {}) } }), {
            status: agentError.status || HTTP_STATUS.BAD_REQUEST,
            headers: { "Content-Type": "application/json" },
          }),
          url,
          headers,
          transformedBody: body,
          responseFormat: FORMATS.OPENAI,
        };
      }
      return {
        response: new Response(JSON.stringify({
          id: responseId,
          object: "chat.completion",
          created,
          model,
          choices: [{ index: 0, message: { role: ROLE.ASSISTANT, content: content || null, ...(reasoning ? { reasoning_content: reasoning } : {}), ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, finish_reason: toolCalls.length ? "tool_calls" : "stop" }],
          usage: estimateUsage(body, content.length + toolCalls.reduce((total, call) => total + call.function.arguments.length, 0), FORMATS.OPENAI),
        }), { headers: { "Content-Type": "application/json" } }),
        url,
        headers,
        transformedBody: body,
        responseFormat: FORMATS.OPENAI,
      };
    }

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      start(controller) {
        consume((event) => {
          if (event.type === "text") {
            controller.enqueue(encoder.encode(chatChunkSse({ id: responseId, created, model, delta: { content: event.value } })));
          } else if (event.type === "thinking") {
            controller.enqueue(encoder.encode(chatChunkSse({ id: responseId, created, model, delta: { reasoning_content: event.value } })));
          } else if (event.type === "tool_call") {
            controller.enqueue(encoder.encode(chatChunkSse({ id: responseId, created, model, delta: { tool_calls: [{ index: event.index, ...event.value }] } })));
          } else if (event.type === "error") {
            // An SSE error frame, not a content delta: a protocol failure must not
            // be rendered to the user as the assistant's reply, and downstream
            // usage tracking must not record the turn as a success.
            controller.enqueue(encoder.encode(sseChunk({ error: { message: event.value, type: "api_error", ...(event.code ? { code: event.code } : {}) } })));
            controller.enqueue(encoder.encode(SSE_DONE));
            controller.close();
          } else if (event.type === "done") {
            controller.enqueue(encoder.encode(chatChunkSse({ id: responseId, created, model, delta: {}, finishReason: event.finishReason || "stop" })));
            controller.enqueue(encoder.encode(SSE_DONE));
            controller.close();
          }
        }).catch((error) => controller.error(error));
      },
      cancel() {
        requestController.abort();
      },
    });

    return {
      response: new Response(responseStream, { headers: SSE_HEADERS }),
      url,
      headers,
      transformedBody: body,
      responseFormat: FORMATS.OPENAI,
    };
  }

  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null }) {
    if (isAgentCapableRequest(body)) {
      try {
        return await this.executeAgent({ model, body, stream, credentials, signal, proxyOptions });
      } catch (error) {
        if (error.name === "AbortError") throw error;
        return {
          response: new Response(JSON.stringify({
            error: { message: error.message, type: error.code === "unsupported_parameter" ? "invalid_request_error" : "connection_error", code: error.code || "", ...(error.param ? { param: error.param } : {}) },
          }), { status: error.code === "unsupported_parameter" ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.SERVER_ERROR, headers: { "Content-Type": "application/json" } }),
          url: `${PROVIDER_OAUTH.cursor?.agentEndpoint || ""}${AGENT_RUN_PATH}`,
          headers: {},
          transformedBody: body,
        };
      }
    }

    return {
      response: Response.json({ error: { message: "Cursor AgentService cannot represent this request's roles or content blocks", type: "invalid_request_error" } }, { status: HTTP_STATUS.BAD_REQUEST }),
      url: `${PROVIDER_OAUTH.cursor?.agentEndpoint || ""}${AGENT_RUN_PATH}`,
      headers: {},
      transformedBody: body,
    };
  }

  transformProtobufToJSON(buffer, model, body) {
    const responseId = `chatcmpl-cursor-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);

    let offset = 0;
    let totalContent = "";
    let totalThinking = "";
    const toolCalls = [];
    const toolCallsMap = new Map(); // Track streaming tool calls by ID
    const finalizedIds = new Set();
    let frameCount = 0;

    debugLog(`[CURSOR BUFFER] Total length: ${buffer.length} bytes`);

    while (offset < buffer.length) {
      const frame = readCursorFrame(buffer, offset, frameCount, "");
      if (frame.status === "done") break;
      offset = frame.offset;
      frameCount++;
      if (frame.status === "skip") continue;
      const payload = frame.payload;

      // Check for JSON error frames (byte guard: skip toString on non-JSON frames)
      if (payload.length > 0 && payload[0] === 0x7b) {
        try {
          const text = payload.toString("utf-8");
          if (text.includes('"error"')) {
            const hasContent = totalContent || toolCallsMap.size > 0;
            debugLog(
              `[CURSOR BUFFER] Error frame (hasContent=${hasContent}): ${text.slice(0, 500)}`
            );
            if (hasContent) {
              break;
            }
            return createErrorResponse(JSON.parse(text));
          }
        } catch {}
      }

      const result = extractTextFromResponse(new Uint8Array(payload));
      debugLog(`[CURSOR DECODED] Frame ${frameCount}:`, result);

      if (result.error) {
        const hasContent = totalContent || toolCallsMap.size > 0;
        debugLog(`[CURSOR BUFFER] Decoded error (hasContent=${hasContent}): ${result.error}`);
        if (hasContent) {
          break;
        }
        return new Response(
          JSON.stringify({
            error: {
              message: result.error,
              type: "rate_limit_error",
              code: "rate_limited"
            }
          }),
          {
            status: HTTP_STATUS.RATE_LIMITED,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      if (result.toolCall) {
        const tc = result.toolCall;

        if (toolCallsMap.has(tc.id)) {
          // Accumulate arguments for existing tool call
          const existing = toolCallsMap.get(tc.id);
          existing.function.arguments += tc.function.arguments;
          existing.isLast = tc.isLast;
        } else {
          // New tool call
          toolCallsMap.set(tc.id, { ...tc });
        }

        // Push to final array when isLast is true
        if (tc.isLast) {
          const finalToolCall = toolCallsMap.get(tc.id);
          finalizedIds.add(tc.id);
          toolCalls.push({
            id: finalToolCall.id,
            type: finalToolCall.type,
            function: {
              name: finalToolCall.function.name,
              arguments: finalToolCall.function.arguments
            }
          });
        }
      }

      if (result.text) totalContent += result.text;
      if (result.thinking) totalThinking += result.thinking;
    }

    const visibleComposerContent = isComposerModel(model)
      ? visibleComposerContentFromThinking(totalThinking)
      : "";
    const finalContent = totalContent || visibleComposerContent;

    debugLog(
      `[CURSOR BUFFER] Parsed ${frameCount} frames, toolCallsMap size: ${toolCallsMap.size}, finalized toolCalls: ${toolCalls.length}`
    );

    // Finalize all remaining tool calls in map (in case stream ended without isLast=true)
    for (const [id, tc] of toolCallsMap.entries()) {
      // Check if already in final array
      if (!finalizedIds.has(id)) {
        debugLog(`[CURSOR BUFFER] Finalizing incomplete tool call: ${id}, isLast=${tc.isLast}`);
        toolCalls.push({
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments
          }
        });
      }
    }

    debugLog(`[CURSOR BUFFER] Final toolCalls count: ${toolCalls.length}`);


    const message = {
      role: "assistant",
      content: finalContent || null
    };

    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls;
    }

    const usage = estimateUsage(body, finalContent.length, FORMATS.OPENAI);

    const completion = {
      id: responseId,
      object: "chat.completion",
      created,
      model,
      choices: [{
        index: 0,
        message,
        finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop"
      }],
      usage
    };

    return new Response(JSON.stringify(completion), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  transformProtobufToSSE(buffer, model, body) {
    const responseId = `chatcmpl-cursor-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);

    const chunks = [];
    let offset = 0;
    let totalContent = "";
    let totalThinking = "";
    let emittedComposerThinkingContentLength = 0;
    const toolCalls = [];
    const toolCallsMap = new Map(); // Track streaming tool calls by ID
    const finalizedIds = new Set();
    const emittedToolCallIds = new Set();
    let frameCount = 0;

    debugLog(`[CURSOR BUFFER SSE] Total length: ${buffer.length} bytes`);

    while (offset < buffer.length) {
      const frame = readCursorFrame(buffer, offset, frameCount, " SSE");
      if (frame.status === "done") break;
      offset = frame.offset;
      frameCount++;
      if (frame.status === "skip") continue;
      const payload = frame.payload;

      // Check for JSON error frames (byte-guard: only decode if starts with '{')
      if (payload[0] === 0x7b) {
        try {
          const text = payload.toString("utf-8");
          if (text.includes('"error"')) {
            const hasContent = chunks.length > 0 || totalContent || toolCallsMap.size > 0;
            debugLog(
              `[CURSOR BUFFER SSE] Error frame (hasContent=${hasContent}): ${text.slice(0, 500)}`
            );
            if (hasContent) {
              break;
            }
            return createErrorResponse(JSON.parse(text));
          }
        } catch {}
      }

      const result = extractTextFromResponse(new Uint8Array(payload));
      debugLog(`[CURSOR DECODED SSE] Frame ${frameCount}:`, result);

      if (result.error) {
        const hasContent = chunks.length > 0 || totalContent || toolCallsMap.size > 0;
        debugLog(`[CURSOR BUFFER SSE] Decoded error (hasContent=${hasContent}): ${result.error}`);
        if (hasContent) {
          break;
        }
        return new Response(
          JSON.stringify({
            error: {
              message: result.error,
              type: "rate_limit_error",
              code: "rate_limited"
            }
          }),
          {
            status: HTTP_STATUS.RATE_LIMITED,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      if (result.toolCall) {
        const tc = result.toolCall;

        if (chunks.length === 0) {
          chunks.push(chatChunkSse({ id: responseId, created, model, delta: { role: "assistant", content: "" } }));
        }

        if (toolCallsMap.has(tc.id)) {
          // Accumulate arguments for existing tool call
          const existing = toolCallsMap.get(tc.id);
          const oldArgsLen = existing.function.arguments.length;
          existing.function.arguments += tc.function.arguments;
          existing.isLast = tc.isLast;

          // Stream the delta arguments
          if (tc.function.arguments) {
            emittedToolCallIds.add(tc.id);
            chunks.push(chatChunkSse({
              id: responseId, created, model,
              delta: {
                tool_calls: [
                  {
                    index: existing.index,
                    id: tc.id,
                    type: "function",
                    function: {
                      name: tc.function.name,
                      arguments: tc.function.arguments
                    }
                  }
                ]
              }
            }));
          }
        } else {
          // New tool call - assign index and add to map
          const toolCallIndex = toolCalls.length;
          finalizedIds.add(tc.id);
          toolCalls.push({ ...tc, index: toolCallIndex });
          toolCallsMap.set(tc.id, { ...tc, index: toolCallIndex });

          // Stream initial tool call with name
          emittedToolCallIds.add(tc.id);
          chunks.push(chatChunkSse({
            id: responseId, created, model,
            delta: {
              tool_calls: [
                {
                  index: toolCallIndex,
                  id: tc.id,
                  type: "function",
                  function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments
                  }
                }
              ]
            }
          }));
        }
      }

      if (result.text) {
        totalContent += result.text;
        chunks.push(chatChunkSse({
          id: responseId, created, model,
          delta:
            chunks.length === 0 && toolCalls.length === 0
              ? { role: "assistant", content: result.text }
              : { content: result.text }
        }));
      }

      if (isComposerModel(model) && result.thinking) {
        totalThinking += result.thinking;
        const visibleContent = visibleComposerContentFromThinking(totalThinking);
        if (visibleContent.length > emittedComposerThinkingContentLength) {
          const deltaContent = visibleContent.slice(emittedComposerThinkingContentLength);
          emittedComposerThinkingContentLength = visibleContent.length;
          totalContent += deltaContent;
          chunks.push(chatChunkSse({
            id: responseId, created, model,
            delta:
              chunks.length === 0 && toolCalls.length === 0
                ? { role: "assistant", content: deltaContent }
                : { content: deltaContent }
          }));
        }
      }
    }

    debugLog(
      `[CURSOR BUFFER SSE] Parsed ${frameCount} frames, toolCallsMap size: ${toolCallsMap.size}, toolCalls array: ${toolCalls.length}`
    );

    // Finalize all remaining tool calls in map (stream may have ended without isLast=true)
    for (const [id, tc] of toolCallsMap.entries()) {
      if (!finalizedIds.has(id)) {
        debugLog(`[CURSOR BUFFER SSE] Finalizing incomplete tool call: ${id}, isLast=${tc.isLast}`);
        const toolCallIndex = toolCalls.length;
        toolCalls.push({
          id: tc.id,
          type: tc.type,
          index: toolCallIndex,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments
          }
        });

        // Emit SSE chunk for the finalized tool call if not already emitted
        if (!emittedToolCallIds.has(tc.id)) {
          chunks.push(chatChunkSse({
            id: responseId, created, model,
            delta: {
              tool_calls: [
                {
                  index: toolCallIndex,
                  id: tc.id,
                  type: "function",
                  function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments
                  }
                }
              ]
            }
          }));
        }
      }
    }

    if (chunks.length === 0 && toolCalls.length === 0) {
      chunks.push(chatChunkSse({ id: responseId, created, model, delta: { role: "assistant", content: "" } }));
    }

    const usage = estimateUsage(body, totalContent.length, FORMATS.OPENAI);

    chunks.push(
      `data: ${JSON.stringify({
        id: responseId,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop"
          }
        ],
        usage
      })}\n\n`
    );
    chunks.push(SSE_DONE);

    return new Response(chunks.join(""), {
      status: 200,
      headers: { ...SSE_HEADERS }
    });
  }

  async refreshCredentials() {
    return null;
  }
}

export default CursorExecutor;
