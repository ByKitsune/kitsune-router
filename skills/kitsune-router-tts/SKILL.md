---
name: kitsune-router-tts
description: Convert user-authorized text to speech through Kitsune Router. Discover supported TTS routes and voices, choose the correct model/voice identifier, validate raw-audio or base64 JSON output, and save audio without assuming all provider options are OpenAI-compatible.
---

# Kitsune Router — Text-to-speech

Use this skill for narration, voiceovers or reading text aloud. Start with the [entry skill](https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router/SKILL.md) if the gateway is not configured. Voice cloning or additional provider features are not implied by this endpoint.

## Authenticate and discover

`KITSUNE_ROUTER_URL` is the gateway origin without `/v1`; use HTTPS remotely. Reuse `KITSUNE_ROUTER_KEY` securely when gateway key enforcement is enabled. It is not a provider key; provider credentials stay in the dashboard. Never print keys, place them in query strings or enable shell tracing. A ready health probe and model listing do not establish provider quota or entitlement. Send only the text/audio generation the user authorized.

These examples use Bash, curl and jq:

```bash
set -euo pipefail
: "${KITSUNE_ROUTER_URL:?Set the gateway origin first}"
kr_base="${KITSUNE_ROUTER_URL%/}"
kr_auth=()
if [ -n "${KITSUNE_ROUTER_KEY:-}" ]; then
  kr_auth=(-H "Authorization: Bearer ${KITSUNE_ROUTER_KEY}")
fi
curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 30 \
  "${kr_auth[@]}" "$kr_base/v1/models/tts" | jq '.data[] | {id, name, owned_by}'
```

Select a TTS ID from this installation and store it in `KITSUNE_TTS_MODEL`. Inspect its metadata, explicitly disambiguating TTS from identically named chat models:

```bash
: "${KITSUNE_TTS_MODEL:?Select an advertised TTS model}"
curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 30 \
  "${kr_auth[@]}" --get "$kr_base/v1/models/info" \
  --data-urlencode "id=$KITSUNE_TTS_MODEL" --data-urlencode 'kind=tts'
```

If metadata supplies `voicesUrl`, fetch that relative URL against the same trusted gateway origin with the same authentication. The public voice route accepts `provider=elevenlabs`, `deepgram`, `inworld`, `edge-tts` or `local-device`, and optional `lang` filtering. For example, when that provider is configured:

```bash
curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 30 \
  "${kr_auth[@]}" --get "$kr_base/v1/audio/voices" \
  --data-urlencode 'provider=edge-tts' --data-urlencode 'lang=en' \
  | jq '.data[] | {name, lang, model}'
```

Use the returned **`data[].model`**, not merely its `id`, as the full speech route. Never pass upstream keys through internal voice-list query parameters. Catalog/voice requests can require configured upstream access and can fail independently of the local health probe.

## Understand the model/voice contract

`POST /v1/audio/speech` requires JSON `model` and nonempty `input`. The current gateway also reads `language` and `style` for adapters that support those hints. A separate body `voice`, `speed` or `response_format` is **not** a universal control in this implementation.

- OpenAI adapter: the route tail after the provider is `<tts-model>/<voice>`; a tail containing only one component is interpreted as a **voice**, using the configured default TTS model. Thus do not assume `openai/tts-1` selects that model. An illustrative shape is `openai/tts-1/alloy`, only when the configured provider supports it.
- ElevenLabs: route tail is `<voice_id>` or `<model_id>/<voice_id>`; prefer the voice endpoint's returned full model identifier. A catalog model ID alone is not necessarily a usable voice ID.
- Other adapters have their own model/voice conventions. Read their metadata or dashboard voice list; do not transfer a voice from one provider to another.
- `?response_format=json` selects JSON `{audio, format}`. Without that query the gateway returns raw audio. Other query values do not guarantee transcoding or a requested codec: the actual format comes from the provider adapter.

## Generate and save

Set `KITSUNE_TTS_MODEL` to the chosen usable full route and `KITSUNE_TTS_TEXT` to the authorized text. JSON output makes format validation explicit:

```bash
: "${KITSUNE_TTS_TEXT:?Set the text to speak}"
(umask 077
  jq -n --arg model "$KITSUNE_TTS_MODEL" --arg input "$KITSUNE_TTS_TEXT" \
    '{model: $model, input: $input}' > speech-request.json
  curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 180 \
    "${kr_auth[@]}" -H 'Content-Type: application/json' \
    --data-binary @speech-request.json "$kr_base/v1/audio/speech?response_format=json" \
    --output speech-response.json
)
```

Check status before interpreting output. A successful JSON response is shaped like:

```json
{"audio":"SUQzBAAAA...","format":"mp3"}
```

Require a nonempty `audio` string and a recognized audio `format`; decode base64 to a private temporary file, check actual audio bytes, then rename to an unused user-approved destination with the matching extension. Do not print full base64, private narration or the request body in logs.

For raw output omit `?response_format=json`, capture headers and body separately, and require a successful audio response with matching nonempty bytes. Never save an error JSON body as an MP3. The implementation uses `audio/<format>` (for example `audio/mp3`), so support the adapter's declared MIME while checking its content. Do not promise streaming or a guaranteed duration: synthesis may buffer the complete audio before returning.

## Failure and platform limits

A timeout or interrupted connection does not prove synthesis was unbilled or stopped upstream. Do not automatically replay the POST, split text into a large batch, change paid voice/model tiers, or send additional text without user intent. The gateway may perform configured account/combo fallback.

For 400, inspect route/voice and input; for gateway 401, verify the gateway key; provider access failures require connection or entitlement repair. For 429/503, respect bounded backoff/`Retry-After` and avoid duplicate synthesis. Report the HTTP status/code with secrets removed.

NoAuth providers still obey gateway authentication. Local-device speech requires a compatible OS voice backend and tools such as ffmpeg on the gateway host; it is not a browser/client speaker API and may be unavailable on headless Linux. Local/self-hosted TTS endpoints must be configured and reachable. A successful catalog lookup alone is not a usable audio artifact.
