// Fal.ai — async submit + queue polling
import { sleep, nowSec, parseMediaError, sizeToAspectRatio, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from "./_base.js";
import { PROVIDER_MEDIA } from "../../providers/index.js";

const BASE_URL = PROVIDER_MEDIA["fal-ai"]?.imageConfig?.baseUrl;

export default {
  async: true,
  buildUrl: (model) => `${BASE_URL}/${model}`,
  buildHeaders: (creds) => {
    const key = creds?.apiKey || creds?.accessToken;
    return { "Content-Type": "application/json", "Authorization": `Key ${key}` };
  },
  buildBody: (_model, body) => {
    const req = { prompt: body.prompt, num_images: body.n || 1 };
    if (body.size) req.image_size = sizeToAspectRatio(body.size);
    if (body.image) req.image_url = body.image;
    return req;
  },
  async parseResponse(response, { headers, clientSignal, observeUsage }) {
    const data = await response.json();
    observeUsage?.(data);
    const { status_url, response_url } = data;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS, clientSignal);
      const r = await fetch(status_url, { headers, signal: clientSignal });
      if (!r.ok) {
        const diagnostics = await parseMediaError(r, observeUsage, clientSignal);
        throw Object.assign(new Error(diagnostics.message || `Fal status ${r.status}`), { upstreamStatus: r.status });
      }
      const s = await r.json();
      observeUsage?.(s);
      clientSignal?.throwIfAborted();
      if (s.status === "COMPLETED") {
        const fr = await fetch(response_url, { headers, signal: clientSignal });
        if (!fr.ok) {
          const diagnostics = await parseMediaError(fr, observeUsage, clientSignal);
          throw Object.assign(new Error(diagnostics.message || `Fal status ${fr.status}`), { upstreamStatus: fr.status });
        }
        const result = await fr.json();
        observeUsage?.(result);
        clientSignal?.throwIfAborted();
        return result;
      }
      if (s.status === "FAILED") throw new Error(s.error || "Fal generation failed");
    }
    throw new Error("Fal polling timeout");
  },
  normalize: (responseBody) => {
    const images = Array.isArray(responseBody.images)
      ? responseBody.images
      : (responseBody.image ? [responseBody.image] : []);
    return { created: nowSec(), data: images.map((img) => ({ url: img.url || img })) };
  },
};
