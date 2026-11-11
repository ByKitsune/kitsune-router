"use client";

import { useState, useEffect } from "react";
import WorkspaceIntro from "../components/WorkspaceIntro";
import { Button, CardSkeleton, Input } from "@/shared/components";
import { CLI_TOOLS, MITM_TOOLS } from "@/shared/constants/cliTools";
import { MitmLinkCard } from "./components";
import ToolSummaryCard from "./components/ToolSummaryCard";
import "./integration-workspace.css";

const ALL_STATUSES_URL = "/api/cli-tools/all-statuses";

export default function CLIToolsPageClient({ machineId }) {
  const [loading, setLoading] = useState(true);
  const [toolStatuses, setToolStatuses] = useState({});
  const [query, setQuery] = useState("");
  const [connectedOnly, setConnectedOnly] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(ALL_STATUSES_URL);
        if (res.ok) {
          const statuses = await res.json();
          if (mounted) setToolStatuses(statuses);
        }
      } catch (error) {
        console.log("Error fetching tool statuses:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const regularTools = Object.entries(CLI_TOOLS);
  const mitmTools = Object.entries(MITM_TOOLS);
  const connected = (toolId) => toolStatuses[toolId]?.installed && toolStatuses[toolId]?.hasKitsuneRouter;
  const connectedCount = regularTools.filter(([toolId]) => connected(toolId)).length;
  const search = query.trim().toLocaleLowerCase();
  const visibleTools = regularTools.filter(([toolId, tool]) =>
    (!connectedOnly || connected(toolId)) &&
    (!search || `${tool.name} ${tool.description || ""} ${toolId}`.toLocaleLowerCase().includes(search))
  );

  return (
    <div className="integration-workspace flex w-full min-w-0 flex-col gap-6">
      <WorkspaceIntro
        eyebrow="Developer toolkit"
        icon="terminal"
        title="CLI Tools"
        description="Connect your coding tools to this gateway. Choose an integration to review its setup and configuration."
        metrics={[
          { label: "Tool integrations", value: regularTools.length, icon: "code" },
          { label: "Connected", value: loading ? "—" : connectedCount, icon: "check_circle" },
          { label: "MITM integrations", value: mitmTools.length, icon: "security" },
        ]}
        links={[{ href: "#tool-integrations", label: "Tool integrations" }, { href: "#mitm-integrations", label: "MITM tools" }]}
      />

      <div className="integration-library-layout">
        <section id="tool-integrations" className="min-w-0 scroll-mt-6" aria-busy={loading}>
          <div className="workspace-toolbar integration-library-toolbar">
            <Input
              type="search"
              icon="search"
              aria-label="Search"
              placeholder="Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1"
            />
            <button
              type="button"
              disabled={loading}
              aria-pressed={connectedOnly}
              onClick={() => setConnectedOnly((value) => !value)}
              className={`integration-status-filter ${connectedOnly ? "is-selected" : ""}`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[17px]">check_circle</span>
              <span>Connected</span>
              <span className="integration-filter-count" data-i18n-skip="true">{loading ? "—" : connectedCount}</span>
            </button>
            <span className="integration-results-count" aria-live="polite" data-i18n-skip="true">{loading ? "—" : visibleTools.length} / {regularTools.length}</span>
          </div>
          {loading ? (
            <div className="integration-library-grid" role="status" aria-label="Loading">
              {Array.from({ length: 6 }, (_, index) => <CardSkeleton key={index} />)}
            </div>
          ) : visibleTools.length ? (
            <div className="integration-library-grid">
              {visibleTools.map(([toolId, tool]) => (
                <ToolSummaryCard key={toolId} toolId={toolId} tool={tool} status={toolStatuses[toolId]} />
              ))}
            </div>
          ) : (
            <div className="integration-empty-state" role="status">
              <span aria-hidden="true" className="material-symbols-outlined text-[28px] text-text-muted">search_off</span>
              <p className="font-medium text-text-main">No results</p>
              <Button variant="secondary" size="sm" onClick={() => { setQuery(""); setConnectedOnly(false); }}>Reset</Button>
            </div>
          )}
        </section>

        <aside id="mitm-integrations" className="integration-library-aside min-w-0 scroll-mt-6">
          <div className="section-heading">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-text-main">MITM tools</h2>
              <p className="mt-1 text-xs leading-5 text-text-muted">Local interception integrations with dedicated setup controls.</p>
            </div>
          </div>
          <div className="integration-mitm-grid">
            {mitmTools.map(([toolId, tool]) => <MitmLinkCard key={toolId} tool={tool} />)}
          </div>
        </aside>
      </div>
    </div>
  );
}
