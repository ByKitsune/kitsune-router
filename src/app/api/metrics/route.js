// Prometheus-format metrics.
//
// Motivation (P04): every metric in this gateway existed only as a line of text
// in journald. Answering "what is the TTFT p90 per model this hour?" or "what
// fraction of failures are 401 vs 429?" required grepping logs by hand. ByKitsune
// already exposes /api/metrics in Prometheus format, so this is the familiar
// shape for the operator.
//
// Security:
//  - Token-gated. Unlike /api/health (a liveness probe the tunnel watchdog
//    reads), metrics reveal traffic shape and per-model behaviour, so they are
//    NOT public. Access requires the CLI token or a dashboard session.
//  - The output is strictly AGGREGATE. Provider, model and account labels come
//    from internal routing; per-account labels are omitted entirely and
//    per-model labels are only emitted for models that already appear in the
//    client-visible catalog. No emails, no tokens, no API keys, no prompts.
import { NextResponse } from "next/server";
import { getUsageStats, getRequestFailureCounts } from "@/lib/db/repos/usageRepo.js";
import { hasValidCliToken, isAuthenticated } from "@/dashboardGuard";
import { APP_CONFIG } from "@/shared/constants/config.js";
import { PROVIDER_MODELS } from "open-sse/config/providerModels.js";
import { getRequestPhaseMetrics } from "open-sse/utils/requestTiming.js";
import { getDbCacheMetrics } from "@/lib/db/helpers/scopedCache.js";
import { getUsageQueueMetrics } from "@/lib/db/repos/usageRepo.js";
import { getRequestDetailQueueMetrics } from "@/lib/db/repos/requestDetailsRepo.js";
import { getRequestLogQueueMetrics } from "open-sse/utils/requestLogger.js";
import { getUpstreamPoolStats } from "open-sse/utils/transportPool.js";

export const dynamic = "force-dynamic";

const startedAt = Date.now();
const publicModels = new Set(Object.values(PROVIDER_MODELS).flatMap((models) => models.map((model) => model.id)));

async function requireAuth(request) {
  return (await hasValidCliToken(request)) || (await isAuthenticated(request));
}

