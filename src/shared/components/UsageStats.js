"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FREE_PROVIDERS, AI_PROVIDERS } from "@/shared/constants/providers";
import { addNullableCost, mergeCostCoverage } from "@/shared/utils/cost.js";

// Keep providers without serviceKinds (default LLM) or with "llm" in serviceKinds
function isLLMProvider(id) {
  const p = AI_PROVIDERS[id];
  if (!p?.serviceKinds) return true;
  return p.serviceKinds.includes("llm");
}
import Badge from "./Badge";
import Card from "./Card";
import Tooltip from "./Tooltip";
import OverviewCards from "@/app/(dashboard)/dashboard/usage/components/OverviewCards";
import UsageTable, { fmt, fmtCompact, fmtTime } from "@/app/(dashboard)/dashboard/usage/components/UsageTable";
import dynamic from "next/dynamic";
// Lazy-load: keeps @xyflow/react out of the shared bundle until topology renders
const ProviderTopology = dynamic(() => import("@/app/(dashboard)/dashboard/usage/components/ProviderTopology"), { ssr: false });
import UsageChart from "@/app/(dashboard)/dashboard/usage/components/UsageChart";

function timeAgo(timestamp) {
  const diff = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Auto-update time display every second without re-rendering parent
function TimeAgo({ timestamp }) {
  const [, setTick] = useState(0);
  
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  
  return <>{timeAgo(timestamp)}</>;
}

function RecentRequests({ requests = [], connected = false }) {
  return (
    <Card className="flex min-w-0 flex-col overflow-hidden" padding="none">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle p-5 sm:p-6">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Activity feed</p>
          <h2 className="text-lg font-semibold tracking-tight">Recent requests</h2>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-2 px-2.5 py-1 text-[10px] font-medium text-text-muted"><span className={`size-1.5 rounded-full ${connected ? "bg-success" : "bg-text-subtle"}`} aria-hidden="true" />{connected ? "Live" : "Recent"}</span>
      </div>
      {!requests.length ? (
        <div className="flex min-h-60 flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
          <span aria-hidden="true" className="material-symbols-outlined rounded-2xl bg-surface-2 p-3 text-2xl text-text-subtle">swap_vert</span>
          <p className="text-sm font-medium text-text-muted">No requests yet</p>
          <p className="max-w-xs text-xs leading-5 text-text-subtle">Your latest gateway requests will appear here automatically.</p>
        </div>
      ) : (
        <div className="max-h-[340px] min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6">
          {requests.map((r) => {
            const ok = !r.status || r.status === "ok" || r.status === "success";
            return (
              <div key={r.id || r.requestId || `${r.timestamp}-${r.model}-${r.provider}`} className="usage-request-row flex min-w-0 items-start gap-3 border-b border-border-subtle py-4 last:border-0">
                <span aria-label={ok ? "Successful request" : "Request error"} className={`mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl ${ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}><span aria-hidden="true" className="material-symbols-outlined text-[16px]">{ok ? "check" : "priority_high"}</span></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-text-main" title={r.model}>{r.model}</p>
                  <p className="mt-1 truncate text-[11px] text-text-subtle">{r.provider || "Gateway"} · <TimeAgo timestamp={r.timestamp} /></p>
                </div>
                <Tooltip text={`${fmt(r.promptTokens)} in / ${fmt(r.completionTokens)} out`} position="left">
                  <span className="flex shrink-0 flex-col items-end gap-1 text-[11px] tabular-nums"><span className="text-primary">{fmtCompact(r.promptTokens)} ↑</span><span className="text-text-muted">{fmtCompact(r.completionTokens)} ↓</span></span>
                </Tooltip>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function estimateLegacyComponentCost(tokens, totalTokens, totalCost) {
  if (tokens === 0 || totalTokens === 0) return 0;
  return totalCost === null ? null : tokens * (totalCost / totalTokens);
}

function compareUsageData(a, b, sortBy, sortOrder) {
  let valA = a[sortBy];
  let valB = b[sortBy];
  if (sortBy === "cost" || sortBy.endsWith("Cost")) {
    if (valA === null && valB !== null) return 1;
    if (valB === null && valA !== null) return -1;
  }
  if (typeof valA === "string") valA = valA.toLowerCase();
  if (typeof valB === "string") valB = valB.toLowerCase();
  if (valA < valB) return sortOrder === "asc" ? -1 : 1;
  if (valA > valB) return sortOrder === "asc" ? 1 : -1;
  return 0;
}

function sortData(dataMap, pendingMap = {}, sortBy, sortOrder) {
  return Object.entries(dataMap || {})
    .map(([key, data]) => {
      const totalTokens = (data.promptTokens || 0) + (data.completionTokens || 0);
      const totalCost = data.totalCost !== undefined ? data.totalCost : data.cost === undefined ? 0 : data.cost;
      const cachedTokens = data.cachedTokens || 0;
      const nonCachedInput = Math.max(0, (data.promptTokens || 0) - cachedTokens);
      const hasStoredComponentCosts = data.inputCost !== undefined && data.outputCost !== undefined;
      // Preserve recorded components, including null; estimate only absent legacy fields.
      const inputCost = data.inputCost !== undefined
        ? data.inputCost
        : estimateLegacyComponentCost(nonCachedInput, totalTokens, totalCost);
      const cachedCost = data.cachedCost !== undefined
        ? data.cachedCost
        : hasStoredComponentCosts ? 0 : estimateLegacyComponentCost(cachedTokens, totalTokens, totalCost);
      const outputCost = data.outputCost !== undefined
        ? data.outputCost
        : estimateLegacyComponentCost(data.completionTokens || 0, totalTokens, totalCost);
      return { ...data, key, totalTokens, cost: totalCost, totalCost, inputCost, cachedCost, outputCost, pending: pendingMap[key] || 0 };
    })
    .sort((a, b) => compareUsageData(a, b, sortBy, sortOrder));
}

function getGroupKey(item, keyField) {
  switch (keyField) {
    case "rawModel": return item.rawModel || "Unknown Model";
    case "accountName": return item.accountName || `Account ${item.connectionId?.slice(0, 8)}...` || "Unknown Account";
    case "keyName": return item.keyName || "Unknown Key";
    case "endpoint": return item.endpoint || "Unknown Endpoint";
    default: return item[keyField] || "Unknown";
  }
}

function groupDataByKey(data, keyField, sortBy, sortOrder) {
  if (!Array.isArray(data)) return [];
  const groups = {};
  data.forEach((item) => {
    const gk = getGroupKey(item, keyField);
    if (!groups[gk]) {
      groups[gk] = {
        groupKey: gk,
        summary: { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0, cost: 0, totalCost: 0, inputCost: 0, cachedCost: 0, outputCost: 0, lastUsed: null, pending: 0 },
        items: [],
      };
    }
    const s = groups[gk].summary;
    mergeCostCoverage(s, item);
    s.requests += item.requests || 0;
    s.promptTokens += item.promptTokens || 0;
    s.completionTokens += item.completionTokens || 0;
    s.cachedTokens += item.cachedTokens || 0;
    s.totalTokens += item.totalTokens || 0;
    s.cost = addNullableCost(s.cost, item.totalCost);
    s.totalCost = s.cost;
    s.inputCost = addNullableCost(s.inputCost, item.inputCost);
    s.cachedCost = addNullableCost(s.cachedCost, item.cachedCost);
    s.outputCost = addNullableCost(s.outputCost, item.outputCost);
    s.pending += item.pending || 0;
    if (item.lastUsed && (!s.lastUsed || new Date(item.lastUsed) > new Date(s.lastUsed))) {
      s.lastUsed = item.lastUsed;
    }
    groups[gk].items.push(item);
  });
  const grouped = Object.values(groups);
  if (sortBy === "cost" || sortBy.endsWith("Cost")) {
    grouped.sort((a, b) => compareUsageData(a.summary, b.summary, sortBy, sortOrder));
  }
  return grouped;
}

const MODEL_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const ACCOUNT_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "accountName", label: "Account" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const API_KEY_COLUMNS = [
  { field: "keyName", label: "API Key Name" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const ENDPOINT_COLUMNS = [
  { field: "endpoint", label: "Endpoint" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const TABLE_OPTIONS = [
  { value: "model", label: "Usage by Model" },
  { value: "account", label: "Usage by Account" },
  { value: "apiKey", label: "Usage by API Key" },
  { value: "endpoint", label: "Usage by Endpoint" },
];

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];

export default function UsageStats({ period: periodProp, setPeriod: setPeriodProp, hidePeriodSelector = false } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sortBy = searchParams.get("sortBy") || "rawModel";
  const sortOrder = searchParams.get("sortOrder") || "asc";

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [tableView, setTableView] = useState("model");
  const [viewMode, setViewMode] = useState("costs");
  const [providers, setProviders] = useState([]);
  const [periodLocal, setPeriodLocal] = useState("today");
  const isInitialLoad = useRef(true);
  const hasLoadedStats = useRef(false);
  const period = periodProp ?? periodLocal;
  const setPeriod = setPeriodProp ?? setPeriodLocal;

  // Fetch connected providers once, deduplicate by provider type
  // Always include noAuth free providers (e.g. opencode) regardless of connections
  useEffect(() => {
    Promise.all([
      fetch("/api/providers").then((r) => r.ok ? r.json() : null),
      fetch("/api/provider-nodes").then((r) => r.ok ? r.json() : null),
    ])
      .then(([d, nodesData]) => {
        // Build node name lookup for custom providers
        const nodeNameMap = {};
        for (const node of (nodesData?.nodes || [])) {
          nodeNameMap[node.id] = node.name;
        }
        const seen = new Set();
        const unique = (d?.connections || []).filter((c) => {
          if (c.isActive === false) return false;
          if (!isLLMProvider(c.provider)) return false;
          if (seen.has(c.provider)) return false;
          seen.add(c.provider);
          return true;
        }).map((c) => ({
          ...c,
          nodeName: nodeNameMap[c.provider] || null,
        }));
        const noAuthProviders = Object.values(FREE_PROVIDERS)
          .filter((p) => p.noAuth && !seen.has(p.id) && isLLMProvider(p.id))
          .map((p) => ({ provider: p.id, name: p.name }));
        setProviders([...unique, ...noAuthProviders]);
      })
      .catch(() => {});
  }, []);

  // Fetch filtered stats via REST when period changes
  useEffect(() => {
    // First load: show full spinner; subsequent: show subtle fetching indicator
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      setLoading(true);
    } else {
      setFetching(true);
    }

    const controller = new AbortController();
    fetch(`/api/usage/stats?period=${period}`, { signal: controller.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && !controller.signal.aborted) {
          hasLoadedStats.current = true;
          setStats((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setFetching(false);
        }
      });
    return () => controller.abort();
  }, [period]);

  // SSE connection - real-time updates for activeRequests + recentRequests only
  useEffect(() => {
    const es = new EventSource("/api/usage/stream");
    es.onopen = () => setStreamConnected(true);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        // Always merge only real-time fields, never overwrite full stats from REST
        setStats((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            activeRequests: data.activeRequests,
            recentRequests: data.recentRequests,
            errorProvider: data.errorProvider,
            pending: data.pending,
          };
        });
        if (hasLoadedStats.current) setLoading(false);
      } catch (err) {
        console.error("[SSE CLIENT] parse error:", err);
      }
    };

    es.onerror = () => {
      setStreamConnected(false);
      setLoading(false);
    };

    return () => es.close();
  }, []);

  const toggleSort = useCallback((tableType, field) => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("sortBy") === field) {
      params.set("sortOrder", params.get("sortOrder") === "asc" ? "desc" : "asc");
    } else {
      params.set("sortBy", field);
      params.set("sortOrder", "asc");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // Compute active table data
  const activeTableConfig = useMemo(() => {
    if (!stats) return null;
    switch (tableView) {
      case "model": {
        const pendingMap = stats.pending?.byModel || {};
        return {
          columns: MODEL_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byModel, pendingMap, sortBy, sortOrder), "rawModel", sortBy, sortOrder),
          storageKey: "usage-stats:expanded-models",
          emptyMessage: "No usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "account": {
        const pendingMap = {};
        if (stats?.pending?.byAccount) {
          Object.entries(stats.byAccount || {}).forEach(([accountKey, data]) => {
            const connPending = stats.pending.byAccount[data.connectionId];
            if (connPending) {
              const modelKey = data.provider ? `${data.rawModel} (${data.provider})` : data.rawModel;
              pendingMap[accountKey] = connPending[modelKey] || 0;
            }
          });
        }
        return {
          columns: ACCOUNT_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byAccount, pendingMap, sortBy, sortOrder), "accountName", sortBy, sortOrder),
          storageKey: "usage-stats:expanded-accounts",
          emptyMessage: "No account-specific usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.accountName || `Account ${item.connectionId?.slice(0, 8)}...`}</td>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "apiKey": {
        return {
          columns: API_KEY_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byApiKey, {}, sortBy, sortOrder), "keyName", sortBy, sortOrder),
          storageKey: "usage-stats:expanded-apikeys",
          emptyMessage: "No API key usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-6 py-3 font-medium">{item.keyName}</td>
              <td className="px-6 py-3">{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant="neutral" size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "endpoint":
      default: {
        return {
          columns: ENDPOINT_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byEndpoint, {}, sortBy, sortOrder), "endpoint", sortBy, sortOrder),
          storageKey: "usage-stats:expanded-endpoints",
          emptyMessage: "No endpoint usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-6 py-3 font-medium font-mono text-sm">{item.endpoint}</td>
              <td className="px-6 py-3">{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant="neutral" size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
    }
  }, [stats, tableView, sortBy, sortOrder]);

  if (!stats && !loading) return <div className="text-text-muted">Failed to load usage statistics.</div>;

  const spinner = (
    <div className="flex items-center justify-center py-12 text-text-muted">
      <span className="material-symbols-outlined text-[32px] animate-spin">progress_activity</span>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6 sm:gap-8">
      {/* Period selector (hidden when controlled by parent) */}
      {!hidePeriodSelector && (
        <div className="flex w-full items-center gap-2 sm:w-auto sm:self-end">
          <div className="grid flex-1 grid-cols-5 items-center gap-1 rounded-lg border border-border bg-bg-subtle p-1 sm:flex sm:flex-none">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                disabled={fetching}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${period === p.value ? "bg-primary text-white shadow-sm" : "text-text-muted hover:bg-bg-hover hover:text-text"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {fetching && (
            <span className="material-symbols-outlined text-[16px] text-text-muted animate-spin">progress_activity</span>
          )}
        </div>
      )}

      {/* Overview cards */}
      {loading ? spinner : <OverviewCards stats={stats} />}

      {/* Analytics leads; live routing remains available below without moving on updates. */}
      {loading ? spinner : (
        <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(260px,1fr)]">
          <UsageChart period={period} />
          <RecentRequests requests={stats.recentRequests || []} connected={streamConnected} />
        </div>
      )}
      {loading ? spinner : (
        <Card padding="none" className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Routing map</p>
              <h2 className="text-lg font-semibold tracking-tight">Your connected workspace</h2>
            </div>
            <span className="rounded-full bg-surface-2 px-3 py-1.5 text-xs text-text-muted">{providers.length} {providers.length === 1 ? "provider" : "providers"}</span>
          </div>
          <div className="p-2 sm:p-3">
            <ProviderTopology providers={providers} activeRequests={stats.activeRequests || []} lastProvider={stats.recentRequests?.[0]?.provider || ""} errorProvider={stats.errorProvider || ""} />
          </div>
        </Card>
      )}

      {/* Table with dropdown selector */}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Explore the details</p>
            <h2 className="text-lg font-semibold tracking-tight">Consumption breakdown</h2>
          </div>
          <div className="flex flex-col gap-2 min-[440px]:flex-row">
          <select
            aria-label="Group usage by"
            value={tableView}
            onChange={(e) => setTableView(e.target.value)}
            className="min-h-11 w-full min-w-0 rounded-xl border border-border-subtle bg-surface px-3 text-xs font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50 min-[440px]:w-auto"
            style={{ colorScheme: 'auto' }}
          >
            {TABLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 items-center gap-1 rounded-xl border border-border-subtle bg-surface-2 p-1">
            <button
              onClick={() => setViewMode("costs")}
              aria-pressed={viewMode === "costs"}
              className={`min-h-9 rounded-lg px-4 text-xs font-semibold transition-colors ${viewMode === "costs" ? "bg-surface text-text-main shadow-sm" : "text-text-muted hover:text-text-main"}`}
            >
              Costs
            </button>
            <button
              onClick={() => setViewMode("tokens")}
              aria-pressed={viewMode === "tokens"}
              className={`min-h-9 rounded-lg px-4 text-xs font-semibold transition-colors ${viewMode === "tokens" ? "bg-surface text-text-main shadow-sm" : "text-text-muted hover:text-text-main"}`}
            >
              Tokens
            </button>
          </div>
        </div>
        </div>
        {fetching && <p role="status" className="text-xs text-text-muted">Updating selected period…</p>}
        {loading ? spinner : activeTableConfig && (
          <UsageTable
            title=""
            columns={activeTableConfig.columns}
            groupedData={activeTableConfig.groupedData}
            tableType={tableView}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onToggleSort={toggleSort}
            viewMode={viewMode}
            storageKey={activeTableConfig.storageKey}
            renderSummaryCells={activeTableConfig.renderSummaryCells}
            renderDetailCells={activeTableConfig.renderDetailCells}
            emptyMessage={activeTableConfig.emptyMessage}
          />
        )}
      </div>
    </div>
  );
}
