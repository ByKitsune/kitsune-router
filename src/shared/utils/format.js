export const fmt = (n) => new Intl.NumberFormat().format(n || 0);

// Compact form (en-US: K/M/B) for wide token counts so values never overflow
// narrow cards/tables; pair with title={fmt(n)} or a tooltip for the exact value.
const _compactNf = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
export const fmtCompact = (n) => ((n || 0) >= 100000 ? _compactNf.format(n) : fmt(n));

export const fmtCost = (n) => !Number.isFinite(n) || n < 0 ? "Not specified"
  : n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`;

export function fmtTime(iso) {
  if (!iso) return "Never";
  const diffMins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
}
