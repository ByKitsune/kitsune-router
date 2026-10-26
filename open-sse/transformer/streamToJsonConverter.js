import { getResponseServiceTier } from "../providers/serviceTiers.js";
import { consumeSSEStream, parseSSEEvent, streamEventPayload, isValidStreamIndex, SSE_LIMITS, SSE_COMPLETION_GRACE_MS } from "../utils/sse.js";
import { extractResponseError } from "../translator/concerns/responseError.js";

const EMPTY_USAGE = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

export async function convertResponsesStreamToJson(stream, { signal } = {}) {
  let response = { id: `resp_${Date.now()}`, object: "response", created_at: Math.floor(Date.now() / 1000), status: "in_progress" };
  let usage = null;
  let serviceTier;
  let terminal = false;
  let completionDeadline = null;
  let failure = null;
  let items = new Map();
  const fail = (message, error = null) => {
    failure ||= error || { type: "stream_error", code: "stream_disconnected", message };
    response.status = "failed";
  };
  const processEvent = event => {
    const parsed = streamEventPayload(event, parseSSEEvent(event));
    if (event.data.trim() === "[DONE]") {
      if (!terminal) fail("Responses stream closed before a terminal event");
      return false;
    }
    const type = event.event || parsed.type;
    serviceTier = getResponseServiceTier(parsed) ?? serviceTier;
    const error = extractResponseError(parsed);
    if (parsed.response && typeof parsed.response === "object") {
      const snapshot = parsed.response;
      response = { ...response, ...snapshot };
      if (snapshot.usage) usage = snapshot.usage;
      if (Array.isArray(snapshot.output)) {
        if (snapshot.output.length > SSE_LIMITS.outputItems) throw new RangeError("Upstream Responses output exceeds limit");
        items = new Map(snapshot.output.map((item, index) => [index, item]));
      }
    }
    if (parsed.usage) usage = parsed.usage;
    if (error) { fail("Upstream Responses stream failed", error.error); return false; }
    for (const field of ["output_index", "content_index", "summary_index"]) {
      if (parsed[field] !== undefined && !isValidStreamIndex(parsed[field])) throw new RangeError("Invalid upstream Responses output index");
    }
    if (type === "response.output_item.done") items.set(parsed.output_index ?? 0, parsed.item);
    if (["response.completed", "response.done", "response.incomplete"].includes(type)) {
      terminal = true;
      response.status = type === "response.incomplete" ? "incomplete" : "completed";
      if (parsed.response?.usage) return false;
      completionDeadline ??= Date.now() + SSE_COMPLETION_GRACE_MS;
    }
    if (terminal && (parsed.usage || parsed.response?.usage)) return false;
    return true;
  };
  if (!stream?.getReader) fail("Missing upstream Responses stream");
  else {
    try {
      await consumeSSEStream(stream, processEvent, { signal, deadline: () => completionDeadline });
      if (!terminal && !failure) fail("Responses stream closed before a terminal event");
    } catch (error) {
      if (signal?.aborted) throw signal.reason || error;
      fail(error instanceof RangeError ? error.message : "Invalid upstream Responses stream");
    }
  }
  return {
    ...response, status: failure ? "failed" : response.status,
    ...(failure ? { error: failure } : {}),
    ...(serviceTier ? { service_tier: serviceTier } : {}),
    output: [...items.entries()].sort((left, right) => left[0] - right[0]).map(([, item]) => item),
    usage: usage || { ...EMPTY_USAGE },
  };
}
