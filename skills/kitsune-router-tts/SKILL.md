---
name: kitsune-router-tts
description: Text-to-speech via Kitsune Router /v1/audio/speech using OpenAI / ElevenLabs / Deepgram / Edge TTS / Google TTS / Hyperbolic / Inworld / Ollama Local. Use when the user wants to convert text to speech, generate audio, voiceover, narrate, or read text aloud.
---

# Kitsune Router — Text-to-Speech

Requires `KITSUNE_ROUTER_URL` (and `KITSUNE_ROUTER_KEY` if auth enabled). See https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router/SKILL.md for setup.

## Discover

```bash
# 1) List models
curl $KITSUNE_ROUTER_URL/v1/models/tts | jq '.data[].id'
# 2) Per-model metadata (params, voicesUrl if voice-by-id)
curl "$KITSUNE_ROUTER_URL/v1/models/info?id=el/eleven_multilingual_v2"
# 3) List voices (elevenlabs, edge-tts, deepgram, inworld, local-device). Optional ?lang=vi
curl "$KITSUNE_ROUTER_URL/v1/audio/voices?provider=edge-tts&lang=vi" | jq '.data[].model'
```

The `model` field selects a provider route; its model/voice convention depends on the provider (e.g. `edge-tts/vi-VN-HoaiMyNeural`, `el/<voice_id>`, or `openai/tts-1`). For Ollama Local it can be a model tag such as `ollama-local/phonon:en`, with an optional separate `voice` field. Discovery lists selectable candidates, not proof a model is installed.

## Endpoint

`POST $KITSUNE_ROUTER_URL/v1/audio/speech`

| Field | Required | Notes |
|---|---|---|
| `model` | yes | Provider-qualified model or voice route; conventions vary by provider |
| `input` | yes | text to speak |
| `voice` | no | Provider-specific voice; Ollama Local accepts a non-empty voice string |
| `response_format` | no | Ollama Local body format: `wav`, `pcm`, or `json`; see precedence below |

For Ollama Local, the query parameter `?response_format=...` takes precedence over the body field. With neither set, the public route returns WAV bytes. `pcm` returns raw PCM bytes; `json` returns `{audio: base64, format: "wav"}`. Explicit `mp3` is rejected rather than mislabeled. Other providers use the legacy route's MP3 default and query-format behavior; supported formats vary by adapter.

Ollama Local requires an active registered connection, although its API key is optional. Configure the Ollama endpoint on that connection and install the selected tag on the server; listing it does not install it. Redirects are refused, and a configured relay that cannot enforce redirect refusal is rejected.

For internal callers, `handleTtsCore` is not the public Ollama route: it defaults to MP3 and does not pass through the public route's `voice`, cancellation signal, `speed`, or `instructions`. Explicit WAV is the tested internal path.

## Examples

Save MP3:

```bash
curl -X POST "$KITSUNE_ROUTER_URL/v1/audio/speech" \
  -H "Authorization: Bearer $KITSUNE_ROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/tts-1","input":"Hello world"}' \
  --output speech.mp3
```

Save WAV from an installed Ollama Local model (with an active connection):

```bash
curl -fS -X POST "$KITSUNE_ROUTER_URL/v1/audio/speech" \
  -H "Authorization: Bearer $KITSUNE_ROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"ollama-local/phonon:en","input":"Hello world","voice":"default"}' \
  --output speech.wav
```

JS (save file):

```js
import { writeFile } from "node:fs/promises";
const r = await fetch(`${process.env.KITSUNE_ROUTER_URL}/v1/audio/speech`, {
  method: "POST",
  headers: { "Authorization": `Bearer ${process.env.KITSUNE_ROUTER_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "el/eleven_multilingual_v2", input: "Xin chào" }),
});
await writeFile("speech.mp3", Buffer.from(await r.arrayBuffer()));
```

## Response shape

Ollama Local default → raw WAV bytes (Content-Type `audio/wav`). Other providers default to MP3 at the route; the returned format depends on adapter support.

Ollama Local `?response_format=json`:
```json
{ "audio": "<base64-encoded WAV>", "format": "wav" }
```

## Provider quirks (model format)

| Provider | `model` format | Notes |
|---|---|---|
| `openai` | `tts-1/alloy` (model/voice) or just voice | Default model `gpt-4o-mini-tts` |
| `elevenlabs` | `<model_id>/<voice_id>` or `<voice_id>` | Default model `eleven_flash_v2_5`; list voices in Dashboard |
| `openrouter` | `openai/gpt-4o-mini-tts/alloy` | Streamed via chat-completions audio modality |
| `edge-tts` | voice id e.g. `vi-VN-HoaiMyNeural` | **noAuth**; default `vi-VN-HoaiMyNeural` |
| `google-tts` | language code e.g. `en`, `vi` | **noAuth** |
| `local-device` | OS voice name (`say -v ?` / SAPI) | **noAuth**; needs `ffmpeg` |
| `deepgram` | `aura-asteria-en` etc | Token auth |
| `nvidia`, `inworld`, `cartesia`, `playht` | `model/voice` | Provider-specific auth header |
| `coqui`, `tortoise` | speaker / voice id | Localhost noAuth |
| `hyperbolic` | model id | Body = `{text}` only |
| `ollama-local` | model tag, e.g. `phonon:en`; optional body `voice` | Active registered connection required; API key optional; WAV default, PCM or JSON; MP3 rejected |
