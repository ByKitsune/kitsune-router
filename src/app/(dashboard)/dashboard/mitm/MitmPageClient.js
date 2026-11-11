"use client";

import { useState, useEffect } from "react";
import { MITM_TOOLS } from "@/shared/constants/cliTools";
import { getModelsByProviderId } from "@/shared/constants/models";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import WorkspaceIntro from "../components/WorkspaceIntro";
import "../cli-tools/integration-workspace.css";
import { MitmServerCard, MitmToolCard } from "@/app/(dashboard)/dashboard/cli-tools/components";

export default function MitmPageClient() {
  const [connections, setConnections] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [modelAliases, setModelAliases] = useState({});
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [expandedTool, setExpandedTool] = useState(null);
  const [mitmStatus, setMitmStatus] = useState({ running: false, certExists: false, dnsStatus: {}, hasCachedPassword: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/providers");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setConnections(data.connections || []);
        }
      } catch { /* ignore */ }
    })();
    (async () => {
      try {
        const res = await fetch("/api/keys");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setApiKeys(data.keys || []);
        }
      } catch { /* ignore */ }
    })();
    (async () => {
      try {
        const res = await fetch("/api/models/alias");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setModelAliases(data.aliases || {});
        }
      } catch { /* ignore */ }
    })();
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setCloudEnabled(data.cloudEnabled || false);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const getActiveProviders = () => connections.filter(c => c.isActive !== false);

  const hasActiveProviders = () => {
    const active = getActiveProviders();
    return active.some(conn =>
      getModelsByProviderId(conn.provider).length > 0 ||
      isOpenAICompatibleProvider(conn.provider) ||
      isAnthropicCompatibleProvider(conn.provider)
    );
  };

  const mitmTools = Object.entries(MITM_TOOLS);

  return (
    <div className="integration-workspace flex w-full min-w-0 flex-col gap-6">
      <WorkspaceIntro
        eyebrow="Developer toolkit"
        icon="security"
        title="MITM tools"
        description="Local interception integrations with dedicated setup controls."
        links={[{ href: "#mitm-server", label: "MITM Server" }, { href: "#mitm-tool-configurations", label: "MITM tools" }]}
      />
      <div className="integration-mitm-warning flex items-start gap-3 border border-yellow-500/30 bg-yellow-500/10">
        <span className="material-symbols-outlined text-[16px] text-yellow-500 mt-0.5 shrink-0">warning</span>
        <p className="text-xs text-red-600 dark:text-yellow-400 leading-relaxed">
          ⚠️ MITM intercepts HTTPS traffic of IDE tools (Antigravity, GitHub Copilot, Kiro) via local CA to redirect requests to your providers. May violate ToS → account ban. Use at your own risk.
        </p>
      </div>

      <div className="integration-mitm-layout">
        <section id="mitm-server" className="min-w-0 scroll-mt-6" aria-label="MITM Server">
          <MitmServerCard apiKeys={apiKeys} cloudEnabled={cloudEnabled} onStatusChange={setMitmStatus} />
        </section>
        <section id="mitm-tool-configurations" className="integration-mitm-configurations scroll-mt-6" aria-label="MITM tools">
        {mitmTools.map(([toolId, tool]) => (
          <MitmToolCard
            key={toolId}
            tool={tool}
            isExpanded={expandedTool === toolId}
            onToggle={() => setExpandedTool(expandedTool === toolId ? null : toolId)}
            serverRunning={mitmStatus.running}
            dnsActive={mitmStatus.dnsStatus?.[toolId] || false}
            hasCachedPassword={mitmStatus.hasCachedPassword || false}
            needsSudoPassword={mitmStatus.needsSudoPassword !== false}
            isWin={mitmStatus.isWin === true}
            apiKeys={apiKeys}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders()}
            modelAliases={modelAliases}
            cloudEnabled={cloudEnabled}
            onDnsChange={(data) => setMitmStatus(prev => ({ ...prev, dnsStatus: data.dnsStatus ?? prev.dnsStatus }))}
          />
        ))}
        </section>
      </div>
    </div>
  );
}
