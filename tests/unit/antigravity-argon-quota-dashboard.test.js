import { describe, expect, it } from "vitest";
import { parseQuotaData } from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";

const WEEKLY_RESET = "2026-10-23T09:42:31.000Z";
const SESSION_RESET = "2026-10-18T02:00:00.000Z";

function quota(remainingPercentage, displayName, resetAt) {
  return { used: 1000 - remainingPercentage * 10, total: 1000, remainingPercentage, displayName, resetAt };
}

describe("Antigravity Argon dashboard quota normalization", () => {
  it("keeps real independent per-model, session, and weekly windows without duplicating summary rows", () => {
    const rows = parseQuotaData("antigravity", { quotas: {
      "gemini-4-argon-high": quota(45, "Gemini 4 Argon (High)", SESSION_RESET),
      "gemini-4-argon-medium": quota(80, "Gemini 4 Argon (Medium)", SESSION_RESET),
      argon_session: quota(25, "Gemini 4 Argon (Session)", SESSION_RESET),
      argon_weekly: quota(0, "Gemini 4 Argon (Weekly)", WEEKLY_RESET),
      gemini_weekly: quota(75, "Gemini (Weekly)", WEEKLY_RESET),
      claude_gpt_weekly: quota(65, "Claude / GPT (Weekly)", WEEKLY_RESET),
    } });

    expect(rows).toHaveLength(6);
    expect(new Set(rows.map(row => row.modelKey)).size).toBe(6);
    expect(rows.find(row => row.modelKey === "argon_weekly")).toMatchObject({ name: "Gemini 4 Argon (Weekly)", used: 1000, total: 1000, remainingPercentage: 0, resetAt: WEEKLY_RESET });
    expect(rows.find(row => row.modelKey === "argon_session")).toMatchObject({ name: "Gemini 4 Argon (Session)", used: 750, total: 1000, remainingPercentage: 25, resetAt: SESSION_RESET });
    expect(rows.find(row => row.modelKey === "gemini-4-argon-high")).toMatchObject({ remainingPercentage: 45 });
    expect(rows.find(row => row.modelKey === "gemini_weekly")).toMatchObject({ remainingPercentage: 75 });
  });

  it("does not invent a session or 5h window for a weekly-only summary", () => {
    expect(parseQuotaData("antigravity", { quotas: {
      argon_weekly: quota(98, "Gemini 4 Argon (Weekly)", WEEKLY_RESET),
    } })).toEqual([{
      modelKey: "argon_weekly",
      name: "Gemini 4 Argon (Weekly)",
      used: 20,
      total: 1000,
      remainingPercentage: 98,
      resetAt: WEEKLY_RESET,
    }]);
  });

  it("omits unknown/invalid rows rather than rendering free, unlimited, or zero quota", () => {
    const rows = parseQuotaData("antigravity", { quotas: {
      argon_weekly: { displayName: "Gemini 4 Argon (Weekly)", resetAt: WEEKLY_RESET },
      argon_session: { remainingPercentage: null },
      "gemini-4-argon-low": { remainingPercentage: "invalid" },
      "gemini-4-argon-medium": quota(0, "Gemini 4 Argon (Medium)", SESSION_RESET),
    } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ modelKey: "gemini-4-argon-medium", used: 1000, total: 1000, remainingPercentage: 0 });
  });

  it("normalizes percentage-only known quota without claiming an unknown token count", () => {
    const rows = parseQuotaData("antigravity", { quotas: {
      argon_weekly: { displayName: "Gemini 4 Argon (Weekly)", remainingPercentage: 98, resetAt: WEEKLY_RESET },
    } });
    expect(rows).toEqual([{
      modelKey: "argon_weekly",
      name: "Gemini 4 Argon (Weekly)",
      used: 20,
      total: 1000,
      remainingPercentage: 98,
      resetAt: WEEKLY_RESET,
    }]);
  });

  it("preserves existing Claude and Gemini per-model data and unrelated provider output", () => {
    expect(parseQuotaData("antigravity", { quotas: {
      "gemini-pro-agent": { used: 200, total: 1000, displayName: "Gemini Pro" },
      "claude-opus-4-6-thinking": { used: 100, total: 1000, displayName: "Claude Opus" },
    } })).toEqual([
      { modelKey: "gemini-pro-agent", name: "Gemini Pro", used: 200, total: 1000, remainingPercentage: undefined, resetAt: null },
      { modelKey: "claude-opus-4-6-thinking", name: "Claude Opus", used: 100, total: 1000, remainingPercentage: undefined, resetAt: null },
    ]);
    expect(parseQuotaData("github", { quotas: { premium: { used: 3, total: 100 } } })).toEqual([{ name: "premium", used: 3, total: 100, resetAt: null }]);
    expect(parseQuotaData("antigravity", { message: "Quota unavailable" })).toEqual([]);
  });
});
