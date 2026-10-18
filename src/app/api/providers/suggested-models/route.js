import { NextResponse } from "next/server";
import { FILTERS } from "./filters.js";
import { fetchPublic, fetchTrustedLocal } from "@/shared/utils/ssrfGuard.js";
import { readJsonResponse } from "@/shared/utils/readJsonResponse.js";
import { isLocalRequest } from "@/dashboardGuard";

export const dynamic = "force-dynamic";
const TIMEOUT_MS = 10000;
const MAX_CATALOG_BYTES = 8 * 1024 * 1024;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const type = searchParams.get("type");

  if (!url || !type) {
    return NextResponse.json({ error: "Missing url or type" }, { status: 400 });
  }

  const filter = FILTERS[type];
  if (!filter) {
    return NextResponse.json({ error: "Unknown filter type" }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const fetchCatalog = isLocalRequest(request) ? fetchTrustedLocal : fetchPublic;
    const res = await fetchCatalog(url, { signal: AbortSignal.any([request.signal, controller.signal]) });
    if (!res.ok) {
      await res.body?.cancel();
      return NextResponse.json({ data: [] });
    }
    const json = await readJsonResponse(res, MAX_CATALOG_BYTES);
    const raw = json.data ?? json.models ?? json;
    const data = filter(Array.isArray(raw) ? raw : []);
    return NextResponse.json({ data });
  } catch (error) {
    if (error.message?.startsWith("Blocked URL:")) {
      return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
    }
    return NextResponse.json({ data: [] });
  } finally {
    clearTimeout(timer);
  }
}
