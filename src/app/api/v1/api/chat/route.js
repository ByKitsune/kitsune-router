import { handleChat } from "@/sse/handlers/chat.js";
import { initTranslators } from "open-sse/translator/index.js";
import { transformToOllama } from "open-sse/utils/ollamaTransform.js";
import { API_CORS_HEADERS } from "@/shared/utils/cors.js";

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

export async function POST(request) {
  await ensureInitialized();
  
  // Authentication, limits and bounded body parsing belong to handleChat.
  // The adapter obtains the resolved model from its mapped JSON/SSE output.
  const response = await handleChat(request);
  return transformToOllama(response);
}
