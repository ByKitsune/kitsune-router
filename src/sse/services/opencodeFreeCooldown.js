import { getAdapter } from "@/lib/db/driver.js";
import { parseJson, stringifyJson } from "@/lib/db/helpers/jsonCol.js";
import { TRANSIENT_COOLDOWN_MS } from "open-sse/config/errorConfig.js";

const STATE_KEY = "provider-cooldown:opencode-free";

function activeCooldown(db, now) {
  const row = db.get("SELECT value FROM _meta WHERE key = ?", [STATE_KEY]);
  const state = parseJson(row?.value, null);
  return Number.isFinite(state?.until) && state.until > now ? state : null;
}

export async function getOpenCodeFreeCooldown() {
  return activeCooldown(await getAdapter(), Date.now());
}

export async function recordOpenCodeFreeCooldown(resetsAtMs) {
  const db = await getAdapter();
  db.transaction(() => {
    const now = Date.now();
    const reported = Number.isFinite(resetsAtMs) && resetsAtMs > now ? resetsAtMs : null;
    const until = reported ?? now + TRANSIENT_COOLDOWN_MS;
    const active = activeCooldown(db, now);
    // A backoff without a provider deadline cannot overwrite a verified reset.
    // Concurrent quota replies with a deadline can only extend it.
    if (active?.resetsAtMs && (!reported || active.resetsAtMs >= reported)) return;
    if (!reported && active?.until >= until) return;
    db.run("INSERT INTO _meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
      STATE_KEY, stringifyJson({ until, resetsAtMs: reported }),
    ]);
  });
}
