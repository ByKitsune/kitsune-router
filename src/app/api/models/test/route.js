import { NextResponse } from "next/server";
import { pingModelByKind } from "./ping";
import { SERVICE_TIER_OPTIONS } from "open-sse/providers/serviceTiers.js";

const REQUEST_TIERS = new Set([...SERVICE_TIER_OPTIONS.map(option => option.value), "priority", "flex", "scale"]);

// POST /api/models/test - Ping a single model via internal completions or embeddings
export async function POST(request) {
  try {
    const body = await request.json();
    const { model, kind } = body;
    if (!model) return NextResponse.json({ error: "Model required" }, { status: 400 });
    const controls = {};
    if (Object.hasOwn(body, "service_tier")) {
      if ((kind && kind !== "llm") || !REQUEST_TIERS.has(body.service_tier)) {
        return NextResponse.json({ ok: false, error: "Invalid processing tier for this model test" }, { status: 400 });
      }
      controls.service_tier = body.service_tier;
    }
    const result = await pingModelByKind(model, kind || "llm", undefined, controls);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
