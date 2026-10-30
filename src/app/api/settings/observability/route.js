import { NextResponse } from "next/server";
import { hasValidCliToken, hasValidToken } from "@/dashboardGuard";
import { updateSettings } from "@/lib/db/index.js";
import { resolveObservabilityState } from "@/lib/db/repos/requestDetailsRepo.js";

const RESPONSE_HEADERS = { "Cache-Control": "no-store" };

// This setting stays protected from generic mass assignment. Changing request
// recording requires a real dashboard session or the installation's CLI proof,
// including when the operator allows unauthenticated dashboard viewing.
export async function PATCH(request) {
  if (!(await hasValidCliToken(request) || await hasValidToken(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: RESPONSE_HEADERS });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "JSON request required" }, { status: 415, headers: RESPONSE_HEADERS });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: RESPONSE_HEADERS });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)
      || typeof body.enableObservability !== "boolean"
      || Object.keys(body).some(key => key !== "enableObservability")) {
    return NextResponse.json({ error: "A Boolean enableObservability setting is required" }, { status: 400, headers: RESPONSE_HEADERS });
  }

  try {
    const settings = await updateSettings({ enableObservability: body.enableObservability });
    const effective = resolveObservabilityState(settings);
    return NextResponse.json({
      enableObservability: settings.enableObservability === true,
      observabilityEnabled: effective.enabled,
      observabilitySource: effective.source,
    }, { headers: RESPONSE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Failed to update observability settings" }, { status: 500, headers: RESPONSE_HEADERS });
  }
}
