import { handleImageGeneration } from "@/sse/handlers/imageGeneration.js";
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

/** POST /v1/images/generations - OpenAI-compatible image generation endpoint */
export async function POST(request) {
  return await handleImageGeneration(request);
}
