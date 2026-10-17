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

function errorStatus(error) {
  const explicit = error.status ?? error.status_code ?? error.code;
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
  if (format === FORMATS.CLAUDE) return { type: "error", error: { ...error, type: error.type || "api_error" } };
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
