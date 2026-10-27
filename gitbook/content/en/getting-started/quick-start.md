# Quick Start

**Your models. Your routes.** No ByKitsune account or required provider ordering. **1.0.2 container is published privately; anonymous pulls are pending and npm is blocked.** Runtime tag stays `65c8b97d`. Use [source installation](/en/getting-started/installation/) or authorized [private container access](/en/deployment/cloud/). Package commands below apply only after **npm** publication/readback succeeds and require **Node.js >=22.19.0**; container publication does not publish the npm launcher.

## 1. Start the gateway

```bash
npx @bykitsune/router@1.0.2
```

Set a strong `INITIAL_PASSWORD` in your private environment before exposing access. Open `http://localhost:20128/dashboard`.

## 2. Connect your provider

Choose an upstream you are permitted to use. Add its supported OAuth or API-key connection and inspect the model catalog. A gateway entry does not grant an upstream subscription, unlimited quota or regional permission. Keep upstream credentials private.

## 3. Create a gateway key and choose a route

Create/copy an active API key in the dashboard, then supply it privately as `KITSUNE_ROUTER_API_KEY` in your client environment. This variable holds an issued key; it does not create one.

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

Health checks gateway/storage, not upstream inference. Select an exact available model or create a combo, such as `my-route`, with your chosen fallback order.

## 4. Configure your tool

OpenAI-compatible base URL: `http://localhost:20128/v1`. Supply the gateway key and exact model/combo. New custom provider identifiers use **`kitsunerouter`**, while the executable is **`kitsune-router`**. [Codex](/en/integration/codex/) and [Claude Code](/en/integration/claude-code/) have different wire/base-URL requirements.

Before upgrading old state, stop its writer/helpers and read [migration](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). Keep the full private state, not just SQLite. Existing `DATA_DIR`/container volumes stay in place; originals and keys/certificates must survive.
