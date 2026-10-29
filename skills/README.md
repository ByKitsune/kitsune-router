# Kitsune Router — Agent Skills

Nine task-focused guides for connecting an AI agent to **your existing Kitsune Router installation**. Start with the entry skill, discover the routes configured on that gateway, then load only the capability needed for the user's request.

Reading a skill does not connect an account, grant provider entitlement, publish software or authorize paid inference. Examples use discovered routes rather than promising that a particular model or free tier is available.

## Skill catalog

| Guide | Use it for | Stable raw URL |
|---|---|---|
| **Entry / setup** | URL, secure gateway authentication, health, discovery and shared error policy | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router/SKILL.md |
| Chat / code | OpenAI/Anthropic JSON and SSE, tools, completion and cancellation | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-chat/SKILL.md |
| Images | Discovered image models, supported controls and verified image output | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-image/SKILL.md |
| Video | Account-scoped asynchronous jobs and bounded polling | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-video/SKILL.md |
| Text to speech | Voice/model controls and safe binary audio output | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-tts/SKILL.md |
| Speech to text | Audio uploads, supported formats and transcription results | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-stt/SKILL.md |
| Embeddings | Batching, dimensions, input ordering and vector-index compatibility | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-embeddings/SKILL.md |
| Web search | Configured web/X routes, citations, pagination and retrieval limits | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-web-search/SKILL.md |
| Web fetch | Public URL extraction, provider selectors and normalized content | https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router-web-fetch/SKILL.md |

The dashboard at `/dashboard/skills` exposes the same nine guides and copyable links. The raw URLs track `master`; for an audited automation workflow, pin a reviewed commit instead of assuming future content is unchanged.

## Use with an agent

Give your agent the entry link and the actual task:

```text
Read this guide, discover the models configured on my gateway, and use the relevant capability only for my request:
https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router/SKILL.md
```

Provide `KITSUNE_ROUTER_URL` through the environment (default loopback origin: `http://127.0.0.1:20128`, **without `/v1`**). If API-key enforcement is enabled, securely bind `KITSUNE_ROUTER_KEY` before discovery and inference. The gateway key is not your dashboard password or upstream provider key. Do not paste secret values into prompts or saved examples.

Use HTTPS for a remote gateway. A local `/api/health` success confirms gateway/database readiness; it does not prove live-provider availability or entitlement. All capability guides include bounded timeouts, actual endpoint fields, failure handling and scope limits. Client cancellation cannot guarantee upstream cancellation or zero billing, so do not blindly retry generation POSTs.

## Maintaining these guides

Treat the current handlers, adapters and discovery metadata as the contract:

- HTTP surface: `src/app/api/v1/` and `src/sse/handlers/`.
- Provider normalization/transport: `open-sse/handlers/` and its adapters.
- Discovery/catalog metadata: `src/app/api/v1/models/`.
- Dashboard catalog and stable guide IDs: `src/shared/constants/skills.js`.

Check requests against those sources before documenting a new parameter or response wrapper. Keep each capability self-contained, authenticate discovery, quote shell URLs, build JSON with a serializer, preserve null/unknown values, bound batches and polling, and never claim live tests that were not run. Web fetch currently accepts a provider alias or fetch-combo selector rather than its advertised `provider/fetch` catalog ID; its guide records that distinction.

Run the local documentation contract suite after changes:

```bash
npm ci
npm --prefix tests ci
npm test -- tests/unit/agent-skills-contract.test.js
```

These checks validate guide/catalog links, executable example syntax and selected handler contracts without making paid provider calls. They do not certify upstream compatibility.

Source: https://github.com/ByKitsune/kitsune-router · Maintainer: https://bykitsune.com/
