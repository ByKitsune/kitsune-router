import { publicRequestId, redactClientDiagnostic, sanitizeClientError } from "open-sse/utils/clientErrors.js";

const SAFE_UPSTREAM_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function safeUpstreamId(value) {
  return typeof value === "string" && SAFE_UPSTREAM_ID.test(value) && redactClientDiagnostic(value) === value ? value : "";
}

function responseOptions(response, headers) {
  return {
    status: response.status,
    statusText: response.statusText,
    headers,
  };
}

export async function sanitizeErrorResponse(response, serverRequestId = crypto.randomUUID()) {
  serverRequestId = publicRequestId(serverRequestId);
  const headers = new Headers(response.headers);
  headers.set("x-request-id", serverRequestId);
  let source;
  try { source = await response.clone().json(); } catch { source = null; }
  const sourceError = source?.error ?? source ?? {};
  const error = sanitizeClientError(sourceError, { status: response.status, requestId: serverRequestId });
  const upstreamRequestId = safeUpstreamId(sourceError?.upstream_request_id || sourceError?.request_id);
  if (upstreamRequestId && upstreamRequestId !== serverRequestId) error.upstream_request_id = upstreamRequestId;
  headers.delete("content-length");
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(source?.type === "error" ? { type: "error", error } : { error }), responseOptions(response, headers));
}

export async function correlateResponse(response, serverRequestId = crypto.randomUUID()) {
  if (!(response instanceof Response)) return response;
  serverRequestId = publicRequestId(serverRequestId);
  if (response.status >= 400) return sanitizeErrorResponse(response, serverRequestId);
  const headers = new Headers(response.headers);
  headers.set("x-request-id", serverRequestId);
  return new Response(response.body, responseOptions(response, headers));
}
