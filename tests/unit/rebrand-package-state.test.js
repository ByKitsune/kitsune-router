import { describe, it, expect } from "vitest";
import nextConfig from "../../next.config.mjs";
import { excludeRuntimeState } from "../../scripts/copy-standalone-assets.mjs";

describe("rebrand packaging does not trace installation state", () => {
  it("excludes private test, build-home and operator state before standalone tracing", () => {
    const exclusions = nextConfig.outputFileTracingExcludes["*"];
    expect(exclusions).toEqual(expect.arrayContaining([
      "./.verification/**/*", "./verification/**/*", "./cli/.build-home/**/*",
      "./data/**/*", "./.data/**/*", "./**/secrets.json", "./**/secrets.env",
      "./**/machine-id", "./.env", "./.env.*",
    ]));
  });

  it.each([".verification", "verification", "secrets.json", "secrets.env", "machine-id", ".env", ".env.production", ".npmrc", "state.sqlite", "state.sqlite-wal", "rootCA.key"])("rejects %s at the final package boundary", (name) => {
    expect(excludeRuntimeState(`/synthetic/package/${name}`)).toBe(false);
  });

  it.each(["identity.mjs", "dataDirectory.js", "runtimeSecrets.js", "icon-192.png", "rootCA.js"])("keeps required source/artwork %s", (name) => {
    expect(excludeRuntimeState(`/synthetic/package/${name}`)).toBe(true);
  });
});
