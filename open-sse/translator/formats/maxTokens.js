import { DEFAULT_MAX_TOKENS } from "../../config/runtimeConfig.js";

/** Select the first supplied output cap; modern OpenAI caps take precedence. */
export function readOutputTokenCap(body, fields = ["max_completion_tokens", "max_tokens"], { allowZero = false, sourceFormat = "openai" } = {}) {
  for (const field of fields) {
    const value = body?.[field];
    if (value === undefined || (value === null && sourceFormat === "openai" &&
      ["max_completion_tokens", "max_tokens", "max_output_tokens"].includes(field))) continue;
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
      const error = new Error(`${field} must be a ${allowZero ? "non-negative" : "positive"} integer`);
      error.code = "invalid_output_budget";
      error.param = field;
      throw error;
    }
    return value;
  }
  return undefined;
}

/**
 * Retain explicit output budgets. Tools and reasoning must fit inside the cap,
 * never silently increase it. A missing cap retains the gateway's default;
 * only a known positive ceiling can clamp it down.
 */
export function adjustMaxTokens(body, ceiling = null, options = {}) {
  const maxTokens = readOutputTokenCap(body, undefined, options) ?? DEFAULT_MAX_TOKENS;
  return Number.isSafeInteger(ceiling) && ceiling > 0
    ? Math.min(maxTokens, ceiling)
    : maxTokens;
}

/**
 * Newer OpenAI models (gpt-5+, gpt-6+, o1, o3, o4) reject `max_tokens` on Chat
 * Completions with 400 unsupported_parameter ("Use 'max_completion_tokens'
 * instead"). Same match the GitHub executor applies in its transformRequest
 * (open-sse/executors/github.js).
 * @param {string} model - Outbound provider model id
 * @returns {boolean} true when the request must carry max_completion_tokens
 */
export function requiresMaxCompletionTokens(model) {
  return /gpt-[56]|o[134](?:-|$)/i.test(model);
}
