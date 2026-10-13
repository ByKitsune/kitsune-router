// 9router #4681: the model picker offered providers the runtime refuses to
// serve — providers whose connections were all disabled, and registry-hidden
// no-auth entries. A saved combo member then 404s at dispatch with
// "No active credentials for provider: X".
import { describe, expect, it } from "vitest";
import { filterEnabledConnections, visibleNoAuthProviderIds } from "../../src/shared/utils/modelPickerFilter.js";

describe("model picker provider filtering (#4681)", () => {
  it("drops connections explicitly disabled", () => {
    const connections = [
      { id: "a", provider: "codex", isActive: true },
      { id: "b", provider: "codex", isActive: false },
      { id: "c", provider: "antigravity" },
    ];
    expect(filterEnabledConnections(connections).map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("keeps an errored connection: the router retries before dispatch", () => {
    const connections = [
      { id: "a", provider: "codex", isActive: true, testStatus: "error" },
      { id: "b", provider: "codex", isActive: true, testStatus: "unavailable" },
    ];
    expect(filterEnabledConnections(connections)).toHaveLength(2);
  });

  it("is null-safe", () => {
    expect(filterEnabledConnections(null)).toEqual([]);
    expect(filterEnabledConnections(undefined)).toEqual([]);
    expect(filterEnabledConnections([null, undefined, { isActive: false }])).toEqual([]);
  });

  it("excludes registry-hidden no-auth providers", () => {
    const providers = {
      opencode: { hidden: true },
      "mimo-free": { hidden: true },
      edge: { name: "Edge TTS" },
    };
    expect(visibleNoAuthProviderIds(["opencode", "mimo-free", "edge"], providers)).toEqual(["edge"]);
  });

  it("keeps an unknown id (no registry entry to hide it)", () => {
    expect(visibleNoAuthProviderIds(["mystery"], {})).toEqual(["mystery"]);
  });

  it("is null-safe for the no-auth list", () => {
    expect(visibleNoAuthProviderIds(null, {})).toEqual([]);
    expect(visibleNoAuthProviderIds(["x"], null)).toEqual(["x"]);
  });
});