// Prometheus label values must escape backslash, quote and newline.
function escapeLabel(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function line(name, value, labels = null, help = null, type = null) {
  const out = [];
  if (help) out.push(`# HELP ${name} ${help}`);
  if (type) out.push(`# TYPE ${name} ${type}`);
  const labelStr = labels && Object.keys(labels).length
    ? `{${Object.entries(labels).map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(",")}}`
    : "";
  out.push(`${name}${labelStr} ${Number.isFinite(value) ? value : 0}`);
  return out.join("\n");
}

// Round a float for stable output (Prometheus accepts any precision, but stable
// text keeps diffs and golden tests readable).
const round = (n, digits = 3) => {
  const f = 10 ** digits;
  return Math.round((Number(n) || 0) * f) / f;
};

export async function GET(request) {
  if (!(await requireAuth(request))) {
    // Deliberately terse: do not reveal whether the endpoint or the credential
    // was the problem.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lines = [];
  lines.push(line("kitsunerouter_up", 1, null, "1 when the metrics endpoint is serving", "gauge"));
  lines.push(line("kitsunerouter_info", 1, { version: APP_CONFIG.version }, "Build information", "gauge"));
  lines.push(line("kitsunerouter_uptime_seconds", Math.floor((Date.now() - startedAt) / 1000), null, "Process uptime", "gauge"));

  let stats = null;
  try {
    stats = await getUsageStats("24h");
  } catch {
    // Metrics must serve something even when the stats query fails; the `up`
    // gauge and uptime still answer "is the process alive".
  }

  lines.push(line("kitsunerouter_metrics_scrape_ok", stats ? 1 : 0, null, "1 when usage stats were read successfully", "gauge"));

  if (stats) {
    // Aggregate totals only.
    //
    // `getUsageStats` ALSO returns byAccount/byApiKey rows, and those carry
    // account emails and key names — none of that may leave the process here.
    // Only the scalar totals and the per-model request counts are read.
    // Preserve existing sample names for dashboards. Despite their legacy
    // `_total` suffix these are rolling 24h gauges, not monotonic counters:
    // retention, window expiry and DB imports can reduce them. Do not rate().
    lines.push(line("kitsunerouter_requests_total", stats.totalRequests || 0, null, "Usage records in the rolling 24h window (legacy gauge name)", "gauge"));
    lines.push(line("kitsunerouter_prompt_tokens_total", stats.totalPromptTokens || 0, null, "Prompt tokens in the rolling 24h window", "gauge"));
    lines.push(line("kitsunerouter_completion_tokens_total", stats.totalCompletionTokens || 0, null, "Completion tokens in the rolling 24h window", "gauge"));
    lines.push(line("kitsunerouter_cached_tokens_total", stats.totalCachedTokens || 0, null, "Cached prompt tokens in the rolling 24h window", "gauge"));
    if (stats.totalCost !== null) {
      lines.push(line("kitsunerouter_cost_usd_total", round(stats.totalCost, 6), null, "Reported cost in the rolling 24h window", "gauge"));
    }

    // Per-model request counts. The model id is already published in the
    // client-visible catalog, so it is not internal detail — but the provider
    // column is deliberately omitted.
    const byModel = stats.byModel && typeof stats.byModel === "object" ? Object.entries(stats.byModel) : [];
    const modelCounts = new Map();
    for (const [key, row] of byModel) {
      const model = row?.rawModel || String(key).split(" (")[0];
      // Custom/request-supplied model strings are not trusted public labels.
      if (!publicModels.has(model)) continue;
      // Provider is omitted, so combine providers to avoid duplicate series.
      modelCounts.set(model, (modelCounts.get(model) || 0) + (Number(row?.requests) || 0));
    }
    if (modelCounts.size) {
      lines.push("# HELP kitsunerouter_model_requests_total Usage records in the rolling 24h window, by public catalog model");
      lines.push("# TYPE kitsunerouter_model_requests_total gauge");
      for (const [model, count] of [...modelCounts].slice(0, 200)) {
        lines.push(`kitsunerouter_model_requests_total{model="${escapeLabel(model)}"} ${count}`);
      }
    }

    // Latency. This is the number P04 asked for and that previously existed only
    // as a journald line. Emitted only when samples exist, so a Prometheus scrape
    // never records a misleading 0 for "no measurements yet".
    if (stats.latency?.samples > 0) {
      const l = stats.latency;
      lines.push("# HELP kitsunerouter_ttft_ms Time to first token, over recorded samples in the rolling 24h window");
      lines.push("# TYPE kitsunerouter_ttft_ms gauge");
      if (Number.isFinite(l.ttftMedianMs)) lines.push(`kitsunerouter_ttft_ms{quantile="0.5"} ${l.ttftMedianMs}`);
      if (Number.isFinite(l.ttftP90Ms)) lines.push(`kitsunerouter_ttft_ms{quantile="0.9"} ${l.ttftP90Ms}`);
      if (Number.isFinite(l.ttftMinMs)) lines.push(`kitsunerouter_ttft_ms{quantile="0"} ${l.ttftMinMs}`);
      if (Number.isFinite(l.ttftMaxMs)) lines.push(`kitsunerouter_ttft_ms{quantile="1"} ${l.ttftMaxMs}`);
      if (Number.isFinite(l.ttftMeanMs)) lines.push(`kitsunerouter_ttft_ms{quantile="mean"} ${l.ttftMeanMs}`);
      lines.push(line("kitsunerouter_ttft_samples_total", l.samples, null, "Measured TTFT samples in the rolling 24h window", "gauge"));
    }

    // In-flight work: lets an operator see a stuck queue without the dashboard.
    if (Array.isArray(stats.activeRequests)) {
      const inflight = stats.activeRequests.reduce((n, r) => n + (Number(r?.count) || 0), 0);
      lines.push(line("kitsunerouter_requests_in_flight", inflight, null, "Requests currently being served", "gauge"));
    }
  }

  // True process-lifetime counters from terminal FAILED events, including
  // zero-token failures. Independent of UI string logs, DB availability and
  // retention. Not durable across restarts; never backfilled from usage rows.
  const failures = getRequestFailureCounts();
  if (Object.keys(failures).length) {
    lines.push("# HELP kitsunerouter_failures_total Terminal FAILED request-log events since process start (not persisted), by HTTP status");
    lines.push("# TYPE kitsunerouter_failures_total counter");
    for (const status of Object.keys(failures).sort()) {
      lines.push(`kitsunerouter_failures_total{status="${status}"} ${failures[status]}`);
    }
  }

  for (const metrics of getRequestPhaseMetrics()) {
    const labels = { phase: metrics.phase };
    lines.push(line("kitsunerouter_request_phase_samples_total", metrics.count, labels));
    lines.push(line("kitsunerouter_request_phase_milliseconds_total", round(metrics.totalMs, 6), labels));
    lines.push(line("kitsunerouter_request_phase_window_samples", metrics.windowSamples, labels));
    for (const quantile of ["p50", "p95", "p99"]) {
      lines.push(line("kitsunerouter_request_phase_milliseconds", round(metrics[quantile], 6), { ...labels, quantile }));
    }
  }

  for (const [name, metrics] of Object.entries(getDbCacheMetrics())) {
    for (const field of ["hits", "misses", "loads", "loadErrors", "coalesced", "evictions", "invalidations", "rejected", "entries", "bytes", "pending"]) {
      if (Number.isFinite(metrics[field])) lines.push(line(`kitsunerouter_config_cache_${field}`, metrics[field], { cache: name }));
    }
  }
  const queues = await Promise.allSettled([getUsageQueueMetrics(), getRequestDetailQueueMetrics()]);
  for (const [index, result] of queues.entries()) {
    const queue = index === 0 ? "usage" : "details";
    lines.push(line("kitsunerouter_background_queue_metrics_ok", result.status === "fulfilled" ? 1 : 0, { queue }));
    if (result.status === "fulfilled") {
      for (const field of ["depth", "bytes", "accepting", "accepted", "projected", "duplicates", "rejected", "errors", "written", "dropped", "retries"]) {
        if (Number.isFinite(result.value[field])) lines.push(line(`kitsunerouter_background_queue_${field}`, result.value[field], { queue }));
      }
    }
  }
  for (const [field, value] of Object.entries(getRequestLogQueueMetrics())) {
    if (Number.isFinite(value)) lines.push(line(`kitsunerouter_background_queue_${field}`, value, { queue: "files" }));
  }
  const pools = getUpstreamPoolStats();
  for (const field of ["active", "queued", "livePools", "created", "poolHits", "requests", "completed", "failed", "cancelled", "rejected", "connectionsCreated", "disposalErrors"]) {
    if (Number.isFinite(pools[field])) lines.push(line(`kitsunerouter_upstream_pool_${field}`, pools[field]));
  }

  return new NextResponse(`${lines.join("\n")}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
