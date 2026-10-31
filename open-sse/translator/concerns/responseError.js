import { FORMATS } from "../formats.js";
import { toOpenAIUsage } from "./usage.js";
import { ERROR_TYPES } from "../../config/errorConfig.js";

const STATUS_BY_TYPE = new Map();
const STATUS_BY_CODE = new Map();
for (const [status, diagnostic] of Object.entries(ERROR_TYPES)) {
  if (!STATUS_BY_TYPE.has(diagnostic.type)) STATUS_BY_TYPE.set(diagnostic.type, Number(status));
  STATUS_BY_CODE.set(diagnostic.code, Number(status));
}
const REQUEST_ERROR_CODES = new Set(["invalid_request_error", "unsupported_parameter", "invalid_thinking_budget", "invalid_output_budget", "context_length_exceeded"]);

// Anthropic's documented error types differ from the OpenAI-compatible types
// in ERROR_TYPES (notably server_error). Keep this mapping at the client
// serialization boundary so the original failure still drives classification.
// https://platform.claude.com/docs/en/api/errors#http-errors
const CLAUDE_ERROR_BY_STATUS = new Map([
  [400, ERROR_TYPES[400].type],
  [401, ERROR_TYPES[401].type],
  [402, ERROR_TYPES[402].type],
  [403, ERROR_TYPES[403].type],
  [404, "not_found_error"],
  [409, "conflict_error"],
  [413, "request_too_large"],
  [429, ERROR_TYPES[429].type],
  [500, "api_error"],
  [504, "timeout_error"],
  [529, "overloaded_error"],
]);
const CLAUDE_ERROR_TYPES = new Set(CLAUDE_ERROR_BY_STATUS.values());

function errorStatus(error) {
  const raw = error.status ?? error.status_code ?? error.statusCode ?? error.code;
  // Some SSE providers serialize the HTTP status as a string. Accept only
  // three decimal digits; malformed values still use the existing safe fallback.
  const explicit = typeof raw === "string" && /^\d{3}$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  if (Number.isInteger(explicit) && explicit >= 400 && explicit <= 599) return explicit;
  if (REQUEST_ERROR_CODES.has(error.code)) return 400;
  return STATUS_BY_CODE.get(error.code) || STATUS_BY_TYPE.get(error.type) || 502;
}

export function extractResponseError(chunk) {
  const data = chunk?.data && typeof chunk.data === "object" ? chunk.data : chunk;
  if (!data || typeof data !== "object") return null;
  let error = data.error;
  const flat = data.type === "error" && !error;
  if (flat) {
    const { type: _type, sequence_number: _sequence, ...details } = data;
    error = details;
  }
  if (!error && (data.type === "response.failed" || data.response?.status === "failed")) {
    error = data.response?.error || { message: "Upstream response failed without error details", type: "server_error", code: "upstream_error" };
  }
  if (!error) return null;
  error = typeof error === "object" ? error : { message: String(error) };
  return { error, status: errorStatus(error), response: data.response, usage: data.usage, flat };
}

export function responseErrorToClient(format, failure, state) {
  const { error, response } = failure;
  const usage = response?.usage ? toOpenAIUsage(response.usage, "responses") : failure.usage;
  if (format === FORMATS.CLAUDE) {
    const status = Number(failure.status ?? errorStatus(error));
    const type = CLAUDE_ERROR_TYPES.has(error.type) ? error.type
      : CLAUDE_ERROR_BY_STATUS.get(status) || (status >= 400 && status < 500 ? ERROR_TYPES[400].type : "api_error");
    return { type: "error", error: { ...error, type } };
  }
  if (format === FORMATS.OPENAI_RESPONSES || format === FORMATS.CODEX) {
    const nativeUsage = response?.usage || (usage ? {
      input_tokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
      total_tokens: usage.total_tokens ?? (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
      ...(usage.prompt_tokens_details ? { input_tokens_details: usage.prompt_tokens_details } : {}),
      ...(usage.completion_tokens_details ? { output_tokens_details: usage.completion_tokens_details } : {}),
    } : null);
    return { event: "response.failed", data: { type: "response.failed", response: {
      ...response, id: response?.id || state?.responseId || state?.id || `resp_${Date.now()}`,
      status: "failed", error, ...(nativeUsage ? { usage: nativeUsage } : {}),
    } } };
  }
  return { error, ...(usage ? { usage } : {}) };
}
