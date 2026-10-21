import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as zlib from "node:zlib";
import { REQUEST_BODY_LIMITS, REQUEST_BODY_STREAM } from "../constants/requestBodyConfig.js";

export class RequestBodyError extends Error {
  constructor(status, message, code, param = "body") {
    super(message);
    this.name = "RequestBodyError";
    this.status = status;
    this.type = "invalid_request_error";
    this.code = code;
    this.param = param;
  }
}

const tooLarge = () => new RequestBodyError(413, "Request body too large", "request_body_too_large");
const timedOut = () => new RequestBodyError(408, "Request body read timed out", "request_body_timeout");
const clientAborted = () => new RequestBodyError(499, "Client Closed Request", "client_aborted");
const invalidJson = () => new RequestBodyError(400, "Invalid JSON body", "bad_request");
const invalidCompressed = () => new RequestBodyError(400, "Invalid compressed request body", "invalid_compressed_body");
const unsupported = () => new RequestBodyError(415, "Unsupported Content-Encoding (supported: identity and zstd when available)", "unsupported_content_encoding", "Content-Encoding");

// RFC 8878 framing only, not a second decompressor: zlib still validates block
// contents/checksums. Node 22 and some Bun versions accept truncated frames and
// can discard a concatenated frame sharing an input chunk with its predecessor.
// Track completeness with at most 18 metadata bytes, and split at frame ends
// before feeding zlib. Never accept a partially decoded but valid JSON prefix.
function zstdFraming(maxDecodedBytes) {
  const metadata = Buffer.alloc(18);
  let stage = "magic", needed = 4, used = 0, remaining = 0;
  let checksum = false, lastBlock = false, standardFrame = false, hasWindow = false;
  let frames = 0, declaredBytes = 0, contentSizeBytes = 0, contentSizeOffset = 0;
  const next = (name, bytes) => { stage = name; needed = bytes; used = 0; };

  return {
    push(chunk) {
      const ends = [];
      let offset = 0;
      const endFrame = () => {
        if (standardFrame) frames++;
        ends.push(offset);
        next("magic", 4);
      };
      const endBlock = () => {
        if (!lastBlock) next("blockHeader", 3);
        else if (checksum) next("checksum", 4);
        else endFrame();
      };
      while (offset < chunk.byteLength) {
        if (stage === "block" || stage === "skippable") {
          const size = Math.min(remaining, chunk.byteLength - offset);
          offset += size;
          remaining -= size;
          if (remaining === 0) {
            if (stage === "skippable") endFrame();
            else endBlock();
          }
          continue;
        }
        const size = Math.min(needed - used, chunk.byteLength - offset);
        metadata.set(chunk.subarray(offset, offset + size), used);
        offset += size;
        used += size;
        if (used !== needed) continue;
        if (stage === "magic") {
          const magic = metadata.readUInt32LE();
          standardFrame = magic === 0xfd2fb528;
          if (standardFrame) next("descriptor", 1);
          else if (magic >= 0x184d2a50 && magic <= 0x184d2a5f) next("skippableSize", 4);
          else throw invalidCompressed();
        } else if (stage === "descriptor") {
          const descriptor = metadata[0];
          if (descriptor & 8) throw invalidCompressed(); // reserved bit
          const singleSegment = !!(descriptor & 32);
          hasWindow = !singleSegment;
          const sizeFlag = descriptor >>> 6;
          checksum = !!(descriptor & 4);
          contentSizeBytes = sizeFlag ? 2 ** sizeFlag : singleSegment ? 1 : 0;
          contentSizeOffset = (singleSegment ? 0 : 1) + [0, 1, 2, 4][descriptor & 3];
          next("frameHeader", contentSizeOffset + contentSizeBytes);
        } else if (stage === "frameHeader") {
          if (hasWindow) {
            const base = 2 ** (10 + (metadata[0] >>> 3));
            const windowBytes = base + (base / 8) * (metadata[0] & 7);
            if (windowBytes > Math.max(1024, maxDecodedBytes)) throw tooLarge();
          }
          if (contentSizeBytes) {
            const size = contentSizeBytes === 8 ? metadata.readBigUInt64LE(contentSizeOffset)
              : BigInt(metadata.readUIntLE(contentSizeOffset, contentSizeBytes) + (contentSizeBytes === 2 ? 256 : 0));
            if (size > BigInt(maxDecodedBytes - declaredBytes)) throw tooLarge();
            declaredBytes += Number(size);
          }
          next("blockHeader", 3);
        } else if (stage === "blockHeader") {
          const header = metadata.readUIntLE(0, 3);
          const type = (header >>> 1) & 3;
          const size = header >>> 3;
          if (type === 3 || size > 128 * 1024) throw invalidCompressed();
          lastBlock = !!(header & 1);
          remaining = type === 1 ? 1 : size;
          stage = "block";
          if (remaining === 0) endBlock();
        } else if (stage === "checksum") {
          endFrame();
        } else if (stage === "skippableSize") {
          remaining = metadata.readUInt32LE();
          stage = "skippable";
          if (remaining === 0) endFrame();
        }
      }
      return ends;
    },
    finish() {
      if (stage !== "magic" || used !== 0 || frames === 0) throw invalidCompressed();
    },
  };
}

