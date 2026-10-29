import { describe, expect, it } from "vitest";
import { aggregateComboCapabilities, getCapabilitiesForModel, withDeclaredCapabilities } from "../../open-sse/providers/capabilities.js";
import { COMMANDCODE_MAX_OUTPUT_TOKENS } from "../../open-sse/config/runtimeConfig.js";
import { CommandCodeExecutor } from "../../open-sse/executors/commandcode.js";
import commandcode from "../../open-sse/providers/registry/commandcode.js";
import { getComboTokenLimits } from "../../src/app/api/v1/models/comboLimits.js";

describe("CommandCode advertises its actual configured wire ceiling", () => {
  it.each(["commandcode", "cmc"])("keeps %s discovery and the executor clamp aligned", (provider) => {
    const advertised = getCapabilitiesForModel(provider, "deepseek/deepseek-v4-pro").maxOutput;
    const body = new CommandCodeExecutor().transformRequest("deepseek/deepseek-v4-pro", { params: { max_tokens: 384000 } });
    expect(advertised).toBe(COMMANDCODE_MAX_OUTPUT_TOKENS);
    expect(body.params.max_tokens).toBe(advertised);
  });

  it("applies that ceiling to operator-declared values but leaves unknown limits unknown", () => {
    const base = getCapabilitiesForModel("commandcode", "MiniMaxAI/MiniMax-M3");
    expect(base.maxOutput).toBeNull();
    expect(withDeclaredCapabilities(base, { maxOutput: 500000 }, "cmc", "MiniMaxAI/MiniMax-M3").maxOutput)
      .toBe(COMMANDCODE_MAX_OUTPUT_TOKENS);
    expect(withDeclaredCapabilities(base, { maxOutput: 32000 }, "cmc", "MiniMaxAI/MiniMax-M3").maxOutput).toBe(32000);
    expect(withDeclaredCapabilities(base, {}, "cmc", "MiniMaxAI/MiniMax-M3").maxOutput).toBeNull();
  });

  it("never advertises a configured CommandCode model above its executor ceiling", () => {
    for (const model of commandcode.models) {
      const cap = getCapabilitiesForModel(commandcode.id, model.id).maxOutput;
      expect(cap === null || cap <= COMMANDCODE_MAX_OUTPUT_TOKENS, model.id).toBe(true);
    }
  });

  it("does not impose CommandCode's transport restriction on a native vendor API", () => {
    expect(getCapabilitiesForModel("deepseek", "deepseek-v4.1-flash").maxOutput).toBe(393216);
  });
});

describe("combo UI and public discovery use a shared safe output limit", () => {
  const profiles = {
    "fixture/wide": { contextWindow: 1000000, maxOutput: 128000 },
    "fixture/small": { contextWindow: 200000, maxOutput: 32000 },
  };
  const resolveModel = (id) => profiles[id];

  it("does not claim the largest member output cap when another member cannot satisfy it", () => {
    const combo = { name: "fallback", models: Object.keys(profiles) };
    const advertised = getComboTokenLimits(combo, { combosByName: new Map(), modelAliases: {}, resolveModel });
    const ui = aggregateComboCapabilities(combo.models, null, resolveModel);
    expect(ui).toMatchObject({ contextWindow: 200000, maxOutput: 32000 });
    expect({ contextWindow: ui.contextWindow, maxOutput: ui.maxOutput }).toEqual(advertised);
  });

  it("preserves the same conservative rule through nested combos", () => {
    const nested = { name: "nested", models: Object.keys(profiles) };
    const combo = { name: "parent", models: ["nested", "fixture/wide"] };
    const advertised = getComboTokenLimits(combo, {
      combosByName: new Map([[nested.name, nested]]), modelAliases: {}, resolveModel,
    });
    const ui = aggregateComboCapabilities(combo.models, { nested: nested.models }, resolveModel);
    expect({ contextWindow: ui.contextWindow, maxOutput: ui.maxOutput }).toEqual(advertised);
    expect(ui.maxOutput).toBe(32000);
  });
});
