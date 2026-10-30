import { isDeepStrictEqual } from "node:util";
import { COPILOT_RETIRED_FALLBACK_MODELS } from "../open-sse/providers/metadata/copilotCatalogRetirements.js";

const historicalRetiredPairs = new Set(COPILOT_RETIRED_FALLBACK_MODELS.map(({ provider, id }) => JSON.stringify([provider, id])));

// A historical extraction can outlive current advertisement. Only the exact
// publisher-reviewed retirements may leave the current registry; all literal
// product/model, uniqueness, cost and supplied-snapshot checks still apply.
export function verifyModelsDevRegistryMembership({ rows, references, currentPairs, verifiedSnapshotPairs = null }) {
  const extractedPairs = new Set();
  const retiredPairs = new Set();
  for (const [provider, model, cost] of rows) {
    const key = JSON.stringify([provider, model]);
    const current = currentPairs.has(key);
    const retired = historicalRetiredPairs.has(key);
    if ((!current && !retired) || (verifiedSnapshotPairs && !verifiedSnapshotPairs.has(key))
      || extractedPairs.has(key) || !Object.hasOwn(references[provider] || {}, model)
      || !isDeepStrictEqual(references[provider][model], cost)) {
      throw new Error(`Not a unique exact registry pair: ${provider}/${model}`);
    }
    extractedPairs.add(key);
    if (!current && retired) retiredPairs.add(key);
  }
  return { extractedPairs, retiredPairs };
}
