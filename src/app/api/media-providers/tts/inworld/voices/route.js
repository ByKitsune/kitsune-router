import { NextResponse } from "next/server";
import { getProviderConnections } from "@/lib/localDb";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { discardTtsBody, getTtsTransport, readTtsJson } from "open-sse/handlers/ttsProviders/_base.js";

const langNames = new Intl.DisplayNames(["en"], { type: "language" });

/**
 * GET /api/media-providers/tts/inworld/voices[?lang=en]
 * Returns { languages, byLang } grouped by language code (same shape as edge-tts/elevenlabs)
 */
export async function GET(request) {
  try {
    if (request.signal?.aborted) return NextResponse.json({ error: "Client closed request" }, { status: 499 });
    const { searchParams } = new URL(request.url);
    const langFilter = searchParams.get("lang");

    const connections = await getProviderConnections({ provider: "inworld", isActive: true });
    const account = connections[0];
    const apiKey = account?.apiKey;
    if (!apiKey) return NextResponse.json({ error: "No Inworld connection found" }, { status: 400 });

    const sourcePolicy = account.providerSpecificData || {};
    const proxyOptions = sourcePolicy.proxyPoolId && sourcePolicy.proxyPoolId !== "__none__"
      ? await resolveConnectionProxyConfig(sourcePolicy) : sourcePolicy;
    const transport = getTtsTransport(account, { signal: request.signal, proxyOptions });
    const res = await transport.fetch("https://api.inworld.ai/tts/v1/voices", {
      headers: { "Authorization": `Basic ${apiKey}` },
    });
    if (!res.ok) {
      discardTtsBody(res);
      return NextResponse.json({ error: `Inworld voice API returned HTTP ${res.status}` }, { status: 502 });
    }
    const data = await readTtsJson(res, request.signal);
    const voices = data.voices || [];

    const byLang = {};
    for (const v of voices) {
      // Each voice has `languages: ["en", "es", ...]`
      const langs = Array.isArray(v.languages) && v.languages.length ? v.languages : ["en"];
      for (const code of langs) {
        if (!byLang[code]) {
          byLang[code] = {
            code,
            name: (() => { try { return langNames.of(code); } catch { return code; } })(),
            voices: [],
          };
        }
        if (!byLang[code].voices.find((x) => x.id === v.voiceId)) {
          byLang[code].voices.push({
            id: v.voiceId,
            name: v.displayName || v.voiceId,
            gender: v.gender || "",
            lang: code,
          });
        }
      }
    }

    const languages = Object.values(byLang).sort((a, b) => a.name.localeCompare(b.name));

    if (langFilter) {
      return NextResponse.json({ voices: byLang[langFilter]?.voices || [] });
    }
    return NextResponse.json({ languages, byLang });
  } catch (err) {
    if (request.signal?.aborted) return NextResponse.json({ error: "Client closed request" }, { status: 499 });
    if (err.code === "TTS_HEADER_TIMEOUT") return NextResponse.json({ error: "TTS response headers timed out" }, { status: 408 });
    return NextResponse.json({ error: "Failed to fetch Inworld voices" }, { status: 502 });
  }
}
