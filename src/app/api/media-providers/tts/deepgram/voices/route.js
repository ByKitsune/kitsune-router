import { NextResponse } from "next/server";
import { getProviderConnections } from "@/lib/localDb";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { discardTtsBody, getTtsTransport, readTtsJson } from "open-sse/handlers/ttsProviders/_base.js";

const langNames = new Intl.DisplayNames(["en"], { type: "language" });

/**
 * GET /api/media-providers/tts/deepgram/voices[?lang=en]
 * Returns { languages, byLang } grouped by language code (same shape as edge-tts/elevenlabs/inworld)
 * Each Deepgram voice = one model (canonical_name like "aura-2-thalia-en")
 */
export async function GET(request) {
  try {
    if (request.signal?.aborted) return NextResponse.json({ error: "Client closed request" }, { status: 499 });
    const { searchParams } = new URL(request.url);
    const langFilter = searchParams.get("lang");

    const connections = await getProviderConnections({ provider: "deepgram", isActive: true });
    const account = connections[0];
    const apiKey = account?.apiKey;
    if (!apiKey) return NextResponse.json({ error: "No Deepgram connection found" }, { status: 400 });

    const sourcePolicy = account.providerSpecificData || {};
    const proxyOptions = sourcePolicy.proxyPoolId && sourcePolicy.proxyPoolId !== "__none__"
      ? await resolveConnectionProxyConfig(sourcePolicy) : sourcePolicy;
    const transport = getTtsTransport(account, { signal: request.signal, proxyOptions });
    const res = await transport.fetch("https://api.deepgram.com/v1/models", {
      headers: { "Authorization": `Token ${apiKey}` },
    });
    if (!res.ok) {
      discardTtsBody(res);
      return NextResponse.json({ error: `Deepgram voice API returned HTTP ${res.status}` }, { status: 502 });
    }
    const data = await readTtsJson(res, request.signal);
    const ttsModels = data.tts || [];

    const byLang = {};
    for (const m of ttsModels) {
      // Deepgram returns `languages: ["en"]` or sometimes language inferred from canonical_name suffix
      const langs = Array.isArray(m.languages) && m.languages.length
        ? m.languages
        : [m.canonical_name?.split("-").pop() || "en"];
      for (const code of langs) {
        if (!byLang[code]) {
          byLang[code] = {
            code,
            name: (() => { try { return langNames.of(code); } catch { return code; } })(),
            voices: [],
          };
        }
        const voiceId = m.canonical_name || m.name;
        if (!byLang[code].voices.find((x) => x.id === voiceId)) {
          byLang[code].voices.push({
            id: voiceId,
            name: m.name || voiceId,
            gender: m.metadata?.tags?.find((t) => t === "masculine" || t === "feminine") || "",
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
    return NextResponse.json({ error: "Failed to fetch Deepgram voices" }, { status: 502 });
  }
}
