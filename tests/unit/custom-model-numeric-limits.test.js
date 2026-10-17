import { beforeEach, describe, expect, it, vi } from "vitest";

const saved = vi.hoisted(() => ({ rows: [], invalidate: vi.fn() }));
vi.mock("@/models", () => ({
  getCustomModels: async () => saved.rows,
  addCustomModel: async row => { saved.rows.push(row); return true; },
  deleteCustomModel: vi.fn(),
}));
vi.mock("open-sse/providers/declaredCaps.js", () => ({ invalidateDeclaredModelCaps: saved.invalidate }));
import { GET, POST } from "@/app/api/models/custom/route.js";

beforeEach(() => { saved.rows.length = 0; saved.invalidate.mockClear(); });
const base = { providerAlias: "private-node", id: "vendor/model", type: "llm" };
async function post(fields) { return POST({ json: async () => ({ ...base, ...fields }) }); }

describe("custom model explicit token limits", () => {
  it("preserves separate total context, maximum input and output within caps", async () => {
    const caps = { contextWindow: 1050000, maxInput: 922000, maxOutput: 128000, vision: false };
    expect((await post({ caps })).status).toBe(200);
    const result = await (await GET()).json();
    expect(result.models[0].caps).toEqual(caps);
    expect(saved.invalidate).toHaveBeenCalledOnce();
  });

  it("accepts documented top-level numeric limit spellings without losing caps", async () => {
    expect((await post({ context_length: 500000, max_input_tokens: 460000, max_completion_tokens: 40000, caps: { vision: true } })).status).toBe(200);
    expect(saved.rows[0].caps).toEqual({ contextWindow: 500000, maxInput: 460000, maxOutput: 40000, vision: true });
  });

  it("persists context_window and max_output_tokens without conflating independent ceilings", async () => {
    expect((await post({ context_window: 500000, max_input_tokens: 460000, max_output_tokens: 40000, caps: { vision: false } })).status).toBe(200);
    const result = await (await GET()).json();
    expect(result.models[0].caps).toEqual({ contextWindow: 500000, maxInput: 460000, maxOutput: 40000, vision: false });
  });

  it("keeps explicit caps values ahead of equivalent top-level metadata", async () => {
    expect((await post({ contextWindow: 500000, caps: { contextWindow: 300000, maxOutput: 8000 } })).status).toBe(200);
    expect(saved.rows[0].caps).toEqual({ contextWindow: 300000, maxOutput: 8000 });
  });

  it("ignores invalid, zero, fractional and unknown capability values", async () => {
    expect((await post({ caps: { contextWindow: "1000000", maxInput: -1, maxOutput: 2.5, vision: false, reasoning: "yes", arbitrary: 20000 } })).status).toBe(200);
    expect(saved.rows[0].caps).toEqual({ vision: false });
    expect((await post({ maxOutput: 0, contextWindow: Infinity, maxInput: Number.MAX_SAFE_INTEGER + 1 })).status).toBe(200);
    expect(saved.rows[1].caps).toBeUndefined();
  });
});
