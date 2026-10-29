"use client";

import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import Card from "@/shared/components/Card";
import Tooltip from "@/shared/components/Tooltip";
import UsageCost from "@/shared/components/UsageCost";
import { fmt, fmtCompact } from "@/shared/utils/format";

// Animate updates from the last displayed value, rather than replaying from zero
// whenever the live usage stream updates another part of the page.
function MetricValue({ value, compact = false }) {
  const target = Number.isFinite(value) ? value : 0;
  const [displayed, setDisplayed] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => {
        current.current = target;
        setDisplayed(target);
      });
      return () => cancelAnimationFrame(frame);
    }
    const from = current.current;
    if (from === target) return;
    let frame;
    let started;
    const tick = (time) => {
      started ??= time;
      const progress = Math.min((time - started) / 650, 1);
      current.current = from + (target - from) * (1 - (1 - progress) ** 4);
      setDisplayed(Math.round(current.current));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return <span className="tabular-nums">{compact ? fmtCompact(displayed) : fmt(displayed)}</span>;
}

export default function OverviewCards({ stats }) {
  const metrics = [
    { label: "Total requests", value: stats.totalRequests, icon: "swap_vert", note: "Gateway requests", color: "text-primary" },
    { label: "Input tokens", value: stats.totalPromptTokens, icon: "north_east", note: "Includes cached input", color: "text-primary", compact: true },
    { label: "Cached tokens", value: stats.totalCachedTokens, icon: "database", note: "Reused context", color: "text-info", compact: true },
    { label: "Output tokens", value: stats.totalCompletionTokens, icon: "south_west", note: "Generated responses", color: "text-success", compact: true },
  ];
  return (
    <div className="usage-metrics grid min-w-0 grid-cols-1 gap-3 min-[440px]:grid-cols-2 xl:grid-cols-5 sm:gap-4">
      {metrics.map((metric) => (
        <Card key={metric.label} padding="none" className="usage-metric flex min-w-0 flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-text-muted">{metric.label}</span>
            <span aria-hidden="true" className={`material-symbols-outlined rounded-xl bg-surface-2 p-2 text-[18px] ${metric.color}`}>{metric.icon}</span>
          </div>
          <Tooltip text={`${fmt(metric.value)} ${metric.label.toLowerCase()}`}>
            <span className="block truncate text-[clamp(1.6rem,2.3vw,2.25rem)] font-semibold leading-tight tracking-[-0.055em] text-text-main">
              <MetricValue value={metric.value} compact={metric.compact} />
            </span>
          </Tooltip>
          <span className="mt-auto text-xs text-text-subtle">{metric.note}</span>
        </Card>
      ))}
      <Card padding="none" className="usage-metric usage-cost-card flex min-w-0 flex-col gap-4 p-5 sm:p-6 min-[440px]:col-span-2 xl:col-span-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-text-muted">Estimated cost</span>
          <span aria-hidden="true" className="material-symbols-outlined rounded-xl bg-primary/10 p-2 text-[18px] text-primary">payments</span>
        </div>
        <div className="break-words text-2xl font-semibold leading-tight tracking-[-0.04em] text-primary tabular-nums">
          {stats.totalCost !== null && "~"}<UsageCost value={stats.totalCost} coverage={stats.costCoverage?.totalCost} />
        </div>
        <span className="mt-auto text-xs leading-5 text-text-subtle">Estimated, not actual billing</span>
      </Card>
    </div>
  );
}

OverviewCards.propTypes = {
  stats: PropTypes.object.isRequired,
};
