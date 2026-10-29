import { test, expect } from "@playwright/test";
import { UI_TEST_PASSWORD } from "./test-settings.mjs";

async function openUsage(page) {
  await page.goto("/dashboard/usage");
  await expect(page.locator(".usage-workspace")).toBeVisible();
  await expect(page.locator(".usage-metrics")).toBeVisible();
}
async function expectNoPageOverflow(page) {
  await expect(page.locator(".dashboard-page")).toHaveCSS("opacity", "1");
  const dimensions = await page.evaluate(() => {
    const main = document.querySelector("#dashboard-content");
    return {
      page: document.documentElement.scrollWidth <= window.innerWidth,
      content: main.scrollWidth <= main.clientWidth,
      contentOpacity: getComputedStyle(document.querySelector(".dashboard-page")).opacity,
    };
  });
  expect(dimensions).toEqual({ page: true, content: true, contentOpacity: "1" });
}

test.beforeEach(async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { password: UI_TEST_PASSWORD } });
  expect(login.status()).toBe(200);
  expect(await login.json()).toMatchObject({ success: true, mustChangePassword: false });
});

test("production dashboard loads its bundled font and visible content without browser errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await openUsage(page);
  await expectNoPageOverflow(page);
  await expect.poll(() => page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('16px "DM Sans Variable"');
  })).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("DM Sans Variable");
  expect(errors).toEqual([]);
});

test("mobile dock changes routes without covering page content", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openUsage(page);
  const dock = page.getByRole("navigation", { name: "Mobile quick navigation" });
  await expect(dock.getByRole("link", { name: "Usage", exact: true })).toHaveAttribute("aria-current", "page");
  await dock.getByRole("link", { name: "Providers", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/providers$/);
  await expect(dock.getByRole("link", { name: "Providers", exact: true })).toHaveAttribute("aria-current", "page");
  await dock.getByRole("link", { name: "Gateway", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/endpoint$/);
  const layout = await page.evaluate(() => {
    const main = document.querySelector("#dashboard-content").getBoundingClientRect();
    const nav = document.querySelector('nav[aria-label="Mobile quick navigation"]').getBoundingClientRect();
    return { noOverlay: main.bottom <= nav.top + 1, insideViewport: nav.bottom <= innerHeight + 1 };
  });
  expect(layout).toEqual({ noOverlay: true, insideViewport: true });
});

test("mobile drawer restores focus on Escape, closes on navigation and desktop resize", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openUsage(page);
  const more = page.getByRole("button", { name: "More navigation", exact: true });
  const drawer = page.getByRole("dialog", { name: "Dashboard navigation", exact: true });
  await more.click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(more).toBeFocused();
  await more.click();
  await drawer.getByRole("link", { name: "Quota tracker", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/quota$/);
  await expect(drawer).not.toBeVisible();
  await more.click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile quick navigation" })).not.toBeVisible();
});

test("workspace actions are keyboard navigable and restore the invoker", async ({ page }) => {
  await page.goto("/dashboard/endpoint");
  const trigger = page.getByRole("button", { name: "Account and application menu", exact: true });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "Account and application actions", exact: true });
  await expect(menu.getByRole("menuitem", { name: /Appearance/ })).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: /Shut down gateway/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: /Appearance/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("Usage fits phone, tablet, landscape, desktop and ultrawide viewports", async ({ page }) => {
  await openUsage(page);
  for (const [width, height] of [[320, 740], [390, 844], [768, 1024], [844, 390], [1024, 768], [1440, 1000], [2560, 1440]]) {
    await page.setViewportSize({ width, height });
    await expectNoPageOverflow(page);
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "Request details", exact: true }).click();
  await expect(page).toHaveURL(/tab=details/);
  await expectNoPageOverflow(page);
  await page.getByRole("button", { name: "Live logs", exact: true }).click();
  await expect(page).toHaveURL(/tab=logs/);
  await expectNoPageOverflow(page);
});

test("dark and reduced-motion preferences keep Usage visible and functional", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("theme", JSON.stringify({ state: { theme: "dark" }, version: 0 })));
  await openUsage(page);
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expectNoPageOverflow(page);
  await page.getByRole("button", { name: "7D", exact: true }).click();
  await expect(page.getByRole("button", { name: "7D", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".workspace-enter").first()).toHaveCSS("animation-name", "none");
});

test("language picker searches, supports keyboard choice and persists the selected locale", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openUsage(page);
  const trigger = page.getByRole("button", { name: "Choose language, current: English", exact: true });
  await trigger.click();
  const picker = page.getByRole("dialog", { name: "Your workspace, your language.", exact: true });
  const search = picker.getByRole("searchbox", { name: "Search languages", exact: true });
  await expect(search).toBeFocused();
  await search.fill("Indonesian");
  await expect(picker.getByRole("button", { name: /^Indonesia, Indonesian/ })).toBeVisible();
  await search.press("ArrowDown");
  await expect(picker.getByRole("button", { name: /^Indonesia, Indonesian/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(picker).not.toBeVisible();
  await expect.poll(async () => (await page.context().cookies()).find(cookie => cookie.name === "locale")?.value).toBe("id");
  await page.reload();
  const selected = page.getByRole("button", { name: "Choose language, current: Indonesia", exact: true });
  await expect(selected).toBeVisible();
  await selected.click();
  await expect(picker.getByRole("searchbox", { name: "Search languages", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(picker).not.toBeVisible();
  await expect(selected).toBeFocused();
});

test("usage hints are available to keyboard users and dismiss with Escape", async ({ page }) => {
  await openUsage(page);
  const metric = page.locator(".usage-metric").first();
  const hintTrigger = metric.locator('[tabindex="0"]').first();
  await hintTrigger.focus();
  const tooltip = page.getByRole("tooltip", { name: "0 total requests", exact: true });
  await expect(tooltip).toBeVisible();
  const bounds = await page.locator(".workspace-tooltip").boundingBox();
  expect(bounds).not.toBeNull();
  const viewport = page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  await page.keyboard.press("Escape");
  await expect(tooltip).not.toBeVisible();
});


test("keyboard hints stay in bounds when mobile content scrolls near a viewport edge", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 560 });
  await openUsage(page);
  const hintTrigger = page.locator('.usage-metrics [tabindex="0"]').first();
  await hintTrigger.evaluate(element => element.scrollIntoView({ block: "start", behavior: "instant" }));
  await hintTrigger.focus();
  await expect(page.getByRole("tooltip", { name: "0 total requests", exact: true })).toBeVisible();
  await expect.poll(async () => {
    const box = await page.locator(".workspace-tooltip").boundingBox();
    return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 320 && box.y + box.height <= 560;
  }).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).not.toBeVisible();
  await expect(hintTrigger).toBeFocused();
});
