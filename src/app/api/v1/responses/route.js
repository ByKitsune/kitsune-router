import { handleChat } from "@/sse/handlers/chat.js";
import { correlateResponse, sanitizeErrorResponse } from "@/sse/utils/requestCorrelation.js";
import { initTranslators } from "open-sse/translator/index.js";
import * as log from "@/sse/utils/logger.js";
import { API_CORS_HEADERS } from "@/shared/utils/cors.js";

export { sanitizeErrorResponse };

let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": API_CORS_HEADERS["Access-Control-Allow-Headers"]
    }
  });
}

/**
 * POST /v1/responses - OpenAI Responses API format
 * Now handled by translator pattern (openai-responses format auto-detected)
 */
export async function POST(request) {
  const serverRequestId = crypto.randomUUID();
  try {
    await ensureInitialized();
    return await handleChat(request, null, serverRequestId);
  } catch (error) {
    // Same reasoning as src/sse/handlers/chat.js: a bare `catch {}` hid every
    // unexpected failure behind a generic 500 while still handing the client a
    // serverRequestId that appeared nowhere in the logs. errorLine() is always
    // printed regardless of LOG_LEVEL. Identity + stack only; no prompt or
    // response content.
    const detail = `${error?.name || "Error"}: ${error?.message || error}`;
    if (log.errorLine) log.errorLine("RESPONSES", "❌", `[${serverRequestId}] unhandled failure: ${detail}`);
    if (error?.stack) console.error(`[${serverRequestId}] ${error.stack}`);
    return correlateResponse(new Response(JSON.stringify({ error: { message: "Responses request failed", type: "server_error", code: "internal_server_error" } }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    }), serverRequestId);
  }
}
