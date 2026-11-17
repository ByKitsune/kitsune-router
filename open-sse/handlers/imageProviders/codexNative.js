import { readImageProviderJson, readImageUrl, reportedImageUsage } from "./_base.js";
import { CODEX_IMAGES_BASE_URL, CODEX_IMAGE_DEFAULT_MODEL, CODEX_IMAGE_NATIVE_MODEL, CODEX_IMAGE_LEGACY_MODEL,
  CODEX_IMAGE_MAX_COUNT, CODEX_IMAGE_MAX_REFERENCES, CODEX_IMAGE_FORMATS, CODEX_IMAGE_QUALITIES, CODEX_IMAGE_BACKGROUNDS } from "../../config/codexImage.js";
import { parseUpstreamErrorBody } from "../../utils/error.js";
import { IMAGE_BASE64_PATTERN, IMAGE_SIGNATURES } from "../../config/mediaConfig.js";

function isCompletedRaster(value) {
  if (typeof value !== "string" || !value || !IMAGE_BASE64_PATTERN.test(value)) return false;
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 12 || bytes.toString("base64") !== value) return false;
  return IMAGE_SIGNATURES.some(signature => signature.sig.every((byte, index) => bytes[signature.offset + index] === byte)
    && (!signature.verifyWebp || bytes.toString("ascii", 8, 12) === "WEBP"));
}

function references(body = {}) {
  if (body.images != null && !Array.isArray(body.images)) throw new Error("images must be an array");
  const values = [...(body.images || []), ...(body.image != null ? [body.image] : [])];
  if (values.length > CODEX_IMAGE_MAX_REFERENCES) throw new Error("Too many reference images");
  return values.map(value => {
    if (value && typeof value === "object" && typeof value.file_id === "string" && value.file_id) return { file_id: value.file_id };
    const url = typeof value === "string" ? value : value?.image_url;
    if (typeof url !== "string" || !url.trim()) throw new Error("Invalid reference image");
    return { image_url: /^(?:data:image\/|https?:\/\/)/i.test(url) ? url : `data:image/png;base64,${url}` };
  });
}

export function codexImagesUrl(body) {
  return `${CODEX_IMAGES_BASE_URL}/${references(body).length ? "edits" : "generations"}`;
}

export function buildCodexImageBody(model, body, { clientSignal, transport } = {}) {
  const nativeModel = CODEX_IMAGE_NATIVE_MODEL.test(model) ? model
    : CODEX_IMAGE_LEGACY_MODEL.test(model) ? CODEX_IMAGE_DEFAULT_MODEL : null;
  if (!nativeModel) throw new Error("Use a native gpt-image model or an existing Codex image alias");
  if (typeof body.prompt !== "string" || !body.prompt.trim()) throw new Error("prompt must be a nonempty string");
  if (body.n != null && (!Number.isInteger(body.n) || body.n < 1 || body.n > CODEX_IMAGE_MAX_COUNT)) throw new Error("n must be an integer between 1 and 10");
  for (const control of ["frame_count", "frame_duration_ms"]) {
    if (body[control] != null) throw new Error(`Unsupported Codex image control: ${control}`);
  }
  const request = { model: nativeModel, prompt: body.prompt, n: body.n ?? 1 };
  for (const [key, values] of [["quality", CODEX_IMAGE_QUALITIES], ["background", CODEX_IMAGE_BACKGROUNDS], ["output_format", CODEX_IMAGE_FORMATS]]) {
    if (body[key] == null || body[key] === "") continue;
    if (!values.has(body[key])) throw new Error(`Unsupported image ${key}`);
    request[key] = body[key];
  }
  if (body.size != null && body.size !== "") {
    if (typeof body.size !== "string" || !/^(?:auto|[1-9]\d{1,4}x[1-9]\d{1,4})$/.test(body.size)) throw new Error("Invalid image size");
    request.size = body.size;
  }
  const images = references(body);
  const finish = refs => refs.length ? { ...request, images: refs } : request;
  if (!images.some(image => /^https?:\/\//i.test(image.image_url || ""))) return finish(images);
  return Promise.all(images.map(async image => {
    if (!/^https?:\/\//i.test(image.image_url || "")) return image;
    const fetched = await readImageUrl(image.image_url, clientSignal, transport);
    return { image_url: `data:${fetched.mimeType};base64,${fetched.base64}` };
  })).then(finish);
}

async function readNative(response, options) {
  const value = await readImageProviderJson(response, options.clientSignal);
  options.observeUsage?.(value);
  const usage = reportedImageUsage(value);
  try {
    if (value.error) {
      const diagnostic = parseUpstreamErrorBody(response, JSON.stringify(value));
      throw Object.assign(new Error(diagnostic.message || "Codex image generation failed"), { ...diagnostic, upstreamStatus: 502 });
    }
    if (!Number.isSafeInteger(value.created) || value.created < 0 || !Array.isArray(value.data) || !value.data.length ||
      value.data.some(image => !image || !isCompletedRaster(image.b64_json))) {
      throw new Error("Codex Images API did not return a completed image");
    }
  } catch (error) {
    if (usage && !options.deferUsage) await options.onUsage?.(usage, { status: options.clientSignal?.aborted ? "aborted" : "error" });
    throw error;
  }
  if (usage && !options.deferUsage) await options.onUsage?.(usage);
  options.clientSignal?.throwIfAborted();
  return value;
}

export async function parseNativeCodexImage(response, options) {
  if (!options.streamToClient) return readNative(response, options);
  const controller = new AbortController();
  const signal = options.clientSignal ? AbortSignal.any([options.clientSignal, controller.signal]) : controller.signal;
  let cancelled = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async pull(destination) {
      try {
        const value = await readNative(response, { ...options, clientSignal: signal });
        if (cancelled) return;
        await options.onRequestSuccess?.();
        signal.throwIfAborted();
        destination.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify(value)}\n\n`));
        destination.close();
      } catch (error) {
        if (cancelled) return;
        if (signal.aborted) destination.error(signal.reason);
        else {
          const diagnostic = parseUpstreamErrorBody(response, JSON.stringify({ error: { message: error.message, code: error.code } }));
          destination.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: diagnostic.message || "Image response could not be read", ...(diagnostic.code ? { code: diagnostic.code } : {}) })}\n\n`));
          destination.close();
        }
      }
    },
    cancel(reason) {
      cancelled = true;
      controller.abort(reason);
      if (!response.body?.locked) { try { void response.body?.cancel(reason).catch(() => {}); } catch {} }
    },
  }, { highWaterMark: 0 });
  return { sseResponse: new Response(stream, { headers: {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": "*",
  } }) };
}
