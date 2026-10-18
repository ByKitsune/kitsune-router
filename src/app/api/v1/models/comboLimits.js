function memberId(value) {
  return typeof value === "string" ? value.trim() : String(value?.model || value?.id || "").trim();
}

function declaredLimit(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function memberLimits(value, context, visiting) {
  const id = memberId(value);
  if (!id) return null;
  if (id.includes("/")) return context.resolveModel(id);
  const nested = context.combosByName.get(id);
  if (nested) return getComboTokenLimits(nested, context, visiting);
  const alias = context.modelAliases[id];
  if (typeof alias !== "string") return null;
  const key = `alias:${id}`;
  if (visiting.has(key)) return {};
  visiting.add(key);
  try {
    return memberLimits(alias, context, visiting);
  } finally {
    visiting.delete(key);
  }
}

// Resolve only selectable members. Unknown/cyclic limits cannot become a floor.
export function getComboTokenLimits(combo, context, visiting = new Set()) {
  const key = `combo:${combo.name}`;
  if (visiting.has(key)) return {};
  visiting.add(key);
  let minContext = Infinity;
  let minOutput = Infinity;
  let unknownContext = false;
  let unknownOutput = false;
  try {
    for (const member of combo.models || []) {
      const limits = memberLimits(member, context, visiting);
      if (!limits) continue;
      if (Number.isFinite(limits.contextWindow) && limits.contextWindow > 0) minContext = Math.min(minContext, limits.contextWindow);
      else unknownContext = true;
      if (Number.isFinite(limits.maxOutput) && limits.maxOutput > 0) minOutput = Math.min(minOutput, limits.maxOutput);
      else unknownOutput = true;
    }
  } finally {
    visiting.delete(key);
  }
  return {
    contextWindow: declaredLimit(combo.contextWindow || combo.context_length)
      ?? (!unknownContext && Number.isFinite(minContext) ? minContext : undefined),
    maxOutput: declaredLimit(combo.maxOutput || combo.max_completion_tokens)
      ?? (!unknownOutput && Number.isFinite(minOutput) ? minOutput : undefined),
  };
}
