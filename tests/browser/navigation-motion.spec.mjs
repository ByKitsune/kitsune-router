import { test, expect } from "@playwright/test";
import { UI_TEST_PASSWORD } from "./test-settings.mjs";

const sidebar = page => page.getByRole("navigation", { name: "Dashboard navigation", exact: true });

async function recordTransitions(page) {
  await page.addInitScript(() => {
    window.dashboardAnimations = [];
    window.dashboardTransitionCount = 0;
    if (typeof document.startViewTransition !== "function") return;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (...args) => {
      window.dashboardTransitionCount++;
      const transition = start(...args);
      transition.ready.then(() => {
        for (const animation of document.documentElement.getAnimations({ subtree: true })) {
          if (animation.effect?.pseudoElement?.startsWith("::view-transition")) {
            window.dashboardAnimations.push({ name: animation.animationName, duration: animation.effect.getTiming().duration });
          }
        }
      }, () => {});
      return transition;
    };
  });
}

test.beforeEach(async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { password: UI_TEST_PASSWORD } });
  expect(login.status()).toBe(200);
});

test("route commits animate content snapshots while the header and live wrapper persist", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await recordTransitions(page);
  await page.goto("/dashboard/endpoint");
  await expect(sidebar(page)).toBeVisible();
  await page.evaluate(() => {
    window.originalDashboardHeader = document.querySelector(".dashboard-shell header");
    window.originalDashboardPage = document.querySelector("[data-dashboard-page]");
  });
  await sidebar(page).getByRole("link", { name: "Providers", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/providers$/);
  await expect.poll(() => page.evaluate(() => window.dashboardAnimations.map(animation => animation.name))).toContain("dashboard-route-arrive");
  await expect.poll(() => page.evaluate(() => window.dashboardAnimations.map(animation => animation.name))).toContain("dashboard-route-depart");
  expect(await page.evaluate(() => ({
    header: document.querySelector(".dashboard-shell header") === window.originalDashboardHeader,
    page: document.querySelector("[data-dashboard-page]") === window.originalDashboardPage,
  }))).toEqual({ header: true, page: true });

  // The sidebar remains clickable while content snapshots are in flight.
  await sidebar(page).getByRole("link", { name: "Usage", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/usage$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/providers$/);
  await expect(page.locator("[data-dashboard-page]")).toHaveCount(1);
  await expect(page.locator("[data-dashboard-page]")).toHaveCSS("opacity", "1");
  expect(errors).toEqual([]);
});

test("same-route URL changes retain the controlled search and focused field", async ({ page }) => {
  await recordTransitions(page);
  await page.goto("/dashboard/providers");
  const search = page.locator(".dashboard-shell header input");
  await expect(search).toBeVisible();
  await search.fill("ByKitsune");
  const before = await page.evaluate(() => window.dashboardAnimations.filter(animation => /^dashboard-route-/.test(animation.name)).length);
  await page.evaluate(() => {
    window.originalSearch = document.querySelector(".dashboard-shell header input");
    window.history.pushState(null, "", "?motion-check=1");
  });
  await expect(page).toHaveURL(/motion-check=1/);
  await expect(search).toHaveValue("ByKitsune");
  await expect(search).toBeFocused();
  expect(await page.evaluate(() => document.querySelector(".dashboard-shell header input") === window.originalSearch)).toBe(true);
  expect(await page.evaluate(() => window.dashboardAnimations.filter(animation => /^dashboard-route-/.test(animation.name)).length)).toBe(before);
});

test("period refreshes and live usage updates do not animate a full-page snapshot", async ({ page }) => {
  await recordTransitions(page);
  await page.addInitScript(() => {
    window.EventSource = class extends EventTarget {
      constructor() {
        super();
        window.dashboardUsageStream = this;
        queueMicrotask(() => this.onopen?.(new Event("open")));
      }
      close() {}
    };
  });
  let requests = 1;
  await page.route("**/api/usage/stats?*", route => route.fulfill({ json: {
    totalRequests: requests, totalPromptTokens: 0, totalCompletionTokens: 0, totalCachedTokens: 0,
    totalCost: 0, byModel: {}, byAccount: {},
  } }));
  await page.route("**/api/usage/chart?*", route => route.fulfill({ json: [] }));
  await page.goto("/dashboard/usage");
  const count = page.locator(".usage-metric").first();
  await expect(count).toContainText("1");
  const before = await page.evaluate(() => window.dashboardAnimations.filter(animation => /^dashboard-route-/.test(animation.name)).length);
  requests = 7;
  await page.getByRole("button", { name: "7D", exact: true }).click();
  await expect(count).toContainText("7");
  expect(await page.evaluate(() => window.dashboardAnimations.filter(animation => /^dashboard-route-/.test(animation.name)).length)).toBe(before);
  requests = 9;
  await page.evaluate(() => window.dashboardUsageStream.dispatchEvent(new Event("usage-updated")));
  await expect(count).toContainText("9");
  expect(await page.evaluate(() => window.dashboardAnimations.filter(animation => /^dashboard-route-/.test(animation.name)).length)).toBe(before);
});

test("reduced motion disables route animation without hiding the destination", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await recordTransitions(page);
  await page.goto("/dashboard/endpoint");
  await sidebar(page).getByRole("link", { name: "Providers", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/providers$/);
  await expect(page.locator("[data-dashboard-page]")).toHaveCSS("opacity", "1");
  await expect(page.locator(".dashboard-route-content.workspace-enter")).toHaveCSS("animation-name", "none");
  expect(await page.evaluate(() => window.dashboardAnimations
    .filter(animation => /^dashboard-route-/.test(animation.name))
    .every(animation => animation.duration === 0))).toBe(true);
});

test("browsers without native view transitions animate the arrival and keep navigation working", async ({ page }) => {
  await page.addInitScript(() => {
    document.startViewTransition = undefined;
    window.dashboardFallbackRoutes = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      if (this.hasAttribute("data-dashboard-page")) window.dashboardFallbackRoutes.push(this.getAttribute("data-dashboard-page"));
      return animate.apply(this, args);
    };
  });
  await page.goto("/dashboard/endpoint");
  await sidebar(page).getByRole("link", { name: "Providers", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/providers$/);
  await expect.poll(() => page.evaluate(() => window.dashboardFallbackRoutes)).toContain("/dashboard/providers");
  await expect(page.locator("[data-dashboard-page]")).toHaveCSS("opacity", "1");
  await expect(sidebar(page).getByRole("link", { name: "Providers", exact: true })).toHaveAttribute("aria-current", "page");
});
