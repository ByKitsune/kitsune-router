// Deep health probe.
//
// Previously this endpoint returned a constant `{ ok: true }`, which made it
// useless as a health signal: the tunnel watchdog reads it, so it reported
// "healthy" even while the database was unreachable or accounts were locked in
// cooldown. An operator could not tell a working gateway from a broken one.
//
// Security: this endpoint can be reachable on public deployments, including
// through reverse proxies or tunnels, so it must never expose account emails,
// token material, API keys, provider ids or prompt content. It reports COUNTS
// and booleans only. Per-connection diagnostics stay in the authenticated
// dashboard API.
import { NextResponse } from "next/server";
import { getProviderConnections } from "@/lib/localDb";
import { isModelLockActive } from "open-sse/services/accountFallback.js";
import { APP_CONFIG } from "@/shared/constants/config.js";
import { corsHeaders } from "@/shared/utils/cors.js";

const startedAt = Date.now();

async function checkDatabase() {
  const t0 = Date.now();
  try {
    // A real read, not just a connection handle: this is what proves the
    // storage layer answers.
    const connections = await getProviderConnections({});
    return { ok: true, latencyMs: Date.now() - t0, accounts: connections.length };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - t0, error: error?.name || "Error" };
  }
}

export async function GET() {
  const db = await checkDatabase();

  // Cooldown accounting: how many connections are locked right now and how many
  // need a human to re-authenticate. Counts only — never the identities.
  let lockedNow = 0;
  let needsReauth = 0;
  if (db.ok) {
    try {
      const connections = await getProviderConnections({});
      const now = Date.now();
      for (const conn of connections) {
        const hasActiveLock = Object.entries(conn).some(([k, v]) =>
          k.startsWith("modelLock_") && v && new Date(v).getTime() > now,
        ) || isModelLockActive(conn, "__all");
        if (hasActiveLock) lockedNow += 1;
        if (conn.testStatus === "needs_reauth") needsReauth += 1;
      }
    } catch {
      // Counting is best-effort; a failure here must not fail the probe.
    }
  }

  const body = {
    ok: db.ok,
    status: db.ok ? "ready" : "degraded",
    version: APP_CONFIG.version,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    checks: {
      database: db.ok,
      ...(db.ok ? { accounts: db.accounts } : {}),
    },
    accounts: {
      locked: lockedNow,
      needsReauth,
    },
    latency: { databaseMs: db.latencyMs },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: db.ok ? 200 : 503,
    headers: corsHeaders({ "Cache-Control": "no-store" }),
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
