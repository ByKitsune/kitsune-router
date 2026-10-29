"use client";

import { useState, useEffect } from "react";
import WorkspaceIntro from "../components/WorkspaceIntro";
import { CardSkeleton } from "@/shared/components";
import { CLI_TOOLS, MITM_TOOLS } from "@/shared/constants/cliTools";
import { MitmLinkCard } from "./components";
import ToolSummaryCard from "./components/ToolSummaryCard";

const ALL_STATUSES_URL = "/api/cli-tools/all-statuses";

export default function CLIToolsPageClient({ machineId }) {
  const [loading, setLoading] = useState(true);
  const [toolStatuses, setToolStatuses] = useState({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(ALL_STATUSES_URL);
        if (res.ok && mounted) setToolStatuses(await res.json());
      } catch (error) {
        console.log("Error fetching tool statuses:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const regularTools = Object.entries(CLI_TOOLS);
  const mitmTools = Object.entries(MITM_TOOLS);

  return (
    <div className="flex w-full min-w-0 flex-col gap-7">
      <WorkspaceIntro
        eyebrow="Developer toolkit"
        icon="terminal"
        title="Bring your tools. Keep your routes."
        description="Connect your coding tools to this gateway. Choose an integration to review its setup and configuration."
        metrics={[
          { label: "Tool integrations", value: regularTools.length, icon: "code" },
          { label: "MITM integrations", value: mitmTools.length, icon: "security" },
          { label: "Gateway", value: "Local-first", icon: "computer" },
        ]}
        links={[{ href: "#tool-integrations", label: "Tool integrations" }, { href: "#mitm-integrations", label: "MITM tools" }]}
      />
      <section id="tool-integrations" className="min-w-0 scroll-mt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="text-lg font-semibold tracking-tight">Tool integrations</h2><p className="mt-1 text-xs leading-5 text-text-muted">Configuration and connection status for your development tools.</p></div>
          <span className="rounded-full border border-border-subtle px-3 py-1 text-xs text-text-muted">{regularTools.length} integrations</span>
        </div>
      <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
        {regularTools.map(([toolId, tool]) => (
          <ToolSummaryCard key={toolId} toolId={toolId} tool={tool} status={toolStatuses[toolId]} />
        ))}
      </div>
      </section>
      <section id="mitm-integrations" className="flex min-w-0 scroll-mt-6 flex-col gap-4 rounded-[24px] border border-border-subtle bg-bg-alt/60 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[18px] text-primary">security</span>
          <div><h2 className="text-lg font-semibold tracking-tight text-text-main">MITM tools</h2><p className="mt-1 text-xs leading-5 text-text-muted">Local interception integrations with dedicated setup controls.</p></div>
        </div>
        <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
          {mitmTools.map(([toolId, tool]) => (
            <MitmLinkCard key={toolId} tool={tool} />
          ))}
        </div>
      </section>
    </div>
  );
}
