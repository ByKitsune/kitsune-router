import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { getCapabilitiesForModel, withDeclaredCapabilities } from "../../open-sse/providers/capabilities.js";
import { getPublicModelMetadata, getReviewedModelMetadata } from "../../open-sse/providers/metadata/reviewed.js";
import { getCapabilityVerification, hasPrimaryCapabilityAuthority } from "../../open-sse/providers/metadata/modelsDevCapabilityResolution.js";
import { canonicalizeProviderId } from "../../open-sse/providers/identity.js";
import { CAPACITY_META } from "../../src/shared/constants/models.js";

const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");
function load(relative, dependencies = {}, extra = "") {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const code = babel.transformSync(`${readFileSync(filename, "utf8")}\n${extra}`, {
    filename, babelrc: false, configFile: false,
    presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
    plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
  }).code;
  const jsx = (type, props) => ({ type, props: props || {} });
  const fixtureModule = { exports: {} };
  vm.runInNewContext(code, {
    module: fixtureModule, exports: fixtureModule.exports,
    require(id) {
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      throw new Error(`Unexpected presentation dependency: ${id}`);
    },
  }, { filename });
  return fixtureModule.exports;
}
const badge = load("../../src/shared/components/CapacityBadges.js", {
  "@/shared/constants/models": { CAPACITY_META }, "./Tooltip": { default: "Tooltip" },
}).default;
const hook = load("../../src/shared/hooks/useModelCaps.js", {
  react: {},
  "open-sse/providers/capabilities.js": { getCapabilitiesForModel },
  "open-sse/providers/identity.js": { canonicalizeProviderId },
  "open-sse/providers/metadata/reviewed.js": { getReviewedModelMetadata },
  "open-sse/providers/metadata/modelsDevCapabilityResolution.js": { getCapabilityVerification },
}, "export { buildMaps, resolveCaps };");
function content(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(content).join(" ");
  return content(node.props?.children);
}

describe("reference provenance is not verified model support", () => {
  it("keeps legacy admission defaults but labels an unknown model's tools as inferred", () => {
    const caps = getCapabilitiesForModel("private-endpoint", "private-model");
    expect(caps.tools).toBe(true);
    const metadata = getPublicModelMetadata("private-endpoint", "private-model", caps);
    expect(metadata.capabilityVerification.tools).toMatchObject({ kind: "inferred", authenticatedRouteVerified: false });
    expect(metadata.capabilityVerification.contextWindow.kind).toBe("unknown");
  });

  it("does not promote old catalog facts when a pricing review appends its URL", () => {
    const record = { capabilities: { vision: false }, limits: { scope: "exact-route-modelsdev-catalog" }, sources: ["https://example.com/pricing"] };
    expect(hasPrimaryCapabilityAuthority(record, "vision")).toBe(false);
    expect(hasPrimaryCapabilityAuthority({ ...record, limits: { ...record.limits, fieldSources: { vision: "https://example.com/model-spec" } } }, "vision")).toBe(true);
    expect(getCapabilitiesForModel("siliconflow", "Qwen/Qwen3.5-122B-A10B").vision).toBe(true);
    expect(getCapabilitiesForModel("ollama", "glm-5.3-flash")).toMatchObject({ pdf: false, structuredOutput: false });
    expect(getCapabilitiesForModel("together", "moonshotai/Kimi-K3").videoInput).toBe(false);
  });

  it("keeps native API route limits distinct from architecture and ambiguous aliases", () => {
    expect(getCapabilitiesForModel("mistral", "ministral-3b-2512").contextWindow).toBe(131072);
    expect(getReviewedModelMetadata("mistral", "ministral-3b-2512").limits.architectureContextWindow).toBe(262144);
    expect(getCapabilitiesForModel("mistral", "codestral-latest").contextWindow).toBeNull();
    expect(getReviewedModelMetadata("mistral", "codestral-latest").limits.contextWindowConflict)
      .toMatchObject({ catalog: 256000, documentedBase: 128000 });
  });

  it.each(["grok-4.20-multi-agent-0309", "grok-4.20-multi-agent"])("keeps %s client tools conditional and preserves an operator beta declaration", model => {
    const caps = getCapabilitiesForModel("xai", model);
    expect(caps.tools).toBeNull();
    expect(caps.search).toBe(true);
    const metadata = getPublicModelMetadata("xai", model, caps);
    expect(metadata.capabilityVerification.tools.kind).toBe("unknown");
    expect(metadata.limits.conditionalCapabilities.tools).toMatchObject({ status: "account-beta-required", api: "responses", operatorOverrideSupported: true });
    const declared = { tools: true };
    const entitled = withDeclaredCapabilities(caps, declared, "xai", model);
    expect(entitled.tools).toBe(true);
    expect(getPublicModelMetadata("xai", model, entitled, declared).capabilityVerification.tools.kind).toBe("operator-declared");
  });

  it("carries server provenance through the shared hook cache and provider aliases", () => {
    const verification = { vision: { kind: "catalog-reference" } };
    const maps = hook.buildMaps([{ fullModel: "ag/sample", routedModel: "mine/sample", model: "sample", caps: { vision: true }, metadata: { capabilityVerification: verification } }]);
    expect(maps.byFull["antigravity/sample"].capabilityVerification).toEqual(verification);
    expect(maps.byFull["mine/sample"].capabilityVerification).toEqual(verification);
    expect(maps.byId.sample.capabilityVerification).toEqual(verification);
    expect(hook.resolveCaps({}, {}, "private-endpoint/private-model").capabilityVerification.tools.kind).toBe("inferred");
  });

  it.each([
    ["inferred", "Inferred capability"], ["catalog-reference", "Provider model reference"], ["operator-declared", "Operator-declared capability"],
  ])("distinguishes the %s badge without inventing support or concatenating translated messages", (kind, message) => {
    const tree = badge({ caps: { vision: true, reasoning: false, capabilityVerification: { vision: { kind } } } });
    const hints = tree.props.children.filter(Boolean);
    expect(hints).toHaveLength(1);
    expect(content(hints[0].props.text)).toContain(message);
    expect(hints[0].props.children.props["data-capability-confidence"]).toBe(kind);
    expect(hints[0].props.children.props.role).toBe("img");
    expect(hints[0].props.children.props["aria-label"]).toBe("Vision");
    expect(badge({ caps: { vision: false, reasoning: false } })).toBeNull();
  });
});
