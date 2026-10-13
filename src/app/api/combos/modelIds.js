// Normalize combo model entries to stable "provider/model" strings.
// Legacy clients (the old TUI) stored model objects ({provider, model} or
// {fullModel}); storing those crashes the Combos dashboard (React renders
// `model.split` on a string). Malformed entries are rejected so bad data
// never reaches persistence. 9router #4584 (further fixes #3988 alongside
// #4580 for new API writes).
export function normalizeComboModelIds(models) {
  if (!Array.isArray(models)) return null;
  const ids = models.map((model) => {
    if (typeof model === "string") return model;
    if (model && typeof model === "object" && !Array.isArray(model)) {
      if (typeof model.fullModel === "string") return model.fullModel;
      if (typeof model.provider === "string" && typeof model.model === "string") {
        return `${model.provider}/${model.model}`;
      }
    }
    return null;
  });
  return ids.every((id) => typeof id === "string" && id.trim()) ? ids : null;
}
