/**
 * Responses worker entry point. Preserve native input until the selected
 * destination is known; the shared core owns request and response translation.
 */

import { handleChatCore } from "./chatCore.js";
import { FORMATS } from "../translator/formats.js";

/**
 * Handle /v1/responses request
 * @param {object} options
 * @param {object} options.body - Request body (Responses API format)
 * @param {object} options.modelInfo - { provider, model }
 * @param {object} options.credentials - Provider credentials
 * @param {object} options.log - Logger instance (optional)
 * @param {function} options.onCredentialsRefreshed - Callback when credentials are refreshed
 * @param {function} options.onRequestSuccess - Callback when request succeeds
 * @param {function} options.onDisconnect - Callback when client disconnects
 * @param {string} options.connectionId - Connection ID for usage tracking
 * @returns {Promise<{success: boolean, response?: Response, status?: number, error?: string}>}
 */
export function handleResponsesCore(options) {
  return handleChatCore({ ...options, sourceFormatOverride: FORMATS.OPENAI_RESPONSES });
}

