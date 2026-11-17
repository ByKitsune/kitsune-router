import { parsePricingTimestamp } from "./timeOfUsePricing.js";

export const GEMINI_API_PRICING_URL = "https://aistudio.google.com/docs/pricing";
export const GEMINI_API_DEPRECATIONS_URL = "https://aistudio.google.com/docs/deprecations";

// All rates are USD per million tokens. Cache storage, when offered, is timed
// separately and never becomes a charge for an observed cache-write token.
function tokens(input, output, cached) {
  return { input, output, cached, reasoning: output, cache_creation: null };
}

function longContext(short, long) {
  return { ...tokens(...short), tier: { threshold: 200000, ...tokens(...long) } };
}

function tiers(standard, batch, flex, priority) {
  return { ...standard, service_tiers: { batch, flex, priority } };
}

function conventional(standard, discounted, priority) {
  return tiers(tokens(...standard), tokens(...discounted), tokens(...discounted), tokens(...priority));
}

const gemini4Intro = conventional([2, 10, 0.1], [1, 5, 0.05], [3.6, 18, 0.18]);
const gemini4List = conventional([4, 20, 0.2], [2, 10, 0.1], [7.2, 36, 0.36]);
const flashIntro = conventional([0.75, 3.75, 0.075], [0.375, 1.875, 0.0375], [1.35, 6.75, 0.135]);
const flashList = conventional([1.5, 7.5, 0.15], [0.75, 3.75, 0.075], [2.7, 13.5, 0.27]);
const flashLite = tiers(tokens(0.3, 2.5, 0.03), tokens(0.15, 1.25, 0.015), tokens(0.15, 1.25, 0.02), tokens(0.54, 4.5, 0.05));
const proDiscounted = longContext([1, 6, 0.2], [2, 9, 0.4]);
const proPreview = tiers(longContext([2, 12, 0.2], [4, 18, 0.4]), proDiscounted, proDiscounted,
  longContext([3.6, 21.6, 0.36], [7.2, 32.4, 0.72]));

const gemini4Promotion = { initial: gemini4Intro, next: gemini4List, nextOn: "2026-12-01", through: "2026-11-30" };
const flashPromotion = {
  initial: flashIntro, next: flashList, nextOn: "2027-01-01", through: "2026-12-31",
  storage: { default: 0.5, batch: 0.5, flex: 0.5, priority: 0.5 },
  nextStorage: { default: 1, batch: 1, flex: 1, priority: 1 },
};
const flashLiteSchedule = { initial: flashLite, storage: { default: 1, batch: 1, flex: 1, priority: 1 } };
const proPreviewSchedule = { initial: proPreview, storage: { default: 4.5, batch: 4.5, flex: 4.5, priority: 8.1 } };

const schedules = {
  "gemini-4-argon": { ...gemini4Promotion, effectiveFrom: "2026-10-14T00:00:00Z" },
  "gemini-4-carbon": { ...gemini4Promotion, effectiveFrom: "2026-11-11T00:00:00Z" },
  "gemini-4-hydrogen": {
    initial: conventional([1.5, 7.5, 0.075], [0.75, 3.75, 0.0375], [2.7, 13.5, 0.135]),
    effectiveFrom: "2026-11-13T00:00:00Z",
  },
  "gemini-3.8-flash": { ...flashPromotion, effectiveFrom: "2026-09-03T00:00:00Z" },
  // The October 17 source review establishes this promo was active by then.
  "gemini-3.6-flash": { ...flashPromotion, effectiveFrom: "2026-10-17T00:00:00Z" },
  "gemini-3.5-flash-lite": { ...flashLiteSchedule, effectiveFrom: "2026-07-22T00:00:00Z" },
  "gemini-3.1-pro-preview": { ...proPreviewSchedule, effectiveFrom: "2026-10-17T00:00:00Z" },
  "gemini-3.1-pro-preview-customtools": { ...proPreviewSchedule, effectiveFrom: "2026-10-17T00:00:00Z" },
  // Google explicitly names the billed destinations for these redirects.
  // Before the switch, the resolver uses the existing 2.5 specifications.
  "gemini-2.5-flash": { initial: null, redirectTo: "gemini-3.5-flash-lite", nextOn: "2026-12-01" },
  "gemini-2.5-pro": { initial: null, redirectTo: "gemini-3.8-flash", nextOn: "2026-12-01" },
};

export const GEMINI_API_PRICED_MODELS = Object.keys(schedules);

export function getGeminiApiPriceSchedule(model) {
  return Object.hasOwn(schedules, model) ? schedules[model] : null;
}

function latestSwitchTime(date) {
  return Date.parse(`${date}T00:00:00-08:00`);
}

export function getGeminiApiBillingRedirect(model) {
  const schedule = getGeminiApiPriceSchedule(model);
  if (!schedule?.redirectTo) return null;
  return {
    model: schedule.redirectTo,
    effectiveDate: schedule.nextOn,
    effectiveFrom: new Date(latestSwitchTime(schedule.nextOn)).toISOString(),
    source: GEMINI_API_DEPRECATIONS_URL,
  };
}

// Google publishes civil dates for these changes, without a time zone. Leave
// the interval between the UTC and Pacific midnights unpriced until a precise
// cutover is documented. Each listed switch is during Pacific standard time.
function switchStatus(date, nextOn) {
  if (!nextOn || date < Date.parse(`${nextOn}T00:00:00Z`)) return "initial";
  return date < latestSwitchTime(nextOn) ? "uncertain" : "next";
}

function priceDate(schedule, timestamp) {
  const date = parsePricingTimestamp(timestamp);
  if (!date || (schedule.effectiveFrom && date < Date.parse(schedule.effectiveFrom))) return null;
  return date;
}

export function getGeminiApiTokenPricing(model, { timestamp = Date.now() } = {}) {
  const schedule = getGeminiApiPriceSchedule(model);
  if (!schedule) return null;
  const date = priceDate(schedule, timestamp);
  if (!date) return tokens(null, null, null);
  const status = switchStatus(date, schedule.nextOn);
  if (status === "next" && schedule.redirectTo) return getGeminiApiTokenPricing(schedule.redirectTo, { timestamp });
  return status === "uncertain" ? tokens(null, null, null) : schedule[status];
}

export function getGeminiApiCacheStorage(model, { timestamp = Date.now() } = {}) {
  const schedule = getGeminiApiPriceSchedule(model);
  if (!schedule) return null;
  const date = priceDate(schedule, timestamp);
  if (!date) return null;
  const status = switchStatus(date, schedule.nextOn);
  if (status === "next" && schedule.redirectTo) return getGeminiApiCacheStorage(schedule.redirectTo, { timestamp });
  const prices = status === "initial" ? schedule.storage : status === "next" ? schedule.nextStorage : null;
  return prices ? { currency: "USD", unit: "1M token-hours", price: prices.default, service_tiers: prices } : null;
}
