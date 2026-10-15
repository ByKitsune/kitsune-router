import { handleVideoCreate } from "@/sse/handlers/videoGeneration.js";
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

/** POST /v1/videos/edits - async video edit (xAI Grok Imagine) */
export async function POST(request) {
  return await handleVideoCreate(request, "edits");
}
