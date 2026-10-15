import { buildModelsList } from "../route.js";
import { API_CORS_HEADERS } from "@/shared/utils/cors.js";

// URL slug → service kind(s). `web` covers both webSearch and webFetch.
const KIND_SLUG_MAP = {
  "image": ["image"],
  "tts": ["tts"],
  "stt": ["stt"],
  "embedding": ["embedding"],
  "video": ["video"],
  "music": ["music"],
  "image-to-text": ["imageToText"],
  "web": ["webSearch", "webFetch"],
};

const ALL_KINDS = ["llm", "image", "tts", "stt", "embedding", "imageToText", "webSearch", "webFetch", "video", "music"];

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": API_CORS_HEADERS["Access-Control-Allow-Headers"],
    },
  });
}

function json(data, options = {}) {
  return Response.json(data, {
    ...options,
    headers: {
      "Access-Control-Allow-Origin": "*",
      ...options?.headers,
    },
  });
}

/**
 * GET /v1/models/{kind} - OpenAI-compatible models list filtered by capability.
 * GET /v1/models/{provider}/{model} - OpenAI-compatible single model lookup.
 * Supported kinds: image, tts, stt, embedding, image-to-text, web.
 */
export async function GET(_request, { params }) {
  try {
    const { model } = await params;
    const path = Array.isArray(model) ? model : [model];
    const identifier = path.filter(Boolean).map(decodeURIComponent).join("/");
    const rawIdentifier = path.filter(Boolean).join("/");
    const kindFilter = path.length === 1 ? KIND_SLUG_MAP[path[0]] : null;

    if (kindFilter) {
      const data = await buildModelsList(kindFilter);
      return json({ object: "list", data });
    }

    // Match LLM and multimodal catalog exposed by GET /v1/models. A catch-all
    // parameter is required because provider-prefixed IDs contain slashes (e.g. cc/claude-sonnet-5).
    const models = await buildModelsList(ALL_KINDS);
    const matchedModel = models.find(
      (candidate) =>
        candidate.id === identifier ||
        candidate.id === rawIdentifier ||
        candidate.fullModel === identifier ||
        candidate.model === identifier
    );

    if (!matchedModel) {
      return json(
        {
          error: {
            message: `The model '${identifier}' does not exist or you do not have access to it.`,
            type: "invalid_request_error",
            code: "model_not_found",
          },
        },
        { status: 404 },
      );
    }

    return json(matchedModel);
  } catch (error) {
    console.log("Error fetching model:", error);
    return json(
      { error: { message: error.message, type: "server_error" } },
      { status: 500 },
    );
  }
}
