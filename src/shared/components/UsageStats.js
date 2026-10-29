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

const USAGE_REFRESH_DELAY_MS = 400;
const USAGE_FETCH_TIMEOUT_MS = 15000;
const STREAM_BREAKDOWN_FIELDS = new Set(["byProvider", "byModel", "byAccount", "byApiKey", "byEndpoint"]);
const STREAM_COMMITTED_FIELDS = [
  "totalRequests", "totalPromptTokens", "totalCompletionTokens", "totalCachedTokens", "totalCost",
  "inputCost", "cachedCost", "outputCost", "costCoverage", "latency", ...STREAM_BREAKDOWN_FIELDS,
];
const STREAM_VOLATILE_FIELDS = new Set(["pending", "activeRequests", "recentRequests", "errorProvider", "last10Minutes"]);

function committedBreakdown(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  let filtered = null;
  for (const [key, row] of Object.entries(value)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const fields = Object.keys(row);
    if (!fields.some((field) => STREAM_VOLATILE_FIELDS.has(field))) continue;
    if (!filtered) filtered = Object.assign(Object.create(null), value);
    const committedRow = Object.create(null);
    for (const field of fields) {
      if (!STREAM_VOLATILE_FIELDS.has(field)) committedRow[field] = row[field];
    }
    filtered[key] = committedRow;
  }
  return filtered || value;
}

function committedStreamSnapshot(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const snapshot = {};
  let hasCommittedField = false;
  for (const field of STREAM_COMMITTED_FIELDS) {
    if (!Object.hasOwn(data, field)) continue;
    hasCommittedField = true;
    snapshot[field] = STREAM_BREAKDOWN_FIELDS.has(field) ? committedBreakdown(data[field]) : data[field];
  }
  return hasCommittedField ? snapshot : null;
}

// Compare JSON values without sorting or retaining an extra serialized copy.
function sameStreamSnapshot(previous, next) {
  const pending = [[previous, next]];
  while (pending.length) {
    const [left, right] = pending.pop();
    if (left === right) continue;
    if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length) return false;
    for (const key of keys) {
      if (!Object.hasOwn(right, key)) return false;
      if (left[key] !== right[key]) pending.push([left[key], right[key]]);
    }
  }
  return true;
}

function periodLabel(period) {
  return PERIODS.find((item) => item.value === period)?.label || period;
}

