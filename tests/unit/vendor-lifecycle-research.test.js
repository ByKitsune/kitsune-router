import { describe, it, expect } from "vitest";
import deepseek from "../../open-sse/providers/registry/deepseek.js";
import mimo from "../../open-sse/providers/registry/xiaomi-mimo.js";
import tokenplan from "../../open-sse/providers/registry/xiaomi-tokenplan.js";
import sonar from "../../open-sse/providers/registry/perplexity.js";

describe("vendor documented lifecycle compatibility", () => {
  it("keeps retired DeepSeek IDs as deprecated aliases to Flash", () => {
    for (const id of ["deepseek-v4-flash", "deepseek-v4-flash-vision-exp"]) {
      expect(deepseek.models.find((m) => m.id === id)).toMatchObject({ deprecated: true, upstreamModelId: "deepseek-flash" });
    }
  });
  it("stops advertising MiMo retired IDs while retaining their historical identities", () => {
    for (const provider of [mimo, tokenplan]) {
      for (const id of ["mimo-v2.5-pro", "mimo-v2.5"]) {
        expect(provider.models.find((m) => m.id === id)).toMatchObject({ deprecated: true, deprecationDate: "2026-10-21T10:00:00+08:00" });
      }
    }
  });
  it("retains Sonar compatibility while marking the ended standalone surface", () => {
    for (const model of sonar.models) expect(model.deprecated).toBe(true);
  });
});
