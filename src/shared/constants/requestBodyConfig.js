// Inbound JSON budgets are independent of model/context/output-token limits.
// Leave room for user media without accepting unbounded uploads or expansion.
export const REQUEST_BODY_LIMITS = Object.freeze({
  maxWireBytes: 32 * 1024 * 1024,
  maxDecodedBytes: 64 * 1024 * 1024,
  timeoutMs: 30_000,
});

export const REQUEST_BODY_STREAM = Object.freeze({
  wireChunkBytes: 64 * 1024,
  decodedChunkBytes: 16 * 1024,
  minZstdWindowLog: 10,
});
