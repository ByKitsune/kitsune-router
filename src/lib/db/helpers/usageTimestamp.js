// Historical usage has included offsets, malformed dates and missing zones.
// Only explicit, valid calendar instants can safely enter the UTC text index.
export function canonicalUsageTimestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value !== "string" || value.length > 128) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?([Zz]|[+-]\d{2}:?\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction, zone] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m < 1 || m > 12 || d < 1 || d > days[m - 1] || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  let offset = "Z";
  if (!/^[Zz]$/.test(zone)) {
    const digits = zone.slice(1).replace(":", "");
    if (Number(digits.slice(0, 2)) > 23 || Number(digits.slice(2)) > 59) return null;
    offset = `${zone[0]}${digits.slice(0, 2)}:${digits.slice(2)}`;
  }
  const instant = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.${(fraction || "").padEnd(3, "0").slice(0, 3)}${offset}`);
  if (!Number.isFinite(instant.getTime())) return null;
  const canonical = instant.toISOString();
  return /^\d{4}-/.test(canonical) ? canonical : null;
}

export function isValidCivilUsageTimestamp(value) {
  if (typeof value !== "string" || value.length > 128 || !/^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?$/.test(value)) return false;
  // Validate the civil calendar only. The UTC candidate is discarded: no zone
  // or instant can be inferred from the supplied local clock representation.
  return canonicalUsageTimestamp(`${value}Z`) !== null;
}

// Keep bare timestamp range predicates alongside this validity guard so SQLite
// can still seek idx_uh_ts. '+0 seconds' forces invalid calendar days to be
// recomputed on older SQLite versions rather than echoing their input unchanged.
export const CANONICAL_USAGE_TIMESTAMP_SQL = "timestamp = strftime('%Y-%m-%dT%H:%M:%fZ', timestamp, '+0 seconds')";
