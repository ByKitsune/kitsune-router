import { NextResponse } from "next/server";
import { getCustomModels, addCustomModel, deleteCustomModel } from "@/models";
import { CAPACITY_META } from "@/shared/constants/models";
import { invalidateDeclaredModelCaps } from "open-sse/providers/declaredCaps.js";

export const dynamic = "force-dynamic";

// Capability booleans and token limits have distinct types. Preserve explicit
// input ceilings separately from total context; never derive one from the other.
function sanitizeCaps(caps, metadata) {
  const source = caps && typeof caps === "object" ? caps : {};
  const clean = {};
  for (const key of Object.keys(CAPACITY_META)) {
    if (typeof source[key] === "boolean") clean[key] = source[key];
  }
  const limitNames = {
    contextWindow: ["context_length", "context_window", "contextLength"],
    maxInput: ["max_input_tokens", "maxInputTokens"],
    maxOutput: ["max_completion_tokens", "max_output_tokens", "maxOutputTokens"],
  };
  for (const [key, aliases] of Object.entries(limitNames)) {
    let value = source[key] ?? metadata[key];
    if (value == null) {
      for (const alias of aliases) {
        if (metadata[alias] != null) { value = metadata[alias]; break; }
      }
    }
    if (Number.isSafeInteger(value) && value > 0) clean[key] = value;
  }
  return Object.keys(clean).length ? clean : null;
}

// GET /api/models/custom - List all custom models
export async function GET() {
  try {
    const models = await getCustomModels();
    return NextResponse.json({ models });
  } catch (error) {
    console.log("Error fetching custom models:", error);
    return NextResponse.json({ error: "Failed to fetch custom models" }, { status: 500 });
  }
}

// POST /api/models/custom - Add custom model
export async function POST(request) {
  try {
    const metadata = await request.json();
    const { providerAlias, id, type, name, caps } = metadata;
    if (!providerAlias || !id) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }
    const cleanCaps = sanitizeCaps(caps, metadata);
    const added = await addCustomModel({ providerAlias, id, type: type || "llm", name, ...(cleanCaps ? { caps: cleanCaps } : {}) });
    invalidateDeclaredModelCaps();
    return NextResponse.json({ success: true, added });
  } catch (error) {
    console.log("Error adding custom model:", error);
    return NextResponse.json({ error: "Failed to add custom model" }, { status: 500 });
  }
}

// DELETE /api/models/custom?providerAlias=xxx&id=yyy&type=zzz
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerAlias = searchParams.get("providerAlias");
    const id = searchParams.get("id");
    const type = searchParams.get("type") || "llm";
    if (!providerAlias || !id) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }
    await deleteCustomModel({ providerAlias, id, type });
    invalidateDeclaredModelCaps();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting custom model:", error);
    return NextResponse.json({ error: "Failed to delete custom model" }, { status: 500 });
  }
}
