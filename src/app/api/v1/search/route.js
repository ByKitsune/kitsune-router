import { handleSearch } from "@/sse/handlers/search.js";
import { API_CORS_HEADERS } from "@/shared/utils/cors.js";

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": API_CORS_HEADERS["Access-Control-Allow-Headers"]
    }
  });
}

/**
 * POST /v1/search - Web search endpoint
 */
export async function POST(request) {
  return await handleSearch(request);
}
