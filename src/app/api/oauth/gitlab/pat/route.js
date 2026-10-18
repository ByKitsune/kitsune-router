import { NextResponse } from "next/server";
import { createProviderConnection } from "@/models";
import { isLocalRequest } from "@/dashboardGuard";
import { fetchPublic, fetchTrustedLocal } from "@/shared/utils/ssrfGuard.js";
import { getEnvProxyUrl } from "open-sse/utils/proxyFetch.js";

const GITLAB_DEFAULT_BASE = "https://gitlab.com";
const TIMEOUT_MS = 8000;

/**
 * POST /api/oauth/gitlab/pat
 * Authenticate GitLab Duo with a Personal Access Token (PAT)
 */
export async function POST(request) {
  const controller = new AbortController();
  let timeout;
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { token, baseUrl } = body || {};
    if (typeof token !== "string" || !token.trim()) {
      return NextResponse.json({ error: "Personal Access Token is required" }, { status: 400 });
    }

    if (baseUrl != null && typeof baseUrl !== "string") {
      return NextResponse.json({ error: "Invalid GitLab server URL" }, { status: 400 });
    }
    const base = (baseUrl?.trim() || GITLAB_DEFAULT_BASE).replace(/\/$/, "");
    let probeUrl;
    try {
      probeUrl = new URL(`${base}/api/v4/user`);
    } catch {
      return NextResponse.json({ error: "Invalid GitLab server URL" }, { status: 400 });
    }
    // The pinned connector cannot enforce target policy through a proxy. Honor
    // the existing NO_PROXY/loopback exemptions; otherwise fail closed.
    if (getEnvProxyUrl(probeUrl)) {
      return NextResponse.json({ error: "GitLab PAT verification cannot use the configured proxy safely; configure NO_PROXY for this GitLab server" }, { status: 503 });
    }

    timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const fetchUser = isLocalRequest(request) ? fetchTrustedLocal : fetchPublic;
    // Never forward Private-Token to a redirect, even on the same origin.
    const userRes = await fetchUser(probeUrl, {
      headers: { "Private-Token": token.trim(), Accept: "application/json" },
      signal: controller.signal,
    }, { maxRedirects: 0 });

    if (!userRes.ok) {
      await userRes.body?.cancel();
      return NextResponse.json({ error: `GitLab token verification failed (HTTP ${userRes.status})` }, { status: 401 });
    }

    const user = await userRes.json();
    clearTimeout(timeout);
    const email = user.email || user.public_email || "";

    await createProviderConnection({
      provider: "gitlab",
      authType: "oauth",
      accessToken: token.trim(),
      refreshToken: null,
      expiresAt: null,
      email,
      displayName: user.name || user.username || email,
      testStatus: "active",
      providerSpecificData: {
        username: user.username || "",
        email,
        name: user.name || "",
        baseUrl: base,
        authKind: "personal_access_token",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (controller.signal.aborted) {
      return NextResponse.json({ error: "GitLab token verification timed out" }, { status: 504 });
    }
    if (String(error?.message).startsWith("Blocked URL")) {
      return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
    }
    // Transport/JSON exceptions may contain URLs, PATs or upstream body snippets.
    console.error("GitLab PAT auth error");
    return NextResponse.json({ error: "GitLab PAT authentication failed. Check the server URL, token and TLS configuration." }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
