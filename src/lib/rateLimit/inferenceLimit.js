import { getClientIp } from "@/lib/auth/loginLimiter.js";
import { consume, rateLimitKey, rateLimitHeaders, rateLimitedResponse } from "./v1Limiter.js";

/**
 * Admit one authenticated logical inference request using the same budget as chat.
 * Call after caller authentication, with combo/account retries inside handleRequest.
 * Catalogs, voices and preflight requests must not enter this wrapper.
 *
 * @param {Request} request
 * @param {string|null} apiKey - The caller key already extracted by authentication.
 * @param {() => Response|Promise<Response>} handleRequest
 * @returns {Promise<Response>}
 */
export async function withInferenceLimit(request, apiKey, handleRequest) {
  const rateLimit = consume(apiKey ? rateLimitKey(apiKey) : `ip:${getClientIp(request)}`);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit, { "Access-Control-Allow-Origin": "*" });
  }

  // Do not catch dispatch failures or replace caller cancellation/error semantics.
  const response = await handleRequest();
  if (!(response instanceof Response) || response.bodyUsed) return response;
  try {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(rateLimitHeaders(rateLimit))) headers.set(key, value);
    // Reuse the live body: no reads, clones or tees, including SSE/audio/binary.
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    // Advisory headers must never break an otherwise usable response.
    return response;
  }
}
