import { HTTP_STATUS } from "./runtimeConfig.js";

// Cursor CLI 2026.10.16-e3cb207 AgentRunRequest has no verified mappings for
// these controls. RequestedModel.parameters uses provider-defined id/value
// pairs; its existence does not establish OpenAI parameter names or semantics.
export const CURSOR_UNSUPPORTED_GENERATION_PARAMS = [
  "max_tokens", "max_completion_tokens", "max_output_tokens",
  "temperature", "top_p", "top_k",
  "frequency_penalty", "presence_penalty", "repetition_penalty",
  "seed", "stop", "stop_sequences", "n",
];

// Connect protocol error-to-HTTP mapping, not the always-200 streaming status.
// https://connectrpc.com/docs/protocol/#error-codes
export const CURSOR_CONNECT_ERROR_STATUS = {
  invalid_argument: HTTP_STATUS.BAD_REQUEST,
  unauthenticated: HTTP_STATUS.UNAUTHORIZED,
  permission_denied: HTTP_STATUS.FORBIDDEN,
  not_found: HTTP_STATUS.NOT_FOUND,
  resource_exhausted: HTTP_STATUS.RATE_LIMITED,
  unavailable: HTTP_STATUS.SERVICE_UNAVAILABLE,
  deadline_exceeded: HTTP_STATUS.GATEWAY_TIMEOUT,
};
