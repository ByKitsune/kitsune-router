// Native DeepSeek public USD/1M-token reference schedule, reviewed 2026-10-21:
// https://api-docs.deepseek.com/quick_start/pricing
// Weekday peak: [01:00,04:00) and [06:00,10:00) UTC, excluding Chinese holidays.
// The date calendar is deliberately finite; an unreviewed year is not evidence
// that it contains no holidays. Saturday makeup work does not override the
// vendor's explicit weekend off-peak rule.
// 2026 calendar: State Council 国办发明电〔2025〕7号, 2025-11-04:
// https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html
export const DEEPSEEK_HOLIDAY_RANGES = {
  2026: [
    ["2026-01-01", "2026-01-03"], ["2026-02-15", "2026-02-23"],
    ["2026-04-04", "2026-04-06"], ["2026-05-01", "2026-05-05"],
    ["2026-06-19", "2026-06-21"], ["2026-09-25", "2026-09-27"],
    ["2026-10-01", "2026-10-07"],
  ],
};

const peakQuotes = {
  "deepseek-flash": { input: 0.3, cached: 0.006, output: 1.2, reasoning: 1.2 },
  "deepseek-v4-pro": { input: 1.32, cached: 0.044, output: 3.96, reasoning: 3.96 },
};
const unknownQuote = { input: null, output: null, cached: null, reasoning: null, cache_creation: null };

/** A billing instant must not silently roll a nonexistent civil date forward. */
export function parsePricingTimestamp(value) {
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!match) return null;
    const [, year, month, day, hour, minute, second = "0", , zone] = match;
    const y = Number(year), m = Number(month), d = Number(day);
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (m < 1 || m > 12 || d < 1 || d > days[m - 1] || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
    if (zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) return null;
  } else if (!(value instanceof Date) && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Missing options leave the published off-peak reference visible in the editor.
 * Actual usage supplies its recorded timestamp; no wall-clock fallback is used.
 * Undefined means this is not one of the reviewed native scheduled routes.
 */
export function getTimeOfUsePricing(provider, upstreamModel, timestamp) {
  if (provider !== "deepseek" || !Object.hasOwn(peakQuotes, upstreamModel) || timestamp === undefined) return undefined;
  const date = parsePricingTimestamp(timestamp);
  if (!date) return { ...unknownQuote };
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return undefined;
  const hour = date.getUTCHours();
  if (!(hour >= 1 && hour < 4 || hour >= 6 && hour < 10)) return undefined;
  const holidayRanges = DEEPSEEK_HOLIDAY_RANGES[date.getUTCFullYear()];
  if (!holidayRanges) return { ...unknownQuote };
  // Both documented peak windows fall within the same UTC and China civil day.
  const chinaDay = new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (holidayRanges.some(([start, end]) => chinaDay >= start && chinaDay <= end)) return undefined;
  return { ...peakQuotes[upstreamModel] };
}
