# Runtime routing audit — 2026-11-06

The running gateway remains the existing 1.0.8 release, with the same DATA_DIR and credentials.

The custom BB node had prefix `bb`, which is reserved by the built-in Blackbox provider. Requests with this prefix were resolved to Blackbox and returned 503 because no Blackbox credentials were configured. The catalog nevertheless listed BB models using the conflicting prefix.

The affected custom node and its connection metadata now use `bandel`. There were no `bb/` references in combos or KV at audit time. Persistent cache revision triggers invalidate the node/connection caches; no gateway restart or credential rotation was required. Deployment-specific node identifiers and credential-bearing backups remain outside the repository.

Use `bandel/deepseek-v4.1-flash-mod` and `bandel/glm-5.3-mod`, or the full provider node ID plus model. Both passed a synthetic Hermes User-Agent test with a function tool, valid SSE, `finish_reason=tool_calls`, and `[DONE]`. The former took 2.54 seconds and the latter 5.82 seconds. These are small functional probes, not a claim of comprehensive upstream reliability.

`glm-5.3-flashx-mod` is explicitly disabled at the BB supplier despite remaining in its model catalog. Do not equate discovery with inference availability.

A verified SQLite online backup precedes the prefix change. Do not restore the whole database to undo a naming change; preserve new usage and credentials and update only the relevant configuration fields. Restoring `bb` would reintroduce the collision.

The public ByKitsune service routes GPT to this Router while its current DeepSeek/GLM channels connect to suppliers directly. The website's synchronous ledger query was fixed in a separate production hotfix. Its independent public model status is https://status.bykitsune.com/.
