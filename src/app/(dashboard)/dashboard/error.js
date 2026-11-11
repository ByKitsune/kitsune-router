"use client";

import Link from "next/link";
import Button from "@/shared/components/Button";

// Show a recoverable public state without rendering private error contents.
export default function DashboardError({ retry, reset }) {
  return <section role="alert" className="dashboard-empty-state mx-auto my-8 max-w-xl rounded-[14px] border border-border-subtle bg-surface">
    <span aria-hidden="true" className="material-symbols-outlined">error_outline</span>
    <h2 className="text-lg font-semibold tracking-tight">An error occurred. Please try again.</h2>
    <div className="page-actions mt-2 justify-center">
      <Button onClick={() => (retry || reset)?.()} icon="refresh">Try Again</Button>
      <Link href="/dashboard/providers" className="inline-flex min-h-11 items-center rounded-[10px] px-4 text-sm font-medium text-text-muted hover:bg-surface-2">Back to Providers</Link>
    </div>
  </section>;
}
