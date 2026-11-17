import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider, isCustomEmbeddingProvider } from "../../../shared/constants/providerNodeTypes.js";
import { PROVIDER_IDENTITIES } from "open-sse/providers/identity.js";

export function isProviderNodeId(provider) {
  return isOpenAICompatibleProvider(provider) || isAnthropicCompatibleProvider(provider) || isCustomEmbeddingProvider(provider);
}

export function nodeModelOwners(node, otherNodes) {
  const owners = new Set([node.id]);
  // Compatible chat declarations use the stable node ID. Older embedding
  // declarations use the display prefix; only take ownership when unambiguous.
  if (node.type === "custom-embedding" && typeof node.prefix === "string" && node.prefix
    && !Object.hasOwn(PROVIDER_IDENTITIES, node.prefix)
    && !otherNodes.some(other => other.id === node.prefix || other.prefix === node.prefix)) {
    owners.add(node.prefix);
  }
  return owners;
}
