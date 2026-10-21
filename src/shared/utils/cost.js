// Explicit null means an included cost is unknown; absent legacy fields stay zero.
export function addNullableCost(total, amount) {
  if (total === null || amount === null) return null;
  return (total ?? 0) + (amount ?? 0);
}

// Supplemental coverage never replaces the nullable total. Old aggregate rows
// without coverage cannot tell us how many requests (or dollars) were unpriced.
export function mergeCostCoverage(target, source) {
  target.costCoverage ||= {};
  for (const field of ["totalCost", "inputCost", "cachedCost", "outputCost"]) {
    const value = field === "totalCost" && source.totalCost === undefined ? source.cost : source[field];
    const incoming = source.costCoverage?.[field] || (Number.isFinite(value)
      ? { knownCost: value, unknownRequests: 0 }
      : { knownCost: null, unknownRequests: null });
    const current = target.costCoverage[field];
    target.costCoverage[field] = current ? {
      knownCost: current.knownCost === null || incoming.knownCost === null ? null : current.knownCost + incoming.knownCost,
      unknownRequests: current.unknownRequests === null || incoming.unknownRequests === null ? null : current.unknownRequests + incoming.unknownRequests,
    } : { ...incoming };
  }
}
