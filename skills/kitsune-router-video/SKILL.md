---
name: kitsune-router-video
description: Submit and monitor user-authorized asynchronous video jobs through Kitsune Router. Discover a supported video route, retain the request ID and creating connection, poll within a deadline, and validate the completed download without duplicate billable submissions or assumed subscription entitlement.
---

# Kitsune Router — Asynchronous video generation

Use this skill for supported text/image-to-video creation, video edits or extensions. Read the [entry skill](https://raw.githubusercontent.com/ByKitsune/kitsune-router/refs/heads/master/skills/kitsune-router/SKILL.md) for setup. This implementation currently routes video through xAI's video API; it is not a generic video-combo endpoint.

## Establish access and scope

- `KITSUNE_ROUTER_URL` is the configured gateway origin without `/v1`; use HTTPS remotely. Supply the existing gateway `KITSUNE_ROUTER_KEY` securely when API-key enforcement is enabled. This is separate from the upstream credentials in the dashboard.
- A configured xAI connection can use a direct xAI API key or supported Grok Build OAuth credentials. These represent different upstream account/billing types. A subscription login, model listing or ready health probe does **not** establish video entitlement/quota. Upstream 403/permission errors must remain explicit.
- Agree the requested prompt/input, approximate duration/options and output destination from user intent. Do not increase cost by creating alternate drafts, longer clips, edits/extensions or higher resolution without that intent. Never log bearer values or include credentials in query strings.

Bash discovery (curl and jq required):

```bash
set -euo pipefail
: "${KITSUNE_ROUTER_URL:?Set the gateway origin first}"
kr_base="${KITSUNE_ROUTER_URL%/}"
kr_auth=()
if [ -n "${KITSUNE_ROUTER_KEY:-}" ]; then
  kr_auth=(-H "Authorization: Bearer ${KITSUNE_ROUTER_KEY}")
fi
curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 30 \
  "${kr_auth[@]}" "$kr_base/v1/models/video" | jq '.data[] | {id, name, owned_by}'
```

Set `KITSUNE_VIDEO_MODEL` to an advertised supported video ID; do not copy a stale example or a chat/image model. Inspect metadata before choosing model-specific options:

```bash
: "${KITSUNE_VIDEO_MODEL:?Select an advertised video model}"
curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 30 \
  "${kr_auth[@]}" --get "$kr_base/v1/models/info" \
  --data-urlencode "id=$KITSUNE_VIDEO_MODEL" --data-urlencode 'kind=video'
```

## Job protocol

| Endpoint | Purpose |
|---|---|
| `POST /v1/videos/generations` | Create a text/image-to-video job. |
| `POST /v1/videos/edits` | Create an edit job using supported upstream video inputs. |
| `POST /v1/videos/extensions` | Create an extension job using supported upstream video inputs. |
| `GET /v1/videos/{request_id}` | Poll the already-created job. |

JSON `model` uses the full gateway route ID; the gateway strips the provider prefix before forwarding. The remaining video request is forwarded rather than universally validated/translated. `prompt`, `duration`, `aspect_ratio`, `resolution`, `image: {url: ...}` and `video` inputs are **upstream/model-specific**. Consult returned metadata and current [xAI video API documentation](https://docs.x.ai/developers/rest-api-reference/inference/videos) when a field is not specified; do not advertise a fixed resolution/duration enum or `file_id` upload workflow without support. The gateway also preserves multipart bytes, but that does not establish an upstream upload schema.

Video combos are unsupported. Submit creation once. A successful response includes an upstream `request_id` and response header **`x-kitsune-router-connection-id`**. Persist both privately; poll using that connection ID as request header **`x-connection-id`**. Do not rotate to an unrelated account to poll the same job.

## Submit once and retain a receipt

The following Node 22+ ES-module example deliberately refuses to overwrite an existing receipt. A failed/ambiguous attempt leaves that file in place, preventing an accidental second submission when the script is rerun:

```js
import { open } from "node:fs/promises";
const base = process.env.KITSUNE_ROUTER_URL?.replace(/\/+$/, "");
const model = process.env.KITSUNE_VIDEO_MODEL;
const prompt = process.env.KITSUNE_VIDEO_PROMPT;
if (!base || !model || !prompt) throw new Error("Set gateway, video model and authorized prompt");
const headers = { "Content-Type": "application/json" };
if (process.env.KITSUNE_ROUTER_KEY) headers.Authorization = `Bearer ${process.env.KITSUNE_ROUTER_KEY}`;
const receipt = await open("video-job.json", "wx", 0o600);
try {
  await receipt.writeFile(JSON.stringify({ state: "submission-started" }));
  const response = await fetch(`${base}/v1/videos/generations`, {
    method: "POST", headers, body: JSON.stringify({ model, prompt }),
    signal: AbortSignal.timeout(130_000),
  });
  if (!response.ok) throw new Error(`Video submission failed: HTTP ${response.status}; do not blindly resubmit`);
  const job = await response.json();
  const connectionId = response.headers.get("x-kitsune-router-connection-id");
  if (typeof job.request_id !== "string" || !job.request_id) throw new Error("Missing request_id; inspect the submission outcome");
  const state = { requestId: job.request_id, connectionId, state: "accepted" };
  await receipt.truncate(0);
  await receipt.write(JSON.stringify(state, null, 2), 0, "utf8");
  if (!connectionId) throw new Error("Job ID retained, but creating connection is missing; resolve before polling");
} finally {
  await receipt.close();
}
```

Do not delete or overwrite this receipt merely to make a retry succeed. On a network timeout, 5xx or malformed response, a job may already exist; inspect the gateway/provider outcome first. The gateway itself limits creation retries to rejected auth/quota paths and may refresh OAuth. It forwards `Idempotency-Key` when supplied, but does not provide local deduplication or guarantee upstream support, so the header alone is not proof a replay is safe.

## Poll the same job within a deadline

Resume from the receipt instead of re-running the creation script. This example polls every five seconds for at most ten minutes; tune the deadline to the user's task and upstream guidance, rather than waiting forever:

```js
import { readFile, writeFile } from "node:fs/promises";
const base = process.env.KITSUNE_ROUTER_URL?.replace(/\/+$/, "");
const job = JSON.parse(await readFile("video-job.json", "utf8"));
if (!base || !job.requestId || !job.connectionId) throw new Error("A complete accepted job receipt is required");
const headers = { "x-connection-id": job.connectionId };
if (process.env.KITSUNE_ROUTER_KEY) headers.Authorization = `Bearer ${process.env.KITSUNE_ROUTER_KEY}`;
const deadline = Date.now() + 600_000;
let completed = false;
while (Date.now() < deadline) {
  const remaining = deadline - Date.now();
  const response = await fetch(`${base}/v1/videos/${encodeURIComponent(job.requestId)}`, {
    headers, signal: AbortSignal.timeout(Math.min(30_000, remaining)),
  });
  if (!response.ok) throw new Error(`Video poll failed: HTTP ${response.status}; retain the receipt`);
  const result = await response.json();
  if (result.status === "failed" || result.error) throw new Error("Upstream video job failed; retain the receipt");
  if (result.status === "done") {
    if (typeof result.video?.url !== "string") throw new Error("Completed job has no video URL");
    await writeFile("video-result.json", JSON.stringify(result, null, 2), { mode: 0o600, flag: "wx" });
    completed = true;
    break;
  }
  await new Promise(resolve => setTimeout(resolve, Math.min(5_000, Math.max(0, deadline - Date.now()))));
}
if (!completed) throw new Error("Polling deadline exceeded; job may still be running. Keep the receipt to resume later.");
```

Poll responses are upstream JSON, commonly `status: pending`, `done` with `video.url`, or `failed` with error information; do not invent percentage progress when absent. On transient poll network/429/5xx errors, retain the receipt and use a bounded retry policy respecting `Retry-After`; polling is a GET and must not trigger another creation. A 400/404 may indicate an invalid/expired ID or wrong connection; do not create a replacement automatically. Ctrl+C/client abort stops waiting but is **not** an upstream job-cancellation API.

## Download and report

Treat `video.url` as an untrusted, potentially signed/expiring address. Validate expected HTTPS destinations and redirect policy, never forward gateway Authorization to a different host, download to a private `.part` file with a timeout/size bound, require successful status/nonempty recognizable video bytes, then atomically rename to an unused user-approved destination. Do not execute downloaded content, save a JSON error as MP4, or expose signed URLs/inputs in logs. Preserve receipt/result metadata if the download fails so generation need not be repeated.

The installed CLI may offer `kitsune-router xai video --prompt ... --output ...` with bounded polling and a `.part` download flow. Check `kitsune-router xai video --help` for that version before use; a source checkout does not guarantee the executable is globally installed. A delivered video proves that job completed, not broad subscription entitlement or free usage.
