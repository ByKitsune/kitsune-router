// Match Fal's existing saved-connection probe without queueing a paid image:
// GET https://api.fal.ai/v1/models?limit=1 with Authorization: Key <apiKey>.
// The caller supplies its existing transport/proxy policy; this helper owns
// only the bounded, read-only HTTP request and disposal of its response body.
import { FAL_MODEL_CATALOG, FAL_VALIDATION_TIMEOUT_MS } from "../config/fal.js";

function dispose(response) {
  void response?.body?.cancel().catch(() => {});
}

export async function validateFalApiKey(apiKey, fetch, { signal: callerSignal } = {}) {
  const deadline = AbortSignal.timeout(FAL_VALIDATION_TIMEOUT_MS);
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
  signal.throwIfAborted();

  let aborted = false;
  let onAbort;
  let response;
  const cancellation = new Promise((_, reject) => {
    onAbort = () => { aborted = true; reject(signal.reason); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
  const request = Promise.resolve().then(() => {
    signal.throwIfAborted();
    return fetch(FAL_MODEL_CATALOG, {
      method: "GET", redirect: "error", signal,
      headers: { Authorization: `Key ${apiKey}` },
    });
  }).then(result => {
    if (aborted) dispose(result);
    return result;
  });

  try {
    response = await Promise.race([request, cancellation]);
    signal.throwIfAborted();
    const valid = response.ok;
    return {
      valid,
      error: valid ? null : response.status === 401 || response.status === 403
        ? "Invalid API key" : `Unable to verify API key (Fal returned ${response.status})`,
    };
  } finally {
    signal.removeEventListener("abort", onAbort);
    dispose(response);
  }
}
