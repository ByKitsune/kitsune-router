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

// Exercise the component's actual effects and handlers. Hook scheduling and
// Recharts are seams; requests deliberately ignore abort so stale responses
// cannot pass merely because a mock network happened to reject them.
function fixture({ reducedMotion = false } = {}) {
  const slots = [];
  const effects = [];
  const cleanups = new Map();
  const requests = [];
  let cursor = 0;
  let period = "today";
  let tree;
  let dirty = false;
  const hooks = {
    memo: (component) => component,
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], (next) => {
        const value = typeof next === "function" ? next(slots[slot]) : next;
        if (!Object.is(slots[slot], value)) { slots[slot] = value; dirty = true; }
      }];
    },
    useId() {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = `:chart-${slot}:`;
      return slots[slot];
    },
    useEffect(effect, deps) {
      const slot = cursor++;
      if (!(slot in slots) || deps.some((dep, index) => !Object.is(dep, slots[slot][index]))) {
        slots[slot] = deps;
        effects.push(() => {
          cleanups.get(slot)?.();
          cleanups.set(slot, effect());
        });
      }
    },
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  const fetch = vi.fn((url, options = {}) => new Promise((resolve, reject) => {
    requests.push({
      url, signal: options.signal,
      respond(data, status = 200) { resolve({ ok: status >= 200 && status < 300, status, json: async () => data }); },
      reject() { reject(new Error("Synthetic network failure")); },
    });
  }));
  const fixtureModule = { exports: {} };
  vm.runInNewContext(code, {
    module: fixtureModule, exports: fixtureModule.exports, fetch, console, AbortController,
    require(id) {
      if (id === "react") return hooks;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (id === "prop-types") return require(id);
      if (id === "motion/react") return { useReducedMotion: () => reducedMotion };
      if (id === "@/shared/components/Card") return { __esModule: true, default: "Card" };
      if (id === "recharts") return Object.fromEntries(["AreaChart", "Area", "XAxis", "YAxis", "CartesianGrid", "Tooltip", "ResponsiveContainer"].map((name) => [name, name]));
      throw new Error(`Unexpected fixture import: ${id}`);
    },
  }, { filename });
  const render = () => {
    cursor = 0;
    dirty = false;
    tree = fixtureModule.exports.default({ period });
    effects.splice(0).forEach((effect) => effect());
    return tree;
  };
  const flush = async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise(setImmediate);
      if (!dirty) return tree;
      render();
    }
    throw new Error("Chart effects did not settle");
  };
  return {
    requests, fetch, render, flush,
    mount: render,
    navigate(nextPeriod) { period = nextPeriod; return render(); },
    unmount() { cleanups.forEach((cleanup) => cleanup?.()); },
    async metric(label) {
      nodes(tree).find((node) => node.type === "button" && text(node) === label).props.onClick();
      return flush();
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
function widget(tree, type) { return nodes(tree).find((node) => node.type === type); }
const sample = [{ label: "09:00", tokens: 1200, cost: 0.012 }];

// These tests assert observable response order, loading/error state and rendered
// chart contracts rather than duplicating component state or counting hooks.
describe("UsageChart request lifecycle", () => {
  it("aborts an outdated period and ignores its response even if it arrives after the new period", async () => {
    const chart = fixture();
    chart.mount();
    chart.navigate("7d");
    expect(chart.requests.map((request) => request.url)).toEqual([
      "/api/usage/chart?period=today", "/api/usage/chart?period=7d",
    ]);
    expect(chart.requests[0].signal.aborted).toBe(true);
    expect(chart.requests[1].signal.aborted).toBe(false);
    const weekly = [{ label: "Mon", tokens: 7000, cost: 0.07 }];
    chart.requests[1].respond(weekly);
    let tree = await chart.flush();
    expect(widget(tree, "AreaChart").props.data).toEqual(weekly);
    chart.requests[0].respond(sample);
    tree = await chart.flush();
    expect(widget(tree, "AreaChart").props.data).toEqual(weekly);
    expect(widget(tree, "Card").props["aria-busy"]).toBe(false);
  });

  it("ignores an outdated network rejection after the current period has loaded", async () => {
    const chart = fixture();
    chart.mount();
    chart.navigate("7d");
    chart.requests[1].respond(sample);
    await chart.flush();
    chart.requests[0].reject();
    const tree = await chart.flush();
    expect(widget(tree, "AreaChart").props.data).toEqual(sample);
    expect(widget(tree, "Card").props["aria-busy"]).toBe(false);
    expect(text(tree)).not.toContain("Chart data is unavailable");
  });

  it("retains the previous plot during refresh and replaces it after the selected period resolves", async () => {
    const chart = fixture();
    chart.mount();
    chart.requests[0].respond(sample);
    await chart.flush();
    let tree = chart.navigate("30d");
    expect(widget(tree, "Card").props["aria-busy"]).toBe(true);
    expect(widget(tree, "AreaChart").props.data).toEqual(sample);
    expect(text(tree)).not.toContain("Loading your activity");
    const monthly = [{ label: "Oct", tokens: 30000, cost: 0.3 }];
    chart.requests[1].respond(monthly);
    tree = await chart.flush();
    expect(widget(tree, "Card").props["aria-busy"]).toBe(false);
    expect(widget(tree, "AreaChart").props.data).toEqual(monthly);
  });

  it.each(["http", "network"])("shows a visible %s failure instead of an empty or stale successful chart", async (failure) => {
    const chart = fixture();
    chart.mount();
    chart.requests[0].respond(sample);
    await chart.flush();
    chart.navigate("24h");
    if (failure === "http") chart.requests[1].respond({ error: "Synthetic upstream failure" }, 503);
    else chart.requests[1].reject();
    let tree = await chart.flush();
    expect(widget(tree, "AreaChart")).toBeUndefined();
    expect(nodes(tree).find((node) => node.props.role === "status")).toBeDefined();
    expect(text(tree)).toContain("Chart data is unavailable");
    expect(widget(tree, "Card").props["aria-busy"]).toBe(false);
    chart.navigate("7d");
    chart.requests[2].respond(sample);
    tree = await chart.flush();
    expect(widget(tree, "AreaChart").props.data).toEqual(sample);
    expect(text(tree)).not.toContain("Chart data is unavailable");
  });

  it("does not refetch or discard the plot during unrelated renders and aborts on unmount", async () => {
    const chart = fixture();
    chart.mount();
    chart.requests[0].respond(sample);
    await chart.flush();
    const tree = chart.render();
    expect(chart.fetch).toHaveBeenCalledTimes(1);
    expect(widget(tree, "AreaChart").props.data).toEqual(sample);
    const id = widget(tree, "linearGradient").props.id;
    expect(widget(chart.render(), "linearGradient").props.id).toBe(id);
    chart.navigate("60d");
    chart.unmount();
    expect(chart.requests[1].signal.aborted).toBe(true);
    chart.requests[1].respond([{ label: "Late", tokens: 10, cost: 0 }]);
    await chart.flush();
    expect(chart.fetch).toHaveBeenCalledTimes(2);
  });

  it("preserves unknown-cost gaps and zero charges while honoring reduced motion", async () => {
    const chart = fixture({ reducedMotion: true });
    chart.mount();
    const incomplete = [
      { label: "09:00", tokens: 10, cost: 0.1 },
      { label: "10:00", tokens: 10, cost: null },
      { label: "11:00", tokens: 10, cost: 0 },
    ];
    chart.requests[0].respond(incomplete);
    await chart.flush();
    const tree = await chart.metric("Cost");
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
    expect(chart.fetch).toHaveBeenCalledTimes(1);
  });
});
