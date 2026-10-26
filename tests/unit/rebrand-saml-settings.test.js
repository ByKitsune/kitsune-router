import { afterEach, describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { inflateRawSync } from "node:zlib";
vi.mock("../../src/lib/db/repos/settingsRepo.js", () => ({ getSettings: async () => ({}) }));
import { preserveLegacyBrandSettings } from "../../src/lib/db/helpers/brandSettings.js";
import { buildSamlAuthorizeUrl, generateSamlMetadata } from "../../src/lib/auth/saml.js";

const directories = [];
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

function fixture(settings) {
  const row = { data: JSON.stringify(settings) };
  const writes = [];
  let inTransaction = false;
  return {
    get: () => { expect(inTransaction).toBe(true); return { ...row }; },
    run(sql, params) {
      expect(inTransaction).toBe(true);
      if (sql.startsWith("UPDATE settings")) { writes.push({ sql, params }); row.data = params[0]; }
    },
    transaction(fn) { inTransaction = true; try { return fn(); } finally { inTransaction = false; } },
    settings: () => JSON.parse(row.data),
    writes,
  };
}

describe("rebrand preserves authentication configuration", () => {
  it("materializes the historical implicit SAML issuer only for an upgraded SAML installation", () => {
    const db = fixture({ ssoType: "saml", samlEntryPoint: "https://identity.example.test/sso", password: "synthetic-persisted-hash", providerStrategies: { openai: "priority" } });
    preserveLegacyBrandSettings(db, { legacyInstallation: true });
    expect(db.settings()).toEqual({ ssoType: "saml", samlEntryPoint: "https://identity.example.test/sso", password: "synthetic-persisted-hash", providerStrategies: { openai: "priority" }, samlIssuer: "urn:zenrouter:sp" });
    preserveLegacyBrandSettings(db, { legacyInstallation: true });
    expect(db.writes).toHaveLength(1);
  });

  it.each(["urn:operator:custom", "urn:kitsunerouter:sp"])("does not rewrite a nonempty explicitly persisted issuer %s", (samlIssuer) => {
    const db = fixture({ ssoType: "saml", samlIssuer });
    preserveLegacyBrandSettings(db, { legacyInstallation: true });
    expect(db.settings().samlIssuer).toBe(samlIssuer);
    expect(db.writes).toHaveLength(0);
  });

  it.each([undefined, "", null, false, 0])("preserves the effective issuer in metadata and AuthnRequests for legacy fallback value %s", async (samlIssuer) => {
    const db = fixture({ ssoType: "saml", samlIssuer, samlEntryPoint: "https://identity.example.test/sso" });
    preserveLegacyBrandSettings(db, { legacyInstallation: true });
    const settings = db.settings();
    expect(generateSamlMetadata("https://gateway.example.test", settings)).toContain('entityID="urn:zenrouter:sp"');
    const { authorizeUrl } = await buildSamlAuthorizeUrl(new Request("https://gateway.example.test/api/auth/saml/start"), settings);
    const xml = inflateRawSync(Buffer.from(new URL(authorizeUrl).searchParams.get("SAMLRequest"), "base64")).toString("utf8");
    expect(xml).toMatch(/<saml:Issuer[^>]*>urn:zenrouter:sp<\/saml:Issuer>/);
  });

  it("reads under a transaction and retains another worker's committed password/settings changes", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kitsune-saml-settings-"));
    directories.push(directory);
    const file = path.join(directory, "state.sqlite");
    const first = new DatabaseSync(file);
    const second = new DatabaseSync(file);
    try {
      first.exec("CREATE TABLE settings (id INTEGER PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      first.prepare("INSERT INTO settings VALUES (1, ?)").run(JSON.stringify({ ssoType: "saml", samlIssuer: "", password: "synthetic-old-hash" }));
      const updated = { ssoType: "saml", samlIssuer: "", password: "synthetic-new-hash", requireApiKey: true };
      let locked = false;
      const db = {
        get(sql) { expect(locked).toBe(true); return second.prepare(sql).get(); },
        run(sql, params) { expect(locked).toBe(true); return second.prepare(sql).run(...params); },
        transaction(fn) {
          // Simulates a worker committing just before this startup acquires its
          // write lock. No stale read may have happened before this point.
          first.prepare("UPDATE settings SET data = ? WHERE id = 1").run(JSON.stringify(updated));
          second.exec("BEGIN IMMEDIATE"); locked = true;
          try { const result = fn(); second.exec("COMMIT"); return result; }
          catch (error) { second.exec("ROLLBACK"); throw error; }
          finally { locked = false; }
        },
      };
      preserveLegacyBrandSettings(db, { legacyInstallation: true });
      expect(JSON.parse(first.prepare("SELECT data FROM settings WHERE id = 1").get().data)).toEqual({ ...updated, samlIssuer: "urn:zenrouter:sp" });
      expect(first.prepare("SELECT value FROM _meta WHERE key = ?").get("cacheRevision:settings").value).toBe("1");
    } finally { first.close(); second.close(); }
  });

  it("leaves fresh and non-SAML installations on the new product defaults", () => {
    for (const [settings, legacyInstallation] of [[{ ssoType: "saml" }, false], [{ authMode: "password" }, true], [{ ssoType: "oidc", oidcIssuerUrl: "https://identity.example.test" }, true]]) {
      const db = fixture(settings);
      preserveLegacyBrandSettings(db, { legacyInstallation });
      expect(db.settings()).toEqual(settings);
      expect(db.writes).toHaveLength(0);
    }
  });
});
