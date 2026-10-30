import { MODEL_CATALOG_MAX_BYTES } from "../config/modelCatalog.js";

// Share a budget across cursor pages. JSON is parsed only after the complete,
// bounded response arrives; a header-only success cannot publish availability.
export async function readModelCatalogResponse(response, signal, budget = { remaining: MODEL_CATALOG_MAX_BYTES }) {
  if (!response.body) throw new Error("Missing catalog response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chunks = [];
  // Native stream cancellation settles pending reads without waiting for the
  // underlying cancel callback. Keep one listener, not one pending race per chunk.
  const abort = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      budget.remaining -= value.byteLength;
      if (budget.remaining < 0) throw new Error("Catalog response exceeds size limit");
      try { chunks.push(decoder.decode(value, { stream: true })); }
      catch { throw new Error("Invalid model catalog UTF-8"); }
    }
    try { chunks.push(decoder.decode()); }
    catch { throw new Error("Invalid model catalog UTF-8"); }
    try { return JSON.parse(chunks.join("")); }
    catch { throw new Error("Invalid model catalog JSON"); }
  } finally {
    signal.removeEventListener("abort", abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
