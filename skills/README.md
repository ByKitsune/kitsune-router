# Kitsune Router — Agent Skills

Drop-in skills for any AI agent (Claude, Cursor, ChatGPT, custom SDK). Just **copy a link** below and paste it to your AI — it will fetch the skill and use Kitsune Router for you.

> Tip: start with the **kitsune-router** entry skill — it covers setup and links to all capability skills.

## Skills

| Capability | Copy link below and paste to your AI |
|---|---|
| **Entry / Setup** (start here) | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router/SKILL.md |
| Chat / code-gen | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-chat/SKILL.md |
| Image generation | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-image/SKILL.md |
| Video generation (xAI Grok Imagine) | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-video/SKILL.md |
| Text-to-speech | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-tts/SKILL.md |
| Speech-to-text | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-stt/SKILL.md |
| Embeddings | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-embeddings/SKILL.md |
| Web search | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-web-search/SKILL.md |
| Web fetch (URL → markdown) | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-web-fetch/SKILL.md |

## How to use

Paste to your AI (Claude, Cursor, ChatGPT, …):

```
Read this skill and use it: https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router/SKILL.md
```

Then ask normally — *"generate an image of a cat"*, *"transcribe this URL"*, etc.

## Configure your shell once

```bash
export KITSUNE_ROUTER_URL="http://localhost:20128"   # local default, or your VPS / tunnel URL
export KITSUNE_ROUTER_KEY="sk-..."                   # from Dashboard → Keys (only if requireApiKey=true)
```

Verify: `curl "$KITSUNE_ROUTER_URL/api/health"`. A ready instance returns HTTP
200 with `ok: true`; the response also includes bounded health diagnostics.
An HTTP 503 indicates a degraded local instance, not provider entitlement.

## Links

- Source: https://github.com/ByKitsune/kitsune-router
- Dashboard: http://localhost:20128/dashboard (or your configured deployment URL)
- Maintainer and sponsor: https://bykitsune.com/
