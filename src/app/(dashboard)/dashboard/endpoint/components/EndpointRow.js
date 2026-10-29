"use client";

import { Input } from "@/shared/components";

/** Reusable endpoint row component */
export default function EndpointRow({ label, url, copyId, copied, onCopy, badge, actions }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-border-subtle bg-bg-alt/60 p-2.5">
      <span className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 min-w-[56px] sm:min-w-[72px] text-center ${
          (badge === "CF" || badge === "TS") ? "bg-primary/10 text-primary" : "bg-surface-2 text-text-muted"
        }`}>{label}</span>
      <Input aria-label={`${label} API endpoint`} value={url} readOnly className="min-w-0 flex-1 font-mono text-sm" />
      <button
        type="button"
        aria-label={`Copy ${label.toLowerCase()} API endpoint`}
        onClick={() => onCopy(url, copyId)}
        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-surface hover:text-primary"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{copied === copyId ? "check" : "content_copy"}</span>
      </button>
      {actions}
    </div>
  );
}
