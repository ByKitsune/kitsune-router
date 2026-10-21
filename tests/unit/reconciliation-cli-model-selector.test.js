import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const filename = new URL("../../cli/src/cli/utils/modelSelector.js", import.meta.url);
const source = readFileSync(filename, "utf8");

// Exercise the unmodified CommonJS module; only its API and terminal boundaries
// are synthetic, so these tests cannot read host CLI credentials or prompt stdin.
function loadSelector({ models = [], connections = [], answers = [], modelsSuccess = true, providersSuccess = true } = {}) {
  const fixtureModule = { exports: {} };
  const output = [];
  const pendingAnswers = [...answers];
  const context = vm.createContext({
    module: fixtureModule,
    exports: fixtureModule.exports,
    console: { log: (...args) => output.push(args.join(" ")) },
    require(name) {
      if (name === "../api/client") return {
        getAvailableModels: async () => ({ success: modelsSuccess, data: { object: "list", data: models } }),
        getProviders: async () => ({ success: providersSuccess, data: { connections } }),
      };
      if (name === "./input") return {
        prompt: async () => {
          if (!pendingAnswers.length) throw new Error("Unexpected terminal prompt");
          return pendingAnswers.shift();
        },
      };
      if (name === "./display") return { clearScreen() {} };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const originalPrototype = vm.runInContext("Object.getOwnPropertyDescriptors(Object.prototype)", context);
  vm.runInContext(source, context, { filename: filename.pathname });
  return {
    selector: fixtureModule.exports,
    output,
    expectUnchangedPrototype() {
      expect(vm.runInContext("Object.getOwnPropertyDescriptors(Object.prototype)", context)).toEqual(originalPrototype);
    },
  };
}

describe("reconciliation G05: actual CLI model picker prototype names (#4833)", () => {
  it.each(["constructor", "toString", "__proto__", "valueOf"])("groups the allowed custom prefix %s without treating inherited properties as arrays", async (prefix) => {
    const fixture = loadSelector({
      models: [
        { id: `${prefix}/first`, owned_by: prefix },
        { id: "normal/first", owned_by: "normal" },
        { id: `${prefix}/second`, owned_by: prefix },
      ],
      connections: [
        { provider: "openai-compatible-fixture", providerSpecificData: { prefix } },
        { provider: "normal", isActive: true },
      ],
    });

    const { combos, groups } = await fixture.selector.getAvailableModelsGrouped();
    expect(combos).toEqual([]);
    expect(Object.keys(groups)).toEqual([prefix, "normal"]);
    expect(Object.hasOwn(groups, prefix)).toBe(true);
    expect(groups[prefix]).toEqual([`${prefix}/first`, `${prefix}/second`]);
    expect(groups.normal).toEqual(["normal/first"]);
    fixture.expectUnchangedPrototype();
  });

  it.each(["constructor", "toString", "__proto__", "valueOf"])("renders the literal %s group name and selects its model", async (prefix) => {
    const fixture = loadSelector({
      models: [
        { id: `${prefix}/model`, owned_by: prefix },
        { id: "cc/fixture", owned_by: "cc" },
        { id: "fixture-combo", owned_by: "combo" },
      ],
      connections: [
        { provider: "openai-compatible-fixture", providerSpecificData: { prefix }, isActive: true },
        { provider: "claude", isActive: true },
      ],
      answers: ["3"],
    });

    expect(await fixture.selector.selectModelFromList("Fixture models", "cc/fixture")).toBe(`${prefix}/model`);
    expect(fixture.output.filter(line => line.startsWith("["))).toEqual(["[Combos]", "[Claude Code]", `[${prefix}]`]);
    expect(fixture.output).toContain(`  3. ${prefix}/model`);
    expect(fixture.output).toContain("Current: cc/fixture\n");
    fixture.expectUnchangedPrototype();
  });

  it("keeps active aliases, no-auth providers and combos while filtering inactive and unconnected groups", async () => {
    const { selector } = loadSelector({
      models: [
        { id: "inactive/model", owned_by: "inactive" },
        { id: "constructor/disabled", owned_by: "constructor" },
        { id: "missing/model", owned_by: "missing" },
        { id: "cc/first", owned_by: "cc" },
        { id: "oc/free", owned_by: "oc" },
        { id: "fixture-combo", owned_by: "combo" },
        { id: "normal/model", owned_by: "normal" },
        { id: "opencode/free", owned_by: "opencode" },
        { id: "cc/second", owned_by: "cc" },
      ],
      connections: [
        { provider: "inactive", isActive: false },
        { provider: "custom-disabled", providerSpecificData: { prefix: "constructor" }, isActive: false },
        { provider: "claude", isActive: false },
        { provider: "claude", isActive: true },
        { provider: "normal" },
        { provider: "" },
      ],
    });

    expect(await selector.getAvailableModelsGrouped()).toEqual({
      combos: ["fixture-combo"],
      groups: {
        cc: ["cc/first", "cc/second"],
        oc: ["oc/free"],
        normal: ["normal/model"],
        opencode: ["opencode/free"],
      },
    });
  });

  it("preserves combo-first, known-alias and custom insertion ordering", async () => {
    const fixture = loadSelector({
      models: [
        { id: "custom-z/first", owned_by: "custom-z" },
        { id: "openai/model", owned_by: "openai" },
        { id: "custom-a/model", owned_by: "custom-a" },
        { id: "cx/model", owned_by: "cx" },
        { id: "combo-first", owned_by: "combo" },
        { id: "cc/model", owned_by: "cc" },
        { id: "oc/free", owned_by: "oc" },
        { id: "combo-second", owned_by: "combo" },
        { id: "custom-z/second", owned_by: "custom-z" },
      ],
      connections: ["custom-z", "openai", "custom-a", "codex", "claude"].map(provider => ({ provider })),
      answers: ["8"],
    });

    expect(await fixture.selector.selectModelFromList("Ordered models")).toBe("custom-z/second");
    expect(fixture.output.filter(line => line.startsWith("[") || /^  \d+\. /.test(line))).toEqual([
      "[Combos]", "  1. combo-first", "  2. combo-second",
      "[Claude Code]", "  3. cc/model",
      "[OpenAI Codex]", "  4. cx/model",
      "[OpenCode Free]", "  5. oc/free",
      "[OpenAI]", "  6. openai/model",
      "[custom-z]", "  7. custom-z/first", "  8. custom-z/second",
      "[custom-a]", "  9. custom-a/model",
      "  0. Cancel\n",
    ]);
  });

  it("excludes combos without changing the selectable provider models", async () => {
    const fixture = loadSelector({
      models: [{ id: "fixture-combo", owned_by: "combo" }, { id: "oc/free", owned_by: "oc" }],
      answers: ["1"],
    });
    expect(await fixture.selector.selectModelFromList("Models only", "", { excludeCombos: true })).toBe("oc/free");
    expect(fixture.output).not.toContain("[Combos]");
  });

  it("retains only combos and no-auth models if connections cannot be loaded", async () => {
    const { selector } = loadSelector({
      models: [{ id: "cc/model", owned_by: "cc" }, { id: "fixture-combo", owned_by: "combo" }, { id: "oc/free", owned_by: "oc" }],
      connections: [{ provider: "claude" }],
      providersSuccess: false,
    });
    expect(await selector.getAvailableModelsGrouped()).toEqual({ combos: ["fixture-combo"], groups: { oc: ["oc/free"] } });
  });

  it("returns an empty list when model loading fails", async () => {
    const { selector } = loadSelector({ modelsSuccess: false });
    expect(await selector.getAvailableModelsGrouped()).toEqual({ combos: [], groups: {} });
  });

  it("retains manual model entry when there are no connected models", async () => {
    const { selector, output } = loadSelector({ answers: [" m ", " constructor/custom "] });
    expect(await selector.selectModelFromList("Empty models")).toBe("constructor/custom");
    expect(output).toContain("\n  No connected providers found.");
  });

  it.each(["0", "-1", "2", "not-a-number"])("cancels an invalid populated-list selection %s", async (answer) => {
    const { selector } = loadSelector({ models: [{ id: "oc/free", owned_by: "oc" }], answers: [answer] });
    expect(await selector.selectModelFromList("Models")).toBeNull();
  });
});
