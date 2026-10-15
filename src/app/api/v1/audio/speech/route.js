import { handleTts } from "@/sse/handlers/tts.js";
import { API_CORS_HEADERS } from "@/shared/utils/cors.js";

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": API_CORS_HEADERS["Access-Control-Allow-Headers"],
    },
  });
}

/** POST /v1/audio/speech - OpenAI-compatible TTS endpoint */
export async function POST(request) {
  return await handleTts(request);
}
