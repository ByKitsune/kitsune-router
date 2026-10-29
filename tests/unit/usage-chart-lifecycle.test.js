import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");
const filename = fileURLToPath(new URL("../../src/app/(dashboard)/dashboard/usage/components/UsageChart.js", import.meta.url));
const code = babel.transformSync(readFileSync(filename, "utf8"), {
  filename, babelrc: false, configFile: false,
  presets: [[require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
  plugins: [require("next/dist/compiled/babel/plugin-transform-modules-commonjs")],
}).code;

// Request ordering and aborts are exercised through the parent dashboard's
// synthetic browser tests. This fixture checks the chart's rendered contract.
function fixture({ reducedMotion = false } = {}) {
  const slots = [];
  let cursor = 0;
  let props = {
    period: "today", periodLabel: "Today", snapshot: null, snapshotPeriodLabel: "",
    error: null, fetching: true, onRetry: vi.fn(),
  };
  let tree;
  const hooks = {
    memo: component => component,
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], value => { slots[slot] = value; }];
    },
    useId() {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = `:chart-${slot}:`;
      return slots[slot];
    },
  };
  const jsx = (type, properties) => ({ type, props: properties || {} });
  const fixtureModule = { exports: {} };
  vm.runInNewContext(code, {
    module: fixtureModule, exports: fixtureModule.exports,
    fetch: () => { throw new Error("The chart must not make independent requests"); },
    require(id) {
      if (id === "react") return hooks;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (id === "prop-types") return require(id);
      if (id === "motion/react") return { useReducedMotion: () => reducedMotion };
      if (id === "@/shared/components/Card") return { __esModule: true, default: "Card" };
      if (id === "recharts") return Object.fromEntries(["AreaChart", "Area", "XAxis", "YAxis", "CartesianGrid", "Tooltip", "ResponsiveContainer"].map(name => [name, name]));
      throw new Error(`Unexpected fixture import: ${id}`);
    },
  }, { filename });
  const render = (updates = {}) => {
    props = { ...props, ...updates };
    cursor = 0;
    tree = fixtureModule.exports.default(props);
    return tree;
  };
  return {
    render, props: () => props,
    metric(label) {
      nodes(tree).find(node => node.type === "button" && text(node) === label).props.onClick();
      return render();
    },
  };
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object" ? text(tree.props?.children) : String(tree);
}
function widget(tree, type) { return nodes(tree).find(node => node.type === type); }
const sample = [{ label: "09:00", tokens: 1200, cost: 0.012 }];

describe("UsageChart controlled snapshot rendering", () => {
  it("reports initial loading without making its own request", () => {
    const chart = fixture();
    const tree = chart.render();
    expect(widget(tree, "Card").props["aria-busy"]).toBe(true);
    expect(text(tree)).toContain("Loading your activity");
    expect(widget(tree, "AreaChart")).toBeUndefined();
  });

  it("retains and labels the previous plot while the selected period loads", () => {
    const chart = fixture();
    const tree = chart.render({ period: "30d", periodLabel: "30D", snapshot: { period: "today", data: sample }, snapshotPeriodLabel: "Today" });
    expect(widget(tree, "AreaChart").props.data).toEqual(sample);
    expect(widget(tree, "Card").props["aria-busy"]).toBe(true);
    expect(text(tree)).toContain("Showing Today chart data while 30D loads.");
  });

  it("keeps and labels a last-successful plot on failure and exposes retry", () => {
    const chart = fixture();
    const tree = chart.render({ period: "7d", periodLabel: "7D", snapshot: { period: "today", data: sample }, snapshotPeriodLabel: "Today", fetching: false, error: { message: "Please retry." } });
    expect(widget(tree, "AreaChart").props.data).toEqual(sample);
    expect(text(tree)).toContain("Showing last successful Today data.");
    expect(nodes(tree).some(node => node.props.role === "alert")).toBe(true);
    nodes(tree).find(node => node.type === "button" && text(node) === "Retry chart").props.onClick();
    expect(chart.props().onRetry).toHaveBeenCalledOnce();
  });

  it("shows an error instead of an empty success when no snapshot exists", () => {
    const tree = fixture().render({ fetching: false, error: { message: "Please retry." } });
    expect(text(tree)).toContain("Chart data is unavailable.");
    expect(nodes(tree).some(node => node.props.role === "alert")).toBe(true);
  });

  it("replaces the plot on a new snapshot and keeps gradient identity stable", () => {
    const chart = fixture();
    const first = chart.render({ snapshot: { period: "today", data: sample }, snapshotPeriodLabel: "Today", fetching: false });
    const gradient = widget(first, "linearGradient").props.id;
    const weekly = [{ label: "Mon", tokens: 7000, cost: 0.07 }];
    const next = chart.render({ period: "7d", periodLabel: "7D", snapshot: { period: "7d", data: weekly }, snapshotPeriodLabel: "7D" });
    expect(widget(next, "AreaChart").props.data).toEqual(weekly);
    expect(widget(next, "linearGradient").props.id).toBe(gradient);
    expect(text(next)).not.toContain("while 7D loads");
  });

  it("distinguishes an empty selected period from a loading state", () => {
    const tree = fixture().render({ snapshot: { period: "today", data: [] }, snapshotPeriodLabel: "Today", fetching: false });
    expect(text(tree)).toContain("No data for Today");
  });

  it("preserves unknown-cost gaps and zero charges while honoring reduced motion", () => {
    const chart = fixture({ reducedMotion: true });
    const incomplete = [{ label: "09:00", tokens: 10, cost: 0.1 }, { label: "10:00", tokens: 10, cost: null }, { label: "11:00", tokens: 10, cost: 0 }];
    chart.render({ snapshot: { period: "today", data: incomplete }, snapshotPeriodLabel: "Today", fetching: false });
    const tree = chart.metric("Cost");
    const area = widget(tree, "Area");
    expect(area.props.dataKey).toBe("cost");
    expect(area.props.connectNulls).toBe(false);
    expect(area.props.isAnimationActive).toBe(false);
    expect(widget(tree, "AreaChart").props.data).toEqual(incomplete);
    const tooltip = widget(tree, "Tooltip");
    expect(tooltip.props.filterNull).toBe(false);
    expect(tooltip.props.formatter(null)).toEqual(["Not specified", "Estimated cost"]);
    expect(tooltip.props.formatter(0)).toEqual(["$0.0000", "Estimated cost"]);
    expect(text(tree)).toContain("Gaps indicate unspecified pricing");
  });
});
