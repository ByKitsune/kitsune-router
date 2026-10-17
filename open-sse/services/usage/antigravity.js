import { parseResetTime } from "./shared.js";

const QUOTA_FAMILIES = [
  { pattern: /argon/i, key: "argon", name: "Gemini 4 Argon" },
  { pattern: /gemini/i, key: "gemini", name: "Gemini" },
  { pattern: /claude|gpt/i, key: "claude_gpt", name: "Claude / GPT" },
];

/** Normalize a real fraction to the dashboard's percentage scale, not token counts. */
export function normalizeAntigravityQuota(quotaInfo, displayName) {
  const value = quotaInfo?.remainingFraction;
  if (typeof value !== "number" && !(typeof value === "string" && value.trim())) return null;
  const fraction = Number(value);
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) return null;

  const total = 1000;
  return {
    used: total - Math.round(total * fraction),
    total,
    resetAt: parseResetTime(quotaInfo.resetTime),
    remainingPercentage: fraction * 100,
    unlimited: false,
    displayName,
  };
}

/** Parse only windows actually present in retrieveUserQuotaSummary. */
export function parseAntigravityQuotaSummary(data) {
  const groups = Array.isArray(data?.groups) ? data.groups : data?.quotaSummary?.groups;
  if (!Array.isArray(groups)) return {};
  const quotas = {};

  for (const group of groups) {
    if (!Array.isArray(group?.buckets)) continue;
    for (const bucket of group.buckets) {
      if (!bucket || bucket.disabled === true) continue;
      const hints = `${group.displayName || ""} ${bucket.bucketId || ""} ${bucket.displayName || ""}`;
      const family = QUOTA_FAMILIES.find(({ pattern }) => pattern.test(hints));
      if (!family) continue;

      const declaredWindow = typeof bucket.window === "string" ? bucket.window.trim().toLowerCase() : "";
      let window = declaredWindow;
      if (window === "5h") window = "session";
      if (!window) {
        const bucketName = `${bucket.bucketId || ""} ${bucket.displayName || ""}`;
        if (/weekly/i.test(bucketName)) window = "weekly";
        else if (/session|5h|five[ -]hour/i.test(bucketName)) window = "session";
      }
      if (window !== "weekly" && window !== "session") continue;

      const quota = normalizeAntigravityQuota(bucket, `${family.name} (${window === "weekly" ? "Weekly" : "Session"})`);
      if (!quota) continue;
      const key = `${family.key}_${window}`;
      const previous = quotas[key];
      if (!previous
        || quota.remainingPercentage < previous.remainingPercentage
        || (quota.remainingPercentage === 0 && previous.remainingPercentage === 0
          && Date.parse(quota.resetAt) > (Date.parse(previous.resetAt) || 0))) {
        quotas[key] = quota;
      }
    }
  }

  return quotas;
}
