"use client";

import { cn } from "@/shared/utils/cn";

export function Spinner({ size = "md", className }) {
  const sizes = { sm: "size-4 text-[16px]", md: "size-6 text-[24px]", lg: "size-8 text-[32px]", xl: "size-12 text-[48px]" };
  return <span role="status" aria-label="Loading..." className={cn("inline-flex shrink-0", className)}><span aria-hidden="true" className={cn("material-symbols-outlined animate-spin text-primary", sizes[size])}>progress_activity</span></span>;
}

export function PageLoading({ message = "Loading..." }) {
  return <div role="status" aria-live="polite" className="flex min-h-[40vh] w-full flex-col items-center justify-center gap-3 p-8"><Spinner size="lg" /><p className="text-sm text-text-muted">{message}</p></div>;
}

export function Skeleton({ className, ...props }) {
  return <div aria-hidden="true" className={cn("workspace-skeleton rounded-md bg-surface-2", className)} {...props} />;
}

export function CardSkeleton() {
  return <div aria-hidden="true" className="min-w-0 space-y-4 rounded-[14px] border border-border-subtle bg-surface p-4 sm:p-5"><div className="flex items-center justify-between"><Skeleton className="h-4 w-28" /><Skeleton className="size-8 rounded-lg" /></div><Skeleton className="h-7 w-20" /><Skeleton className="h-3 w-3/5" /></div>;
}

/** Structural placeholders only: no fabricated values or blocking viewport overlay. */
export function DashboardSkeleton({ variant = "page" }) {
  const detail = variant === "detail";
  return <div role="status" aria-live="polite" aria-busy="true" className="dashboard-loading space-y-5" data-loading-layout={variant}>
    <span className="sr-only">Loading...</span>
    <div aria-hidden="true" className="flex flex-wrap items-center justify-between gap-4 py-2"><div className="space-y-3"><Skeleton className="h-7 w-48" /><Skeleton className="h-3 w-64 max-w-full" /></div><Skeleton className="h-10 w-28 rounded-[10px]" /></div>
    <div aria-hidden="true" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-3 rounded-[14px] border border-border-subtle bg-surface p-4"><Skeleton className="h-3 w-20" /><Skeleton className="h-6 w-14" /></div>)}</div>
    <div aria-hidden="true" className={cn("grid min-w-0 gap-4", detail ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : "lg:grid-cols-2")}>
      <div className="space-y-5 rounded-[14px] border border-border-subtle bg-surface p-5"><Skeleton className="h-5 w-32" />{Array.from({ length: 5 }, (_, index) => <div key={index} className="flex items-center gap-3 border-t border-border-subtle pt-4"><Skeleton className="size-8 shrink-0 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-1/3" /></div><Skeleton className="h-7 w-14" /></div>)}</div>
      <div className="space-y-4 rounded-[14px] border border-border-subtle bg-surface p-5"><Skeleton className="h-5 w-32" /><Skeleton className="h-36 w-full" /><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
    </div>
  </div>;
}

export default function Loading({ type = "spinner", ...props }) {
  if (type === "page") return <PageLoading {...props} />;
  if (type === "skeleton") return <Skeleton {...props} />;
  if (type === "card") return <CardSkeleton {...props} />;
  return <Spinner {...props} />;
}
