import { describe, expect, it } from "vitest";
import { getNavigationGroups, flattenNavigationItems, isNavigationRoute, findNavigationRoute } from "../../src/shared/components/navigation/dashboardNavigation.js";

describe("dashboard destination catalog", () => {
  it("keeps the complete page surface discoverable with unique destinations and identity", () => {
    const items = flattenNavigationItems(getNavigationGroups({ enableTranslator: true }));
    expect(new Set(items.map(item => item.href)).size).toBe(items.length);
    expect(new Set(items.map(item => item.id)).size).toBe(items.length);
    for (const href of ["/dashboard/endpoint", "/dashboard/providers", "/dashboard/combos", "/dashboard/basic-chat", "/dashboard/cli-tools", "/dashboard/usage", "/dashboard/quota", "/dashboard/token-saver", "/dashboard/pxpipe", "/dashboard/proxy-pools", "/dashboard/mitm", "/dashboard/console-log", "/dashboard/translator", "/dashboard/skills", "/dashboard/profile", "/dashboard/settings/pricing"]) {
      expect(items.find(item => item.href === href), href).toBeDefined();
    }
    expect(items.filter(item => item.parent?.id === "media")).toHaveLength(6);
    expect(items.every(item => item.groupId && item.groupLabel && item.description && item.icon)).toBe(true);
  });

  it("preserves the Translator visibility setting without leaking it between calls", () => {
    const hrefs = enabled => flattenNavigationItems(getNavigationGroups({ enableTranslator: enabled })).map(item => item.href);
    expect(hrefs(false)).not.toContain("/dashboard/translator");
    expect(hrefs(true)).toContain("/dashboard/translator");
    expect(hrefs(false)).not.toContain("/dashboard/translator");
    expect(findNavigationRoute("/dashboard/translator")?.id).toBe("translator");
  });

  it("resolves details and aliases using full segment boundaries", () => {
    expect(isNavigationRoute("/dashboard", "/dashboard/endpoint")).toBe(true);
    expect(isNavigationRoute("/dashboard/providers/openai?tab=models#active", "/dashboard/providers")).toBe(true);
    expect(isNavigationRoute("/dashboard/providers-old", "/dashboard/providers")).toBe(false);
    expect(isNavigationRoute("/dashboard/usage-reports", "/dashboard/usage")).toBe(false);
    expect(isNavigationRoute(null, "/dashboard/usage")).toBe(false);
    expect(findNavigationRoute("/dashboard/providers/new")?.id).toBe("providers");
    expect(findNavigationRoute("/dashboard/cli-tools/claude")?.id).toBe("cli-tools");
    expect(findNavigationRoute("/dashboard/media-providers/image/openai")?.parent?.id).toBe("media");
    expect(findNavigationRoute("/dashboard/media-providers/combo/local-fixture")?.id).toBe("combos");
    expect(findNavigationRoute("/dashboard/settings/pricing/")?.id).toBe("pricing");
    expect(findNavigationRoute("/unknown")).toBeNull();
  });
});
