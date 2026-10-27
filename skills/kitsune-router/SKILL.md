---
name: kitsune-router
description: Entry point for Kitsune Router — local/remote AI gateway with OpenAI-compatible REST for chat, image, TTS, embeddings, web search, web fetch. Use when the user mentions Kitsune Router, KITSUNE_ROUTER_URL, or wants AI without writing provider boilerplate. This skill covers setup + indexes capability skills; fetch the relevant capability SKILL.md from the URLs below when needed.
---

# Kitsune Router

Local/remote AI gateway exposing OpenAI-compatible REST. One key, many providers, auto-fallback.

## Setup

```bash
export KITSUNE_ROUTER_URL="http://localhost:20128"      # or VPS / tunnel URL
export KITSUNE_ROUTER_KEY="sk-..."                      # from Dashboard → Keys (only if requireApiKey=true)
```

All requests: `${KITSUNE_ROUTER_URL}/v1/...` with header `Authorization: Bearer ${KITSUNE_ROUTER_KEY}` (omit if auth disabled).

Verify: `curl "$KITSUNE_ROUTER_URL/api/health"`. Check for HTTP 200 and
`ok: true`; additional fields describe bounded local health diagnostics.
This does not prove a connected account can use every listed upstream model.

## Discover models

```bash
curl $KITSUNE_ROUTER_URL/v1/models                  # chat/LLM (default)
curl $KITSUNE_ROUTER_URL/v1/models/image            # image-gen
curl $KITSUNE_ROUTER_URL/v1/models/tts              # text-to-speech
curl $KITSUNE_ROUTER_URL/v1/models/embedding        # embeddings
curl $KITSUNE_ROUTER_URL/v1/models/web              # web search + fetch (entries have `kind` field)
curl $KITSUNE_ROUTER_URL/v1/models/stt              # speech-to-text
curl $KITSUNE_ROUTER_URL/v1/models/image-to-text    # vision
```

Use `data[].id` as `model` field in requests. Combos appear with `owned_by:"combo"`.

Response shape:
```json
{ "object": "list", "data": [
  { "id": "openai/gpt-5", "object": "model", "owned_by": "openai", "created": 1735000000 },
  { "id": "tavily/search", "object": "model", "kind": "webSearch", "owned_by": "tavily", "created": 1735000000 }
]}
```

## Capability skills

When the user needs a specific capability, fetch that skill's `SKILL.md` from its raw URL:

| Capability | Raw URL |
|---|---|
| Chat / code-gen | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-chat/SKILL.md |
| Image generation | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-image/SKILL.md |
| Video generation | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-video/SKILL.md |
| Text-to-speech | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-tts/SKILL.md |
| Speech-to-text | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-stt/SKILL.md |
| Embeddings | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-embeddings/SKILL.md |
| Web search | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-web-search/SKILL.md |
| Web fetch (URL → markdown) | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-web-fetch/SKILL.md |

## Errors

- 401 → set/refresh `KITSUNE_ROUTER_KEY` (Dashboard → Keys)
- 400 `Invalid model format` → check `model` exists in `/v1/models/<kind>`
- 503 `All accounts unavailable` → wait `retry-after` or add another provider account
