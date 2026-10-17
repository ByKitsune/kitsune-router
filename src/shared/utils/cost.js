// Explicit null means an included cost is unknown; absent legacy fields stay zero.
export function addNullableCost(total, amount) {
  if (total === null || amount === null) return null;
  return (total ?? 0) + (amount ?? 0);
}
