"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Card from "@/shared/components/Card";

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};

const fmtCost = (n) => n === null ? "Not specified" : `$${(n || 0).toFixed(4)}`;

export default function UsageChart({ period, periodLabel, snapshot, snapshotPeriodLabel, error, fetching, onRetry }) {
  const [viewMode, setViewMode] = useState("tokens");
  const data = snapshot?.data || [];
  const hasData = data.some((d) => d.tokens > 0 || d.cost > 0 || d.cost === null);

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <div className="grid w-full grid-cols-2 items-center gap-1 rounded-lg border border-border bg-bg-subtle p-1 sm:w-auto sm:self-start">
        <button
          onClick={() => setViewMode("tokens")}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === "tokens" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
        >
          Tokens
        </button>
        <button
          onClick={() => setViewMode("cost")}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === "cost" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
        >
          Cost
        </button>
      </div>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-text-main">
          <span>
            Could not load the {periodLabel} chart. {error.message}
            {snapshot && ` Showing last successful ${snapshotPeriodLabel} data.`}
          </span>
          <button type="button" onClick={onRetry} className="font-semibold text-primary underline">Retry chart</button>
        </div>
      ) : snapshot && snapshot.period !== period ? (
        <p role="status" className="text-sm text-text-muted">Showing {snapshotPeriodLabel} chart data while {periodLabel} loads.</p>
      ) : null}

      {!snapshot ? (fetching && !error ? (
        <div className="h-48 flex items-center justify-center text-text-muted text-sm">Loading...</div>
      ) : null) : !hasData ? (
        <div className="h-48 flex items-center justify-center text-text-muted text-sm">No data for {snapshotPeriodLabel}</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={viewMode === "tokens" ? fmtTokens : fmtCost}
              width={50}
            />
            <Tooltip
              filterNull={false}
              contentStyle={{
                backgroundColor: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value, name) =>
                name === "tokens" ? [fmtTokens(value), "Tokens"] : [fmtCost(value), "Cost"]
              }
            />
            {viewMode === "tokens" ? (
              <Area
                type="monotone"
                dataKey="tokens"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#gradTokens)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            ) : (
              <Area
                type="monotone"
                dataKey="cost"
                connectNulls={false}
                stroke="#f59e0b"
                strokeWidth={2}
                fill="url(#gradCost)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

UsageChart.propTypes = {
  period: PropTypes.string.isRequired,
  periodLabel: PropTypes.string.isRequired,
  snapshot: PropTypes.shape({ period: PropTypes.string.isRequired, data: PropTypes.array.isRequired }),
  snapshotPeriodLabel: PropTypes.string.isRequired,
  error: PropTypes.shape({ message: PropTypes.string.isRequired }),
  fetching: PropTypes.bool.isRequired,
  onRetry: PropTypes.func.isRequired,
};
