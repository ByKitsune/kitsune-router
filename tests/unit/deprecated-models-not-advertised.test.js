// A model its own registry entry marks `deprecated: true` must not be advertised.
//
// Found while auditing deprecation across every provider, as requested. The flag
// existed and was well documented, but was consumed ONLY by the dashboard UI —
// grep for `deprecated` across src/ and open-sse/ returned no filter on the
// /v1/models path at all.
//
// Reproduced on an isolated DATA_DIR with a single active `deepseek` connection:
// /v1/models returned 6 deepseek rows including deepseek/deepseek-v4-flash and
// deepseek/deepseek-v4-flash-vision-exp, both of which carry
// `deprecated: true` and a "Compatibility alias served by DeepSeek V4.1 Flash"
// notice. A consumer like ByKitsune would therefore offer a retired model.
//
// Note the distinction this test also protects: `deprecated: true` on a PROVIDER
// record means RISK_NOTICE (a subscription/OAuth ToS warning), which must NOT
// hide that provider's models. Only a per-model flag is filtered.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const REGISTRY = join(ROOT, "open-sse/providers/registry");
const ROUTE = readFileSync(join(ROOT, "src/app/api/v1/models/route.js"), "utf8");

// Every model-level deprecation declared in the registry, with its provider.
function declaredDeprecations() {
  const out = [];
  for (const file of readdirSync(REGISTRY).filter((f) => f.endsWith(".js"))) {
    const src = readFileSync(join(REGISTRY, file), "utf8");
    const re = /\{[^{}]*?id:\s*"([^"]+)"[^{}]*?deprecated:\s*true[^{}]*?\}/g;
    let m;
    while ((m = re.exec(src))) out.push({ provider: file.replace(".js", ""), id: m[1] });
  }
  return out;
}

describe("the catalog filters model-level deprecation", () => {
  it("the /v1/models route consults the deprecated flag", () => {
    // Guards against the flag silently becoming UI-only again.
    expect(ROUTE).toMatch(/deprecated\s*===\s*true/);
    expect(ROUTE).toMatch(/isDeprecated/);
  });

  it("skips a deprecated model before building its entry", () => {
    const idx = ROUTE.indexOf("isDeprecated");
    const buildIdx = ROUTE.indexOf("const model = {");
    expect(idx).toBeGreaterThan(-1);
    expect(buildIdx).toBeGreaterThan(idx);
  });

  it("never filters a model the operator declared themselves", () => {
    // An explicit custom declaration outranks a built-in deprecation.
    expect(ROUTE).toMatch(/isDeprecated\s*&&\s*!isCustomDeclared/);
    expect(ROUTE).toMatch(/customRows\.has\(modelId\)/);
  });
});

describe("the deprecation inventory is real, not hypothetical", () => {
  const found = declaredDeprecations();

  it("finds the entries this fix was written for", () => {
    const ids = found.map((f) => f.id);
    expect(ids).toContain("deepseek-v4-flash");
    expect(ids).toContain("deepseek-v4-flash-vision-exp");
  });

  it("covers more than one provider, so the fix is not single-case", () => {
    const providers = new Set(found.map((f) => f.provider));
    expect(providers.size).toBeGreaterThan(1);
  });

  it("every declared deprecation is a plausible model id", () => {
    for (const { id } of found) {
      expect(id, id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/);
    }
  });

  it("records why the retired entries were kept in the registry", () => {
    // They are retained so a stored combo still resolves; the fix removes them
    // from the ADVERTISED list only.
    const src = readFileSync(join(REGISTRY, "deepseek.js"), "utf8");
    expect(src).toMatch(/legacy id/i);
  });
});

describe("provider-level deprecation is not confused with model-level", () => {
  it("a provider carrying RISK_NOTICE keeps its models listed", () => {
    // claude/codex/antigravity/kiro/github/gemini-cli declare
    // `deprecated: true` at PROVIDER level with deprecationNotice RISK_NOTICE.
    // That is a ToS warning, not a retirement — hiding their models would be a
    // severe regression (cx/ alone carries 19 models).
    const src = readFileSync(join(REGISTRY, "codex.js"), "utf8");
    expect(src).toMatch(/deprecationNotice:\s*"RISK_NOTICE"/);
    // The filter must key off a row's own `deprecated`, never the provider's.
    expect(ROUTE).toMatch(/row\?\.deprecated\s*===\s*true/);
  });

  it("does not treat a missing flag as deprecated", () => {
    // An absent flag must be falsy so normal models are never filtered.
    expect(ROUTE).not.toMatch(/deprecated\s*!==\s*false/);
    expect(ROUTE).not.toMatch(/!\s*row\?\.deprecated\s*\|\|/);
  });
});
