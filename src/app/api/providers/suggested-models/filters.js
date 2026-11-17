import { isFreeOpenCodeModel, normalizeOpenCodeModel } from "open-sse/config/opencodeCatalog.js";

const legacyFreeIds = new Set(["big-pickle"]);
const unavailableFreeIds = new Set(["deepseek-v4-flash-free"]);

function openCodeFree(models) {
  // The basic OpenAI-format listing has no published tariffs or endpoint
  // descriptors. Keep its historical suggestions; only explicit catalog
  // rates are accepted as billing evidence by the pricing and registry layers.
  const hasDetailedRows = models.some(row => row && typeof row === "object" && ("cost" in row || "api" in row || row.type === "chat"));
  if (!hasDetailedRows) {
    return models.map(row => row?.id).filter(id => typeof id === "string" && !unavailableFreeIds.has(id)
      && (legacyFreeIds.has(id) || id.endsWith("-free"))).map(id => ({ id, name: id }));
  }
  return models.map(row => normalizeOpenCodeModel(row, "zen"))
    .filter(model => model?.targetFormat === "openai" && !unavailableFreeIds.has(model.id) && isFreeOpenCodeModel(model))
    .map(({ id, name, capabilities }) => ({ id, name, contextLength: capabilities.contextWindow }));
}

export const FILTERS = {
  "openrouter-free": (models) =>
    models
      .filter(
        (m) =>
          m.pricing?.prompt === "0" &&
          m.pricing?.completion === "0" &&
          m.context_length >= 200000
      )
      .map((m) => ({ id: m.id, name: m.name, contextLength: m.context_length }))
      .sort((a, b) => b.contextLength - a.contextLength),

  "opencode-free": openCodeFree,

  // models.dev returns a large catalog; keep only mimo models
  "mimo-free": (models) =>
    (Array.isArray(models) ? models : [])
      .filter((m) => m.id?.startsWith("mimo") || m.name?.toLowerCase().includes("mimo"))
      .map((m) => ({ id: m.id, name: m.name || m.id })),
};
