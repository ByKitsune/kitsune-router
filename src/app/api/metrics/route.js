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
import { getUsageStats, getRecentLogs } from "@/lib/usageDb";
import { hasValidCliToken, isAuthenticated } from "@/dashboardGuard";
import { APP_CONFIG } from "@/shared/constants/config.js";

export const dynamic = "force-dynamic";

const startedAt = Date.now();

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
  lines.push(line("zenrouter_up", 1, null, "1 when the metrics endpoint is serving", "gauge"));
  lines.push(line("zenrouter_info", 1, { version: APP_CONFIG.version }, "Build information", "gauge"));
  lines.push(line("zenrouter_uptime_seconds", Math.floor((Date.now() - startedAt) / 1000), null, "Process uptime", "gauge"));

  let stats = null;
  try {
    stats = await getUsageStats("24h");
  } catch {
    // Metrics must serve something even when the stats query fails; the `up`
    // gauge and uptime still answer "is the process alive".
  }

  lines.push(line("zenrouter_metrics_scrape_ok", stats ? 1 : 0, null, "1 when usage stats were read successfully", "gauge"));

  if (stats) {
    // Aggregate totals only.
    //
    // `getUsageStats` ALSO returns byAccount/byApiKey rows, and those carry
    // account emails and key names — none of that may leave the process here.
    // Only the scalar totals and the per-model request counts are read.
    lines.push(line("zenrouter_requests_total", stats.totalRequests || 0, null, "Requests in the window", "counter"));
    lines.push(line("zenrouter_prompt_tokens_total", stats.totalPromptTokens || 0, null, "Prompt tokens in the window", "counter"));
    lines.push(line("zenrouter_completion_tokens_total", stats.totalCompletionTokens || 0, null, "Completion tokens in the window", "counter"));
    lines.push(line("zenrouter_cached_tokens_total", stats.totalCachedTokens || 0, null, "Cached prompt tokens in the window", "counter"));
    lines.push(line("zenrouter_cost_usd_total", round(stats.totalCost, 6), null, "Reported cost in the window", "counter"));

    // Per-model request counts. The model id is already published in the
    // client-visible catalog, so it is not internal detail — but the provider
    // column is deliberately omitted.
    const byModel = stats.byModel && typeof stats.byModel === "object" ? Object.entries(stats.byModel) : [];
    if (byModel.length) {
      lines.push("# HELP zenrouter_model_requests_total Requests in the window, by model");
      lines.push("# TYPE zenrouter_model_requests_total counter");
      for (const [key, row] of byModel.slice(0, 200)) {
        const model = row?.rawModel || String(key).split(" (")[0];
        lines.push(`zenrouter_model_requests_total{model="${escapeLabel(model)}"} ${Number(row?.requests) || 0}`);
      }
    }

    // Latency. This is the number P04 asked for and that previously existed only
    // as a journald line. Emitted only when samples exist, so a Prometheus scrape
    // never records a misleading 0 for "no measurements yet".
    if (stats.latency?.samples > 0) {
      const l = stats.latency;
      lines.push("# HELP zenrouter_ttft_ms Time to first token, over recorded samples");
      lines.push("# TYPE zenrouter_ttft_ms gauge");
      if (Number.isFinite(l.ttftMedianMs)) lines.push(`zenrouter_ttft_ms{quantile="0.5"} ${l.ttftMedianMs}`);
      if (Number.isFinite(l.ttftP90Ms)) lines.push(`zenrouter_ttft_ms{quantile="0.9"} ${l.ttftP90Ms}`);
      if (Number.isFinite(l.ttftMinMs)) lines.push(`zenrouter_ttft_ms{quantile="0"} ${l.ttftMinMs}`);
      if (Number.isFinite(l.ttftMaxMs)) lines.push(`zenrouter_ttft_ms{quantile="1"} ${l.ttftMaxMs}`);
      if (Number.isFinite(l.ttftMeanMs)) lines.push(`zenrouter_ttft_ms{quantile="mean"} ${l.ttftMeanMs}`);
      lines.push(`zenrouter_ttft_samples_total ${l.samples}`);
    }

    // In-flight work: lets an operator see a stuck queue without the dashboard.
    if (Array.isArray(stats.activeRequests)) {
      const inflight = stats.activeRequests.reduce((n, r) => n + (Number(r?.count) || 0), 0);
      lines.push(line("zenrouter_requests_in_flight", inflight, null, "Requests currently being served", "gauge"));
    }
  }

  // Failure breakdown by HTTP status, parsed from the recorded log status
  // ("FAILED 429"), so "is it 401 or 429?" is answerable without grepping
  // journald by hand.
  try {
    const logs = await getRecentLogs(500);
    const counts = new Map();
    for (const entry of logs) {
      const match = /FAILED\s+(\d{3})/.exec(entry?.status || "");
      if (match) counts.set(match[1], (counts.get(match[1]) || 0) + 1);
    }
    if (counts.size) {
      lines.push("# HELP zenrouter_failures_total Recorded failures, by HTTP status");
      lines.push("# TYPE zenrouter_failures_total counter");
      for (const status of [...counts.keys()].sort()) {
        lines.push(`zenrouter_failures_total{status="${status}"} ${counts.get(status)}`);
      }
    }
  } catch {
    // Failure counts are best-effort.
  }

  return new NextResponse(`${lines.join("\n")}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
