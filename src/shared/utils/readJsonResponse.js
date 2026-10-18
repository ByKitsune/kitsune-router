// Bound untrusted upstream JSON before parsing it. Cancelling also releases the
// DNS-pinned fetch agent when a response is rejected or exceeds its limit.
export async function readJsonResponse(response, maxBytes) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Upstream JSON response exceeds size limit");
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return JSON.parse(chunks.join(""));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
