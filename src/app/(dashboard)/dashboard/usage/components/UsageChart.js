"use client";

import { memo, useState, useEffect, useId } from "react";
import { useReducedMotion } from "motion/react";
import PropTypes from "prop-types";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import Card from "@/shared/components/Card";

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};
const fmtCost = (n) => n === null ? "Not specified" : `$${(n || 0).toFixed(4)}`;

function UsageChart({ period = "7d" }) {
  const [result, setResult] = useState({ period: null, data: [], error: false });
  const { data } = result;
  const loading = result.period !== period;
  const error = !loading && result.error;
  const [viewMode, setViewMode] = useState("tokens");
  const reduceMotion = useReducedMotion();
  const gradientId = useId().replace(/:/g, "");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/usage/chart?period=${period}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Chart request failed: ${res.status}`);
        return res.json();
      })
      .then((json) => { if (!controller.signal.aborted) setResult({ period, data: json, error: false }); })
      .catch((err) => {
        if (!controller.signal.aborted && err.name !== "AbortError") {
          setResult({ period, data: [], error: true });
        }
      });
    return () => controller.abort();
  }, [period]);

  const hasData = data.some((d) => d.tokens > 0 || d.cost > 0 || d.cost === null);
  const color = viewMode === "tokens" ? "var(--color-primary)" : "var(--color-success)";
  return (
    <Card padding="none" className="usage-chart min-w-0 overflow-hidden p-5 sm:p-6" aria-busy={loading}>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Consumption</p>
          <h2 className="text-lg font-semibold tracking-tight">Usage over time</h2>
          <p className="mt-1 text-xs leading-5 text-text-muted">{viewMode === "tokens" ? "Input and output tokens across your gateway." : "Local estimates. Gaps indicate unspecified pricing."}</p>
        </div>
        <div className="inline-flex max-w-full gap-1 rounded-xl border border-border-subtle bg-surface-2 p-1" aria-label="Chart metric">
          {[{ value: "tokens", label: "Tokens" }, { value: "cost", label: "Cost" }].map((option) => (
            <button key={option.value} type="button" aria-pressed={viewMode === option.value} onClick={() => setViewMode(option.value)} className={`min-h-9 rounded-lg px-4 text-xs font-semibold transition-colors ${viewMode === option.value ? "bg-surface text-text-main shadow-sm" : "text-text-muted hover:text-text-main"}`}>{option.label}</button>
          ))}
        </div>
      </div>
      <div className={`h-[240px] min-w-0 transition-opacity duration-300 sm:h-[280px] ${loading && hasData ? "opacity-40" : "opacity-100"}`}>
        {error || !hasData ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-subtle bg-surface-2/30 px-4 text-center">
            <span aria-hidden="true" className="material-symbols-outlined rounded-2xl bg-surface-2 p-3 text-2xl text-text-subtle">{error ? "cloud_off" : "show_chart"}</span>
            <p role="status" className="text-sm font-medium text-text-muted">{loading ? "Loading your activity…" : error ? "Chart data is unavailable. Try another period." : "Your activity starts here"}</p>
            {!loading && !error && <p className="max-w-xs text-xs leading-5 text-text-subtle">Requests through your gateway will appear in this chart.</p>}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={80}>
            <AreaChart data={data} margin={{ top: 10, right: 8, left: -10, bottom: 0 }} accessibilityLayer>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.24} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.015} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-border-subtle)" strokeDasharray="4 6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-text-subtle)" }} tickMargin={12} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={36} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-text-subtle)" }} tickMargin={8} tickLine={false} axisLine={false} tickFormatter={viewMode === "tokens" ? fmtTokens : fmtCost} width={62} />
              <Tooltip filterNull={false} cursor={{ stroke: "var(--color-text-subtle)", strokeDasharray: "4 4" }} contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border-subtle)", borderRadius: "14px", boxShadow: "var(--shadow-elevated)", padding: "12px 16px", fontSize: "12px" }} labelStyle={{ color: "var(--color-text-muted)", marginBottom: 6 }} formatter={(value) => viewMode === "tokens" ? [fmtTokens(value), "Tokens"] : [fmtCost(value), "Estimated cost"]} />
              <Area type="monotone" dataKey={viewMode} connectNulls={false} stroke={color} strokeWidth={2.5} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 5, stroke: "var(--color-surface)", strokeWidth: 3 }} isAnimationActive={!reduceMotion} animationDuration={850} animationEasing="ease-out" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

UsageChart.propTypes = { period: PropTypes.string };

// UsageStats receives frequent request-stream events. Keep those unrelated
// updates from reprocessing chart geometry or replaying its entrance tween.
export default memo(UsageChart);
