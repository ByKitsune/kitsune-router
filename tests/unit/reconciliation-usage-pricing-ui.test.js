import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as formatting from "../../src/shared/utils/format.js";
import * as costs from "../../src/shared/utils/cost.js";
import { translate } from "../../src/i18n/runtime.js";

const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");

function component(relativePath, extra = "") {
  const filename = fileURLToPath(new URL(relativePath, import.meta.url));
  const code = babel.transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
    plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
  }).code;
  const fixtureModule = { exports: {} };
  vm.runInNewContext(code + extra, {
    module: fixtureModule, exports: fixtureModule.exports, console,
    require(id) {
      if (id === "react") return React;
      if (id === "@/i18n/runtime") return { translate };
      if (id === "react/jsx-runtime") return require(id);
      if (id === "prop-types") return require(id);
      if (id === "@/shared/utils/format") return formatting;
      if (id === "@/shared/utils/cost.js") return costs;
      if (id === "@/shared/components/UsageCost") return component("../../src/shared/components/UsageCost.js");
      if (id === "next/dynamic") return () => () => null;
      if (id === "next/navigation") return {};
      if (id === "@/shared/constants/providers") return { AI_PROVIDERS: {}, FREE_PROVIDERS: {} };
      if (id.endsWith("UsageTable")) return formatting;
      return { __esModule: true, default: ({ children }) => React.createElement("section", null, children) };
    },
  }, { filename });
  return fixtureModule.exports;
}

const UsageTable = component("../../src/app/(dashboard)/dashboard/usage/components/UsageTable.js").default;
const UsageCost = component("../../src/shared/components/UsageCost.js").default;
const OverviewCards = component("../../src/app/(dashboard)/dashboard/usage/components/OverviewCards.js").default;
// Exercise the existing real aggregation functions without adding test-only
// exports or reproducing their implementation in a fixture.
const { groupDataByKey, sortData } = component("../../src/shared/components/UsageStats.js",
  "\nmodule.exports.groupDataByKey = groupDataByKey; module.exports.sortData = sortData;");

function renderCosts(summary) {
  return renderToStaticMarkup(React.createElement(UsageTable, {
    title: "Usage by Model", columns: [{ field: "rawModel", label: "Model" }],
    groupedData: [{ groupKey: "gpt-6.1-sol", summary, items: [] }],
    tableType: "model", sortBy: "rawModel", sortOrder: "asc", onToggleSort() {},
    viewMode: "costs", storageKey: "synthetic-usage-test",
    renderSummaryCells: () => null, renderDetailCells: () => null, emptyMessage: "No usage",
  }));
}

describe("usage costs retain known estimates beside unpriced requests", () => {
  it("shows a verified subtotal instead of hiding all Standard costs behind an unknown Auto row", () => {
    const html = renderCosts({
      inputCost: null, cachedCost: 0.25, outputCost: null, totalCost: null,
      costCoverage: {
        inputCost: { knownCost: 2.5, unknownRequests: 2 },
        cachedCost: { knownCost: 0.25, unknownRequests: 0 },
        outputCost: { knownCost: 0.75, unknownRequests: 2 },
        totalCost: { knownCost: 3.5, unknownRequests: 2 },
      },
    });
    expect(html).toContain("$3.50");
    expect(html).toContain("known subtotal");
    expect(html).toContain("2 unpriced");
    expect(html).not.toContain("$0.00");
  });

  it("does not present zero known estimates as a complete free total", () => {
    const html = renderCosts({
      inputCost: null, cachedCost: 0, outputCost: null, totalCost: null,
      costCoverage: { totalCost: { knownCost: 0, unknownRequests: 5 } },
    });
    expect(html).toContain("5 unpriced");
    expect(html).toContain("Not specified");
  });

  it("keeps absent and invalid costs unknown, including available known subtotals", () => {
    for (const value of [undefined, NaN, Infinity, -1]) {
      const html = renderToStaticMarkup(React.createElement(UsageCost, { value }));
      expect(html).toContain("Not specified");
      expect(html).not.toContain("$0.00");
    }
    const subtotal = renderToStaticMarkup(React.createElement(UsageCost, { coverage: { knownCost: 1.75, unknownRequests: 3 } }));
    expect(subtotal).toContain("$1.75");
    expect(subtotal).toContain("known subtotal");
    expect(subtotal).toContain("3 unpriced");
  });

  it("does not let a numeric legacy summary hide its explicit unpriced coverage", () => {
    const html = renderToStaticMarkup(React.createElement(UsageCost, { value: 3.5, coverage: { knownCost: 3.5, unknownRequests: 2 } }));
    expect(html).toContain("$3.50");
    expect(html).toContain("known subtotal");
    expect(html).toContain("2 unpriced");
    expect(html).not.toContain("local estimate");
  });

  it("keeps genuine free and sub-cent paid charges visibly different", () => {
    expect(formatting.fmtCost(0)).toBe("$0.00");
    expect(formatting.fmtCost(0.00032625)).toBe("<$0.01");
    expect(formatting.fmtCost(null)).toBe("Not specified");
  });

  it("preserves uncertainty when historical daily summaries no longer contain their known subtotal", () => {
    const html = renderCosts({ totalCost: null, costCoverage: { totalCost: { knownCost: null, unknownRequests: null } } });
    expect(html).toContain("Not specified");
    expect(html).not.toContain("known subtotal");
    expect(html).not.toContain("0 unpriced");
  });

  it("merges coverage across provider rows without turning the nullable total into a partial invoice", () => {
    const rows = sortData({
      standard: { rawModel: "gpt-6.1-sol", provider: "codex", requests: 10, promptTokens: 1000, completionTokens: 10,
        cost: null, inputCost: null, cachedCost: 0.25, outputCost: null,
        costCoverage: { totalCost: { knownCost: 3.5, unknownRequests: 2 } } },
      compatible: { rawModel: "gpt-6.1-sol", provider: "custom", requests: 3, promptTokens: 100, completionTokens: 1,
        cost: 1.5, inputCost: 1, cachedCost: 0, outputCost: 0.5,
        costCoverage: { totalCost: { knownCost: 1.5, unknownRequests: 0 } } },
    }, {}, "rawModel", "asc");
    const groups = groupDataByKey(rows, "rawModel", "rawModel", "asc");
    expect(groups).toHaveLength(1);
    expect(groups[0].summary.totalCost).toBeNull();
    expect(groups[0].summary).toHaveProperty("costCoverage.totalCost", { knownCost: 5, unknownRequests: 2 });
  });

  it("shows the same incomplete known estimate in the overview card and usage table", () => {
    const html = renderToStaticMarkup(React.createElement(OverviewCards, { stats: {
      totalRequests: 12, totalCost: null, costCoverage: { totalCost: { knownCost: 3.5, unknownRequests: 2 } },
    } }));
    expect(html).toContain("$3.50");
    expect(html).toContain("known subtotal");
    expect(html).toContain("2 unpriced");
    expect(html).toContain("not actual billing");
  });
});