export default function UsageStats({ period: periodProp, setPeriod: setPeriodProp, hidePeriodSelector = false } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sortBy = searchParams.get("sortBy") || "rawModel";
  const sortOrder = searchParams.get("sortOrder") || "asc";

  const [statsSnapshot, setStatsSnapshot] = useState(null);
  const [chartSnapshot, setChartSnapshot] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [chartError, setChartError] = useState(null);
  const [live, setLive] = useState(null);
  const [streamDisconnected, setStreamDisconnected] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [tableView, setTableView] = useState("model");
  const [viewMode, setViewMode] = useState("costs");
  const [providers, setProviders] = useState([]);
  const [periodLocal, setPeriodLocal] = useState("today");
  const refreshRef = useRef(null);
  const period = periodProp ?? periodLocal;
  const setPeriod = setPeriodProp ?? setPeriodLocal;
  const stats = useMemo(() => statsSnapshot ? { ...statsSnapshot.data, ...live } : null, [statsSnapshot, live]);

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

  // Both endpoints always use the selected period. Keep the last successful
  // snapshots (and their period labels) if a refresh fails or a period changes.
  useEffect(() => {
    let active = true;
    let inFlight = false;
    let dirty = false;
    let debounceTimer = null;
    let timeoutTimer = null;
    let controller = null;

    const schedule = () => {
      if (!active) return;
      if (inFlight) { dirty = true; return; }
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        refresh();
      }, USAGE_REFRESH_DELAY_MS);
    };

    const refresh = async () => {
      if (!active) return;
      if (inFlight) { dirty = true; return; }
      inFlight = true;
      dirty = false;
      controller = new AbortController();
      const signal = controller.signal;
      let timedOut = false;
      timeoutTimer = setTimeout(() => { timedOut = true; controller.abort(); }, USAGE_FETCH_TIMEOUT_MS);
      setFetching(true);

      const load = async (kind) => {
        try {
          const response = await fetch(`/api/usage/${kind}?period=${encodeURIComponent(period)}`, { signal, cache: "no-store" });
          if (!response.ok) throw Object.assign(new Error("Usage request failed"), { status: response.status });
          const data = await response.json();
          if (kind === "stats" ? !data || typeof data !== "object" || !Number.isFinite(data.totalRequests) : !Array.isArray(data)) {
            throw new Error("Invalid usage response");
          }
          if (!active) return;
          if (signal.aborted) {
            if (timedOut) throw new Error("Usage request timed out");
            return;
          }
          if (kind === "stats") {
            setStatsSnapshot({ period, data });
            setStatsError(null);
          } else {
            setChartSnapshot({ period, data });
            setChartError(null);
          }
        } catch (error) {
          if (!active || (signal.aborted && !timedOut)) return;
          const message = error?.status === 401 || error?.status === 403
            ? "Your session may have expired. Sign in again and retry."
            : timedOut ? "The request timed out. Please retry."
              : error?.status ? "The service returned an error. Please retry." : "Please check your connection and retry.";
          if (kind === "stats") setStatsError({ period, message });
          else setChartError({ period, message });
        }
      };

      await Promise.all([load("stats"), load("chart")]);
      clearTimeout(timeoutTimer);
      if (!active) return;
      inFlight = false;
      controller = null;
      if (dirty) schedule();
      else {
        setFetching(false);
      }
    };

    const retry = () => {
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
      void refresh();
    };
    refreshRef.current = { schedule, retry };
    void refresh();

    return () => {
      active = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      controller?.abort();
      refreshRef.current = null;
    };
  }, [period]);

  // Live fields are independent of period totals, so they remain useful even
  // when the stats endpoint fails. Pending-only messages do not trigger a refetch.
  useEffect(() => {
    const es = new EventSource("/api/usage/stream");
    let supportsNamedUpdates = false;
    let lastStreamSnapshot = null;
    const onUsageUpdated = () => {
      supportsNamedUpdates = true;
      lastStreamSnapshot = null;
      refreshRef.current?.schedule();
    };
    es.addEventListener("usage-updated", onUsageUpdated);

    // Catch commits that occurred before subscription, including on reconnect.
    es.onopen = () => {
      supportsNamedUpdates = false;
      lastStreamSnapshot = null;
      setStreamDisconnected(false);
      setStreamConnected(true);
      refreshRef.current?.schedule();
    };
    es.onerror = () => {
      setStreamConnected(false);
      setStreamDisconnected(true);
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        // Older servers only send all-time snapshots. Committed aggregates and
        // breakdowns are invalidation hints, never selected-period totals.
        // Pending-only messages leave the committed snapshot unchanged.
        if (!supportsNamedUpdates) {
          const snapshot = committedStreamSnapshot(data);
          if (snapshot) {
            if (lastStreamSnapshot === null || !sameStreamSnapshot(lastStreamSnapshot, snapshot)) refreshRef.current?.schedule();
            lastStreamSnapshot = snapshot;
          }
        }
        const fields = {};
        for (const key of ["activeRequests", "recentRequests", "errorProvider", "pending"]) {
          if (Object.hasOwn(data, key)) fields[key] = data[key];
        }
        setLive((prev) => ({ ...prev, ...fields }));
      } catch {
        console.error("[SSE CLIENT] Could not parse usage stream message.");
      }
    };

    return () => {
      es.removeEventListener("usage-updated", onUsageUpdated);
      es.onopen = null;
      es.onmessage = null;
      es.onerror = null;
      es.close();
    };
  }, []);

  // Keep the chart's retry prop stable when only streamed activity changes.
  const retry = useCallback(() => refreshRef.current?.retry(), []);

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

  const spinner = (
    <div className="flex items-center justify-center py-12 text-text-muted">
      <span className="material-symbols-outlined text-[32px] animate-spin">progress_activity</span>
    </div>
  );
  const currentStatsError = statsError?.period === period ? statsError : null;
  const liveStats = stats || live;

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

      {streamDisconnected && (
        <p role="status" className="text-sm text-text-muted">
          Live updates disconnected. Reconnecting automatically.{' '}
          <button type="button" onClick={retry} className="font-semibold text-primary underline">Refresh now</button>
        </p>
      )}

      {currentStatsError ? (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warning/40 bg-bg-subtle p-3 text-sm text-text-main">
          <span>
            Could not load {periodLabel(period)} usage statistics. {currentStatsError.message}
            {statsSnapshot && ` Showing last successful ${periodLabel(statsSnapshot.period)} data.`}
          </span>
          <button type="button" onClick={retry} className="font-semibold text-primary underline">Retry statistics</button>
        </div>
      ) : statsSnapshot && statsSnapshot.period !== period ? (
        <p role="status" className="text-sm text-text-muted">
          Showing {periodLabel(statsSnapshot.period)} data while {periodLabel(period)} loads.
        </p>
      ) : null}

      {/* Overview cards */}
      {stats ? <OverviewCards stats={stats} /> : fetching ? spinner : null}

      {/* Keep period-specific charts separate from independently streamed activity. */}
      <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(260px,1fr)]">
        <UsageChart
          period={period}
          periodLabel={periodLabel(period)}
          snapshot={chartSnapshot}
          snapshotPeriodLabel={chartSnapshot ? periodLabel(chartSnapshot.period) : ""}
          error={chartError?.period === period ? chartError : null}
          fetching={fetching}
          onRetry={retry}
        />
        <RecentRequests requests={liveStats?.recentRequests || []} connected={streamConnected} />
      </div>
      {liveStats ? (
        <Card padding="none" className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">Routing map</p>
              <h2 className="text-lg font-semibold tracking-tight">Your connected workspace</h2>
            </div>
            <span className="rounded-full bg-surface-2 px-3 py-1.5 text-xs text-text-muted">{providers.length} {providers.length === 1 ? "provider" : "providers"}</span>
          </div>
          <div className="p-2 sm:p-3">
            <ProviderTopology providers={providers} activeRequests={liveStats.activeRequests || []} lastProvider={liveStats.recentRequests?.[0]?.provider || ""} errorProvider={liveStats.errorProvider || ""} />
          </div>
        </Card>
      ) : fetching ? spinner : null}

      {/* Table with dropdown selector */}
      {stats && <div className="flex min-w-0 flex-col gap-4">
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
        {activeTableConfig && (
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
      </div>}
    </div>
  );
}
