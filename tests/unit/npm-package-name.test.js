// npm package-name drift — recurring defect #1 in this codebase.
//
// The package is published as the SCOPED name `@joyccn/zenrouter`. The bare
// `zenrouter` is unclaimed: `npm view zenrouter` returns 404 and
// https://registry.npmjs.org/zenrouter/latest is Not found. Two places still used
// the bare name and both failed silently:
//
//   - src/app/api/version/route.js fetched .../zenrouter/latest, so /api/version
//     always answered `latestVersion: null` and the dashboard could never report
//     that an update existed. Confirmed live against production 0.9.7.
//   - UPDATER_CONFIG built `npm i -g zenrouter`, so the updater would have exited
//     404 instead of installing anything.
//
// The landing page and the i18n literal files repeated the same literal in the
// copyable install command, so a user following the advertised instructions got a
// 404 as well.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { APP_CONFIG, NPM_PACKAGE_NAME, UPDATER_CONFIG } from "../../src/shared/constants/config.js";

const ROOT = new URL("../..", import.meta.url).pathname;
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

// Matches an install/run command that names the UNCLAIMED bare package.
// The negative lookahead keeps the scoped form (@joyccn/zenrouter) from matching.
const BARE_INSTALL = /(?:npx|npm\s+(?:i|install)\s+-g)\s+zenrouter(?![a-zA-Z@/-])/;

describe("the npm package identity is the scoped name", () => {
  it("exports the scoped package name", () => {
    expect(NPM_PACKAGE_NAME).toBe("@joyccn/zenrouter");
  });

  it("matches the name in the published CLI package", () => {
    // The root package is the private app ("zenrouter-app"); the artifact
    // published to npm as @joyccn/zenrouter is the CLI package in cli/.
    expect(JSON.parse(read("cli/package.json")).name).toBe(NPM_PACKAGE_NAME);
    expect(JSON.parse(read("package.json")).name).not.toBe(NPM_PACKAGE_NAME);
  });

  it("builds the updater commands from that name", () => {
    expect(UPDATER_CONFIG.npmPackageName).toBe(NPM_PACKAGE_NAME);
    expect(UPDATER_CONFIG.installCmd).toBe(`npm i -g ${NPM_PACKAGE_NAME}`);
    expect(UPDATER_CONFIG.installCmdLatest).toContain(`@latest`);
    expect(UPDATER_CONFIG.installCmdLatest).toContain(NPM_PACKAGE_NAME);
    // The bare name must not survive in any command the updater would execute.
    expect(UPDATER_CONFIG.installCmd).not.toMatch(/npm i -g zenrouter(\s|$)/);
  });

  it("does not bake the version into the install commands", () => {
    // A pinned version would make "update to latest" a no-op.
    expect(UPDATER_CONFIG.installCmd).not.toContain(APP_CONFIG.version);
  });
});

describe("the version route queries the real package", () => {
  const source = read("src/app/api/version/route.js");

  it("imports the shared constant instead of hardcoding a name", () => {
    expect(source).toMatch(/import\s*\{[^}]*NPM_PACKAGE_NAME[^}]*\}\s*from\s*"@\/shared\/constants\/config\.js"/);
  });

  it("no longer declares its own package name", () => {
    // A second copy is exactly how the two drifted apart before.
    expect(source).not.toMatch(/const\s+NPM_PACKAGE_NAME\s*=/);
  });

  it("builds the registry URL from the imported constant", () => {
    expect(source).toMatch(/registry\.npmjs\.org\/\$\{NPM_PACKAGE_NAME\}\/latest/);
  });

  it("would resolve on the real registry (name shape is fetchable)", () => {
    // A scoped name must appear as @scope/name — not URL-encoded into a single
    // path segment, and not stripped of its scope.
    expect(NPM_PACKAGE_NAME).toMatch(/^@[a-z0-9-]+\/[a-z0-9-]+$/);
  });
});

describe("no advertised command names the unclaimed package", () => {
  it("the landing page derives the command from the constant", () => {
    const source = read("src/app/landing/components/GetStarted.js");
    expect(source).toMatch(/NPM_PACKAGE_NAME/);
    expect(source).not.toMatch(BARE_INSTALL);
  });

  it.each(["public/i18n/literals", "cli/app/public/i18n/literals"])(
    "%s has no bare-name command in any locale",
    (dir) => {
      const abs = join(ROOT, dir);
      if (!existsSync(abs)) return;
      const offenders = [];
      for (const name of readdirSync(abs)) {
        if (!name.endsWith(".json")) continue;
        const raw = readFileSync(join(abs, name), "utf8");
        if (BARE_INSTALL.test(raw)) offenders.push(name);
      }
      expect(offenders, `locales still naming the unclaimed package`).toEqual([]);
    },
  );

  it("keeps the scoped command present as an i18n KEY in a sampled locale", () => {
    // translate() looks up the DOM text itself as the key, so the literal key and
    // the rendered string must both be the scoped form or the lookup silently
    // falls through to English.
    const dict = JSON.parse(read("public/i18n/literals/id.json"));
    expect(dict).toHaveProperty("npx @joyccn/zenrouter");
    expect(dict).toHaveProperty("npm install -g @joyccn/zenrouter");
    expect(dict).not.toHaveProperty("npx zenrouter");
  });
});

describe("source never reintroduces the bare name", () => {
  it("the updater builds npx args from the constant", () => {
    const source = read("src/lib/appUpdater.js");
    expect(source).toMatch(/UPDATER_CONFIG\.npmPackageName/);
    expect(source).not.toMatch(BARE_INSTALL);
  });

  it("install.sh does not instruct the bare scoped-less install", () => {
    const source = read("install.sh");
    expect(source).not.toMatch(BARE_INSTALL);
  });
});
