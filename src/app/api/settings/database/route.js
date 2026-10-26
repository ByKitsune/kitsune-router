import { NextResponse } from "next/server";
import { exportDb, getProviderConnections, getSettings, importDb, validateApiKey } from "@/lib/localDb";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import { verifyDashboardPassword } from "@/lib/auth/dashboardSession";
import { hasValidCliToken, hasValidToken } from "@/dashboardGuard";
import { releaseConnection } from "@/sse/services/tokenRefresh";
import { setCachedPassword } from "@/mitm/manager";

const CLI_TOKEN_HEADER = "x-kitsune-router-cli-token";
const PASSWORD_HEADER = "x-kitsune-router-password";

function extractApiKey(request) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  const apiKeyHeader = request.headers.get("x-api-key");
  if (apiKeyHeader) return apiKeyHeader;
  const googleHeader = request.headers.get("x-goog-api-key");
  if (googleHeader) return googleHeader;
  return request.nextUrl.searchParams?.get("key") || null;
}

async function hasValidApiKey(request) {
  // CLI token counts as API-key equivalent for local tooling
  if (await hasValidCliToken(request)) return true;
  const apiKey = extractApiKey(request);
  if (!apiKey) return false;
  return await validateApiKey(apiKey);
}

async function checkAuth(request, password) {
  const hasJwt = await hasValidToken(request);
  const hasApiKey = await hasValidApiKey(request);
  // Dual-auth: require BOTH a valid JWT (auth cookie) AND a valid API key/CLI token,
  // plus password re-auth for sensitive export/import.
  if (!hasJwt || !hasApiKey) return false;
  return Boolean(password) && await verifyDashboardPassword(password);
}

export async function GET(request) {
  try {
    if (!(await checkAuth(request, request.headers.get(PASSWORD_HEADER)))) {
      return NextResponse.json({ error: "Unauthorized: valid auth and password required" }, { status: 401 });
    }
    const payload = await exportDb();
    return NextResponse.json(payload);
  } catch (error) {
    console.log("Error exporting database:", error);
    return NextResponse.json({ error: "Failed to export database" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { password, ...payload } = await request.json();
    if (!(await checkAuth(request, password))) {
      return NextResponse.json({ error: "Unauthorized: valid auth and password required" }, { status: 401 });
    }
    const previousConnections = await getProviderConnections();
    try {
      await importDb(payload);
    } catch (error) {
      if (error.code === "DB_IMPORT_SYNC_FAILED") {
        setCachedPassword(null);
        for (const connection of previousConnections) releaseConnection(connection.id);
      }
      throw error;
    }
    setCachedPassword(null);
    for (const connection of previousConnections) releaseConnection(connection.id);

    // Ensure proxy settings take effect immediately after a DB import.
    try {
      const settings = await getSettings();
      applyOutboundProxyEnv(settings);
    } catch (err) {
      console.warn("[Settings][DatabaseImport] Failed to re-apply outbound proxy env:", err);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error importing database:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to import database" },
      { status: error?.code === "DB_IMPORT_SYNC_FAILED" ? 500 : 400 }
    );
  }
}
