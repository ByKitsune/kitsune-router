// Antigravity image adapter - delegates to the executor for correct request
// envelope (project, model, requestType, sessionId) and auth headers.
import { nowSec, parseMediaError, sizeToAspectRatio } from "./_base.js";
import { getExecutor } from "../../executors/index.js";
import { detectImageMime, fetchImageAsBase64, parseDataUri } from "../../translator/concerns/image.js";

// Convert image input (data URI, remote URL, or raw base64) to Gemini inlineData.
async function resolveImageInput(input, signal) {
  if (!input || typeof input !== "string") return null;

  let parsed = parseDataUri(input);

  if (!parsed && /^https?:\/\//i.test(input)) {
    const fetched = await fetchImageAsBase64(input, { timeoutMs: 15000, signal });
    signal?.throwIfAborted();
    parsed = fetched ? parseDataUri(fetched.url) : null;
  }

  if (parsed?.mimeType?.startsWith("image/")) {
    const detectedMime = detectImageMime(Buffer.from(parsed.base64.slice(0, 32), "base64"));
    return { inlineData: { mimeType: detectedMime || parsed.mimeType, data: parsed.base64 } };
  }

  // Raw base64 string (assume PNG)
  if (/^[A-Za-z0-9+/]/.test(input) && input.length > 100 && !input.startsWith("http")) {
    return { inlineData: { mimeType: "image/png", data: input } };
  }

  return null;
}

function buildImagePrompt(prompt, referenceCount) {
  const referenceInstruction = referenceCount > 0
    ? `Use all ${referenceCount} attached reference image${referenceCount === 1 ? "" : "s"} in the result. `
    : "";
  return `Generate an image as the final response. ${referenceInstruction}Do not answer with text only.\n\n${prompt}`;
}

export default {
  // Delegate to executor instead of building URL/headers/body manually
  useExecutor: true,

  // Stubs - required by imageGenerationCore interface but unused with useExecutor
  buildUrl: () => "",
  buildHeaders: () => ({}),
  buildBody: () => ({}),

  async executeViaExecutor(model, body, credentials, log, { clientSignal, observeUsage } = {}) {
    clientSignal?.throwIfAborted();
    const executor = getExecutor("antigravity");
    if (!executor) throw new Error("Antigravity executor not found");

    // Ensure we use an image model for image generation
    const isImageModel = (m) => /image|imagen|image-generation/i.test(m || "");
    let targetModel = isImageModel(model) ? model : "gemini-3.1-flash-image";

    // Aspect ratio resolution: from body.aspect_ratio or body.size
    let ratio = null;
    if (body.aspect_ratio && typeof body.aspect_ratio === "string") {
      ratio = body.aspect_ratio.trim();
    } else if (body.size && typeof body.size === "string") {
      ratio = sizeToAspectRatio(body.size);
    }

    if (ratio) {
      const suffix = ratio.replace(":", "x");
      if (!targetModel.includes(suffix)) {
        targetModel = `${targetModel}-${suffix}`;
      }
    }

    // Collect all image inputs (single image or array of images)
    const imageInputs = [];
    if (Array.isArray(body.images)) imageInputs.push(...body.images);
    if (Array.isArray(body.image)) imageInputs.push(...body.image);
    else if (body.image) imageInputs.push(body.image);

    const parts = [];
    for (const input of imageInputs) {
      const inlineData = await resolveImageInput(input, clientSignal);
      clientSignal?.throwIfAborted();
      if (!inlineData) {
        const error = new Error("Invalid reference image. Use a data URL, HTTP(S) URL, or raw base64 image.");
        error.status = 400;
        error.retryable = false;
        throw error;
      }
      parts.push(inlineData);
    }

    parts.push({ text: buildImagePrompt(body.prompt, imageInputs.length) });

    const chatBody = {
      contents: [{ role: "user", parts }],
    };

    const result = await executor.execute({
      model: targetModel,
      body: chatBody,
      stream: false,
      credentials,
      log,
      signal: clientSignal,
    });

    if (clientSignal?.aborted) {
      await result.response.body?.cancel().catch(() => {});
      clientSignal.throwIfAborted();
    }
    if (!result.response.ok) {
      const diagnostics = await parseMediaError(result.response, observeUsage, clientSignal);
      const error = new Error(diagnostics.message || `HTTP ${result.response.status}`);
      error.status = result.response.status;
      // Explicit upstream marker: imageGenerationCore uses this to preserve the
      // real status (e.g. 404 for an unavailable model) instead of reporting a
      // generic 502 that would cool down healthy pooled accounts.
      error.upstreamStatus = result.response.status;
      error.resetsAtMs = diagnostics.resetsAtMs;
      throw error;
    }

    const responseBody = await result.response.json();
    observeUsage?.(responseBody);
    clientSignal?.throwIfAborted();
    return responseBody;
  },

  normalize: (responseBody, prompt) => {
    const candidates = responseBody.candidates || responseBody.response?.candidates || [];
    const parts = candidates[0]?.content?.parts || [];
    const images = parts
      .map((p) => p.inlineData || p.inline_data)
      .filter((inlineData) => inlineData?.data)
      .map((inlineData) => ({ b64_json: inlineData.data }));

    if (images.length === 0) {
      const text = parts.map((p) => p.text).filter(Boolean).join(" ").trim();
      throw new Error(
        text
          ? `Antigravity returned text instead of an image: ${text}`
          : "Antigravity did not return an image."
      );
    }

    return {
      created: nowSec(),
      data: images,
    };
  },
};