/**
 * Read identity or declared zstd JSON. Call only AFTER inbound auth/rate checks.
 * Wire and expanded counters are enforced while streaming, not after an
 * unbounded arrayBuffer()/json(). A single deadline covers reads + decoding;
 * cancellation destroys the native decoder and releases the Fetch reader.
 *
 * Streaming zstd was added in Node 22.15 (the app minimum is 22.19). Feature
 * detection also covers runtimes such as Bun: never mislabel missing support
 * as malformed JSON or fall back to an unbounded synchronous decompressor.
 */
export async function readRequestJson(request) {
  const limits = REQUEST_BODY_LIMITS;
  const signal = request?.signal;
  const encoding = (request?.headers?.get?.("content-encoding") || "identity").trim().toLowerCase() || "identity";
  const startedAt = performance.now();
  const controller = new AbortController();
  let reader, source, decoder, timeout, interruptedError, rejectInterrupted;
  const interrupted = new Promise((_, reject) => { rejectInterrupted = reject; });

  function interrupt(error) {
    if (interruptedError) return;
    interruptedError = error;
    controller.abort(error);
    rejectInterrupted(error);
  }
  const onAbort = () => interrupt(clientAborted());
  function checkBudget() {
    if (signal?.aborted) throw clientAborted();
    if (interruptedError) throw interruptedError;
    if (performance.now() - startedAt >= limits.timeoutMs) throw timedOut();
  }

  async function readBody() {
    checkBudget();
    if (encoding !== "identity" && encoding !== "zstd") throw unsupported();
    if (encoding === "zstd" && (typeof zlib.createZstdDecompress !== "function" || typeof zlib.constants?.ZSTD_d_windowLogMax !== "number")) {
      throw unsupported();
    }

    // Content-Length is an early refusal only; actual streamed bytes remain
    // authoritative, including absent, malformed or dishonest length headers.
    const length = request?.headers?.get?.("content-length");
    if (length && /^\d+$/.test(length.trim()) && Number(length) > limits.maxWireBytes) throw tooLarge();

    // In-process synthetic callers sometimes expose only .json(). They have
    // already materialized JSON, never compressed wire bytes. Real Fetch
    // Requests always have a `body` property, even when it is null, so this
    // compatibility path cannot bypass network-body streaming limits.
    if (request && !("body" in request) && typeof request.json === "function") {
      if (encoding !== "identity") throw unsupported();
      const body = await request.json();
      checkBudget();
      const text = JSON.stringify(body);
      if (typeof text !== "string") throw invalidJson();
      const bytes = Buffer.byteLength(text);
      if (bytes > limits.maxWireBytes || bytes > limits.maxDecodedBytes) throw tooLarge();
      checkBudget();
      return body;
    }

    if (!request?.body?.getReader) throw invalidJson();
    if (encoding === "zstd") {
      try {
        decoder = zlib.createZstdDecompress({
          chunkSize: REQUEST_BODY_STREAM.decodedChunkBytes,
          // Bound decoder workspace as well as its output. Do not allow a
          // hostile frame header to request an enormous native window.
          params: { [zlib.constants.ZSTD_d_windowLogMax]: Math.max(REQUEST_BODY_STREAM.minZstdWindowLog, Math.ceil(Math.log2(limits.maxDecodedBytes))) },
        });
      } catch (error) {
        if (["ERR_NOT_IMPLEMENTED", "ERR_METHOD_NOT_IMPLEMENTED", "ERR_NOT_SUPPORTED"].includes(error?.code)) throw unsupported();
        throw error;
      }
    }
    reader = request.body.getReader();
    let wireBytes = 0, decodedBytes = 0, policyError, slab, slabUsed = 0;
    const framing = decoder ? zstdFraming(limits.maxDecodedBytes) : null;
    const chunks = [];
    source = Readable.from((async function* () {
      try {
        while (true) {
          checkBudget();
          const { value, done } = await reader.read();
          checkBudget();
          if (done) { framing?.finish(); return; }
          if (!(value instanceof Uint8Array)) throw invalidJson();
          wireBytes += value.byteLength;
          if (wireBytes > limits.maxWireBytes) throw tooLarge();
          for (let offset = 0; offset < value.byteLength; offset += REQUEST_BODY_STREAM.wireChunkBytes) {
            checkBudget();
            const chunk = value.subarray(offset, offset + REQUEST_BODY_STREAM.wireChunkBytes);
            const ends = framing?.push(chunk) || [];
            let start = 0;
            for (const end of ends) {
              yield chunk.subarray(start, end);
              start = end;
            }
            if (start < chunk.byteLength) yield chunk.subarray(start);
          }
        }
      } catch (error) {
        if (error instanceof RequestBodyError) policyError ||= error;
        throw error;
      }
    })(), { objectMode: false, highWaterMark: REQUEST_BODY_STREAM.wireChunkBytes });

    try {
      await pipeline(source, ...(decoder ? [decoder] : []), async output => {
        for await (const chunk of output) {
          checkBudget();
          decodedBytes += chunk.byteLength;
          if (decodedBytes > limits.maxDecodedBytes) {
            policyError = tooLarge();
            throw policyError;
          }
          // Coalesce tiny client chunks into fixed slabs, so bounded payload
          // bytes cannot hide millions of retained Buffer/array entries.
          let offset = 0;
          while (offset < chunk.byteLength) {
            if (!slab) {
              slab = Buffer.allocUnsafe(REQUEST_BODY_STREAM.decodedChunkBytes);
              slabUsed = 0;
              chunks.push(slab);
            }
            const size = Math.min(slab.byteLength - slabUsed, chunk.byteLength - offset);
            slab.set(chunk.subarray(offset, offset + size), slabUsed);
            offset += size;
            slabUsed += size;
            if (slabUsed === slab.byteLength) slab = null;
          }
        }
      }, { signal: controller.signal });
    } catch (error) {
      checkBudget();
      // Node 22's async iterator can surface ABORT_ERR instead of the original
      // source/sink error during pipeline destruction. Preserve our diagnosis.
      if (policyError) throw policyError;
      if (error instanceof RequestBodyError) throw error;
      if (error?.code === "ZSTD_error_frameParameter_windowTooLarge") throw tooLarge();
      throw encoding === "zstd" ? invalidCompressed() : invalidJson();
    }

    checkBudget();
    let body;
    try {
      body = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks, decodedBytes)));
    } catch {
      throw invalidJson();
    }
    // JSON.parse itself is synchronous, but a late completion still must not
    // dispatch after cancellation/deadline expiry.
    checkBudget();
    return body;
  }

  try {
    signal?.addEventListener("abort", onAbort, { once: true });
    timeout = setTimeout(() => interrupt(timedOut()), limits.timeoutMs);
    return await Promise.race([readBody(), interrupted]);
  } catch (error) {
    if (signal?.aborted) throw clientAborted();
    if (interruptedError) throw interruptedError;
    if (error instanceof RequestBodyError) throw error;
    throw invalidJson();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
    source?.destroy();
    decoder?.destroy();
    // Never await a source's cancel hook: a stalled/malicious hook must not
    // extend our deadline. Observe rejection and release the lock immediately.
    try {
      const cancellation = reader ? reader.cancel() : request?.body?.cancel?.();
      cancellation?.catch(() => {});
    } catch { /* already errored/locked */ }
    try { reader?.releaseLock(); } catch { /* already released */ }
  }
}
