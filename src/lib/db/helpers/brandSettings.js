// Persist the old implicit SAML issuer on upgrade before new defaults are
// applied. An IdP's configured entity ID is an authentication contract, not a
// label that can be changed as part of a visual rebrand.
import { bumpScopeRevisions, invalidateCommittedScopes } from "./cacheRevisions.js";

export function preserveLegacyBrandSettings(adapter, { legacyInstallation }) {
  if (!legacyInstallation) return;
  let changed = false;
  // Native adapters acquire an immediate write transaction before reading, so
  // another startup cannot overwrite a settings/password change with an older
  // whole-document snapshot. Fresh-import callers use a nested savepoint.
  adapter.transaction(() => {
    const row = adapter.get("SELECT data FROM settings WHERE id = 1");
    if (!row) return;
    let settings;
    try { settings = JSON.parse(row.data); } catch { return; }
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) return;
    const usesSaml = settings.ssoType === "saml" || Boolean(settings.samlEntryPoint || settings.samlCert);
    if (!usesSaml || settings.samlIssuer) return;
    // Preserve the EFFECTIVE old issuer: missing, empty and null values all
    // used the historical fallback through `||`. A nonempty custom ID wins.
    adapter.run("UPDATE settings SET data = ? WHERE id = 1", [JSON.stringify({ ...settings, samlIssuer: "urn:zenrouter:sp" })]);
    bumpScopeRevisions(adapter, ["settings"]);
    changed = true;
  });
  if (changed) invalidateCommittedScopes(adapter, ["settings"]);
}
