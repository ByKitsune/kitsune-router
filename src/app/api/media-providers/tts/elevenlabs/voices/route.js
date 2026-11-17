import { NextResponse } from "next/server";
import { getProviderConnections } from "@/lib/localDb";
import { fetchElevenLabsVoices } from "open-sse/handlers/ttsCore.js";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";

const langNames = new Intl.DisplayNames(["en"], { type: "language" });

/**
 * GET /api/media-providers/tts/elevenlabs/voices[?lang=en]
 * Returns { languages, byLang } grouped by language - same format as edge-tts
 * Uses direct DB read (no mutex) to avoid blocking on concurrent TTS requests
 */
export async function GET(request) {
  try {
    if (request.signal?.aborted) return NextResponse.json({ error: "Client closed request" }, { status: 499 });
    const { searchParams } = new URL(request.url);
    const langFilter = searchParams.get("lang");

    // Direct DB read - bypass auth mutex used for TTS inference
    const connections = await getProviderConnections({ provider: "elevenlabs", isActive: true });
    const account = connections[0];
    const apiKey = account?.apiKey;
    if (!apiKey) {
      return NextResponse.json({ error: "No ElevenLabs connection found" }, { status: 400 });
    }

    const sourcePolicy = account.providerSpecificData || {};
    const proxyOptions = sourcePolicy.proxyPoolId && sourcePolicy.proxyPoolId !== "__none__"
      ? await resolveConnectionProxyConfig(sourcePolicy) : sourcePolicy;
    const voices = await fetchElevenLabsVoices(apiKey, { credentials: account, proxyOptions, signal: request.signal });

    // Group by all supported languages (verified_languages + labels.language)
    const byLang = {};
    const addToLang = (code, voice) => {
      if (!byLang[code]) {
        byLang[code] = {
          code,
          name: (() => { try { return langNames.of(code); } catch { return code; } })(),
          voices: [],
        };
      }
      // Avoid duplicate voice in same lang
      if (!byLang[code].voices.find((v) => v.id === voice.voice_id)) {
        byLang[code].voices.push({
          id: voice.voice_id,
          name: voice.name,
          gender: voice.labels?.gender || "",
          lang: code,
          // premade voices are free; professional library voices added to account may require paid plan
          free_users_allowed: voice.category === "premade" || voice.is_owner === true
        });
      }
    };
    for (const v of voices) {
      // Add to primary language
      const primaryLang = v.labels?.language || "en";
      addToLang(primaryLang, v);
      // Add to all verified languages
      for (const vl of v.verified_languages || []) {
        if (vl.language && vl.language !== primaryLang) {
          addToLang(vl.language, v);
        }
      }
    }

    const languages = Object.values(byLang).sort((a, b) => a.name.localeCompare(b.name));

    // If lang filter requested, return only that group's voices
    if (langFilter) {
      return NextResponse.json({ voices: byLang[langFilter]?.voices || [] });
    }

    return NextResponse.json({ languages, byLang });
  } catch (err) {
    if (request.signal?.aborted) return NextResponse.json({ error: "Client closed request" }, { status: 499 });
    if (err.code === "TTS_HEADER_TIMEOUT") return NextResponse.json({ error: "TTS response headers timed out" }, { status: 408 });
    return NextResponse.json({ error: "Failed to fetch ElevenLabs voices" }, { status: 502 });
  }
}
