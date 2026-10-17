import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zen-literal-catalog-"));
process.env.DATA_DIR = dataDir;
let build, reader;
beforeAll(async () => {
  ({ build } = await import("../../src/lib/modelCatalog/sync.js"));
  reader = await import("../../open-sse/providers/catalogOverride.js");
});
afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));
const current = { contextWindow: 200000, maxOutput: 64000 };
function entry(model) { return { provider: "openrouter", model, current }; }
function publish(data, version = reader.CATALOG_VERSION) {
  fs.writeFileSync(path.join(dataDir, "model-catalog.json"), JSON.stringify({ v: version, ...data }));
  reader.invalidateCatalog();
}

describe("catalog literal provider/model identity", () => {
  it("does not import a direct API catalog into a distinct coding-plan route", () => {
    const model = "shared-plan-model";
    const facts = (context) => ({ models: { [model]: { limit: { context, output: 16000 }, modalities: { input: ["text"] } } } });
    const built = build({ moonshotai: facts(1000000), "kimi-code-plan-cn": facts(262144), zai: facts(1000000), "zai-coding-plan": facts(400000) }, [
      { provider: "kimi", model, current }, { provider: "glm", model, current },
    ]);
    expect(built.providers.kimi[model].contextWindow).toBe(262144);
    expect(built.providers.glm[model].contextWindow).toBe(400000);
  });
  it("keeps paid and free hosted routes separate regardless of iteration order", () => {
    const rows = [
      ["poolside/laguna-s-2.1:free", { modalities: { input: ["text"] }, limit: { context: 262144, output: 32768 } }],
      ["poolside/laguna-s-2.1", { modalities: { input: ["text", "image"] }, limit: { context: 1048576, output: 131072 } }],
    ];
    for (const ordered of [rows, [...rows].reverse()]) {
      const built = build({ openrouter: { models: Object.fromEntries(ordered) } }, rows.map(([id]) => entry(id)));
      expect(built.providers.openrouter[rows[0][0]]).toEqual({ contextWindow: 262144, maxOutput: 32768 });
      expect(built.providers.openrouter[rows[1][0]]).toEqual({ contextWindow: 1048576, maxOutput: 131072 });
      publish(built);
      expect(reader.getCatalogLimits("openrouter", rows[0][0]).maxOutput).toBe(32768);
      expect(reader.getCatalogModalities("openrouter", rows[0][0]).vision).toBe(false);
      expect(reader.getCatalogModalities("openrouter", rows[1][0]).vision).toBe(true);
    }
  });

  it("does not merge different vendor namespaces sharing a leaf ID", () => {
    const catalog = { openrouter: { models: {
      "vendor-a/shared": { limit: { context: 1000000, output: 128000 }, modalities: { input: ["text", "image"] } },
      "vendor-b/shared": { limit: { context: 32000, output: 8000 }, modalities: { input: ["text", "audio"] } },
    } } };
    const built = build(catalog, [entry("vendor-a/shared"), entry("vendor-b/shared"), entry("shared")]);
    expect(built.providers.openrouter["vendor-a/shared"].contextWindow).toBe(1000000);
    expect(built.providers.openrouter["vendor-b/shared"].contextWindow).toBe(32000);
    expect(built.providers.openrouter.shared).toBeUndefined();
    publish(built);
    expect(reader.getCatalogModalities("openrouter", "vendor-a/shared")).toMatchObject({ vision: true });
    expect(reader.getCatalogModalities("openrouter", "vendor-b/shared")).toMatchObject({ audioInput: true });
    expect(reader.getCatalogModalities("openrouter", "shared")).toBeNull();
    expect(reader.getCatalogModalities("openrouter", "vendor-c/shared")).toBeNull();
  });


  it("does not reuse a legacy normalized catalog after identity schema changes", () => {
    publish({ models: { "openrouter:shared": { vision: true } }, providers: { openrouter: { shared: { contextWindow: 900000 } } } }, 2);
    expect(reader.getCatalogModalities("openrouter", "shared")).toBeNull();
    expect(reader.getCatalogLimits("openrouter", "shared")).toBeNull();
  });
});
