"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { UsageStats, RequestLogger, CardSkeleton } from "@/shared/components";
import RequestDetailsTab from "./components/RequestDetailsTab";
import "./usage.css";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];
const TABS = [
  { value: "overview", label: "Overview", icon: "space_dashboard" },
  { value: "details", label: "Request details", icon: "receipt_long" },
  { value: "logs", label: "Live logs", icon: "terminal" },
];

export default function UsagePage() {
  return <Suspense fallback={<CardSkeleton />}><UsageContent /></Suspense>;
}

function UsageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [period, setPeriod] = useState("today");
  const tabFromUrl = searchParams.get("tab");
  const activeTab = tabFromUrl && TABS.some((tab) => tab.value === tabFromUrl) ? tabFromUrl : "overview";
  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };
  return (
    <div className="usage-workspace flex min-w-0 flex-col gap-6 sm:gap-8">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-[11px] font-medium text-text-muted">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            Gateway insights
          </div>
          <h2 className="text-[clamp(1.7rem,3vw,2.5rem)] font-semibold leading-tight tracking-[-0.055em]">Every request, in perspective.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-text-muted">Understand your traffic, follow your routes, and keep an eye on consumption.</p>
        </div>
        {activeTab === "overview" && (
          <div className="inline-grid w-full grid-cols-5 gap-1 rounded-2xl border border-border-subtle bg-surface p-1.5 min-[440px]:w-auto" aria-label="Usage period">
            {PERIODS.map((option) => (
              <button key={option.value} type="button" aria-pressed={period === option.value} onClick={() => setPeriod(option.value)} className={`min-h-10 rounded-xl px-2 text-xs font-semibold transition-colors sm:px-4 ${period === option.value ? "bg-text-main text-bg shadow-sm" : "text-text-muted hover:bg-surface-2 hover:text-text-main"}`}>{option.label}</button>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-border-subtle" aria-label="Usage views">
        {TABS.map((tab) => (
          <button key={tab.value} type="button" aria-pressed={activeTab === tab.value} onClick={() => handleTabChange(tab.value)} className={`relative flex min-h-12 shrink-0 items-center gap-2 px-3 pb-3 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${activeTab === tab.value ? "text-primary" : "text-text-muted hover:text-text-main"}`}>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            {tab.label}
            {activeTab === tab.value && <motion.span layoutId="usage-tab-indicator" transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 34 }} className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>
      <div key={activeTab} className="workspace-enter min-w-0">
        {activeTab === "overview" && <Suspense fallback={<CardSkeleton />}><UsageStats period={period} setPeriod={setPeriod} hidePeriodSelector /></Suspense>}
        {activeTab === "logs" && <RequestLogger />}
        {activeTab === "details" && <RequestDetailsTab />}
      </div>
    </div>
  );
}
