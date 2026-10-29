import { describe, expect, it } from "vitest";
import { fmt, fmtCompact, fmtCost } from "@/shared/utils/format.js";

describe("compact notation for token counts (#3747)", () => {
  it("formats counts under 100k with standard locale formatting", () => {
    expect(fmtCompact(0)).toBe("0");
    expect(fmtCompact(500)).toBe("500");
    expect(fmtCompact(99999)).toBe(fmt(99999));
  });

  it("formats counts >= 100k using compact en-US notation", () => {
    expect(fmtCompact(100000)).toBe("100K");
    expect(fmtCompact(250000)).toBe("250K");
    expect(fmtCompact(1500000)).toBe("1.5M");
    expect(fmtCompact(2000000000)).toBe("2B");
  });

  it("handles null or undefined values gracefully", () => {
    expect(fmtCompact(null)).toBe("0");
    expect(fmtCompact(undefined)).toBe("0");
  });
});

describe("usage cost formatting", () => {
  it("distinguishes an unknown cost from a genuinely free request", () => {
    expect(fmtCost(null)).toBe("Not specified");
    expect(fmtCost(0)).toBe("$0.00");
  });

  it("preserves recorded numeric costs without presenting missing or invalid data as free", () => {
    expect(fmtCost(12.34)).toBe("$12.34");
    for (const value of [undefined, NaN, Infinity, -Infinity, -1, "0"]) expect(fmtCost(value)).toBe("Not specified");
  });
});
