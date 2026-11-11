"use client";

import Link from "next/link";
import Image from "next/image";
import { Card } from "@/shared/components";

// Derive status only from actual local status results, never from catalog presence.
function getStatus(status) {
  if (!status) return { label: "Unknown", cls: "text-text-muted", state: "unknown" };
  if (!status.installed) return { label: "Not installed", cls: "text-text-muted", state: "unavailable" };
  if (status.hasKitsuneRouter) return { label: "Connected", cls: "text-green-700 dark:text-green-400", state: "connected" };
  return { label: "Not configured", cls: "text-amber-700 dark:text-amber-400", state: "unconfigured" };
}

export default function ToolSummaryCard({ toolId, tool, status }) {
  const current = getStatus(status);
  return (
    <Link href={`/dashboard/cli-tools/${toolId}`} className="integration-tool-link group block min-w-0 rounded-[14px]">
      <Card padding="none" className="integration-tool-tile h-full cursor-pointer" data-tool-status={current.state}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="integration-tool-icon shrink-0">
            {tool.image ? (
              <Image src={tool.image} alt="" width={32} height={32} className="size-8 rounded-lg object-contain" sizes="32px" onError={(event) => { event.target.style.display = "none"; }} loading="lazy" decoding="async" />
            ) : tool.icon ? (
              <span aria-hidden="true" className="material-symbols-outlined text-[28px]" style={{ color: tool.color }}>{tool.icon}</span>
            ) : null}
          </div>
          <h3 className="min-w-0 text-sm font-semibold leading-5 text-text-main">{tool.name}</h3>
        </div>
        {tool.description && <p className="integration-tool-description text-xs leading-5 text-text-muted">{tool.description}</p>}
        <div className="integration-tool-footer">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${current.cls}`}>
            <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${current.state === "connected" ? "bg-green-600 dark:bg-green-400" : current.state === "unconfigured" ? "bg-amber-600 dark:bg-amber-400" : "bg-text-subtle/60"}`} />
            {current.label}
          </span>
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-text-muted transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transform-none">arrow_forward</span>
        </div>
      </Card>
    </Link>
  );
}
