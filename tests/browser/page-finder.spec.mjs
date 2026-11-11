import { test, expect } from "@playwright/test";
import { UI_TEST_PASSWORD } from "./test-settings.mjs";

test.beforeEach(async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { password: UI_TEST_PASSWORD } });
  expect(login.status()).toBe(200);
});

const finder = page => page.locator('dialog[data-navigation-search-dialog="true"]');
const trigger = page => page.locator('header [data-navigation-search-trigger="true"]');

test("compact desktop navigation persists without losing destinations or route state", async ({ page }) => {
  await page.goto("/dashboard/console-log");
  const rail = page.locator(".dashboard-sidebar-rail");
  await page.getByRole("button", { name: "Collapse navigation", exact: true }).first().click();
  await expect(rail).toHaveAttribute("data-collapsed", "true");
  await expect.poll(() => rail.evaluate(element => Math.round(element.getBoundingClientRect().width))).toBe(80);
  const current = rail.getByRole("link", { name: "Console log", exact: true });
  await expect(current).toHaveAttribute("aria-current", "page");
  await expect(current).toBeInViewport();
  await page.reload();
  await expect(rail).toHaveAttribute("data-collapsed", "true");
  await expect(current).toBeInViewport();
  await expect(rail.getByRole("link", { name: "Chat", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Expand navigation", exact: true }).first().click();
  await expect(rail).toHaveAttribute("data-collapsed", "false");
  await expect.poll(() => rail.evaluate(element => Math.round(element.getBoundingClientRect().width))).toBe(264);
});

test("page finder filters real destinations and supports keyboard navigation", async ({ page }) => {
  await page.goto("/dashboard/endpoint");
  await page.keyboard.press("Control+k");
  await expect(finder(page)).toBeVisible();
  const search = finder(page).getByRole("searchbox");
  await expect(search).toBeFocused();
  await search.fill("PXPIPE");
  await expect(finder(page).getByRole("link")).toHaveCount(1);
  await expect(finder(page).getByRole("status")).toHaveText("1 page");
  await expect(finder(page).getByRole("link")).toHaveAttribute("href", "/dashboard/pxpipe");
  const compositionKeys = await search.evaluate(element => ["ArrowDown", "Enter"].map(key => {
    const event = new KeyboardEvent("keydown", { key, code: key, isComposing: true, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }));
  expect(compositionKeys).toEqual([false, false]);
  await expect(search).toBeFocused();
  await expect(page).toHaveURL(/\/dashboard\/endpoint$/);
  await page.keyboard.press("ArrowDown");
  await expect(finder(page).getByRole("link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/pxpipe$/);
  await expect(finder(page)).not.toBeVisible();
  await expect(page.locator("#dashboard-content")).toBeFocused();
});

test("page finder keeps a zero-result search usable and respects feature visibility", async ({ page }) => {
  await page.route("**/api/settings", async route => {
    const response = await route.fetch();
    const settings = await response.json();
    await route.fulfill({ response, json: { ...settings, enableTranslator: false } });
  });
  await page.goto("/dashboard/endpoint");
  await trigger(page).click();
  const search = finder(page).getByRole("searchbox");
  await search.fill("translator");
  await expect(finder(page).getByRole("link")).toHaveCount(0);
  await search.fill("no-such-page-local-fixture");
  await expect(finder(page).getByRole("link")).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(search).toBeFocused();
  await expect(page).toHaveURL(/\/dashboard\/endpoint$/);
  await search.fill("pricing");
  await expect(finder(page).getByRole("link")).toHaveAttribute("href", "/dashboard/settings/pricing");
  await page.keyboard.press("Escape");
  await expect(trigger(page)).toBeFocused();
});

test("mobile page-search handoff returns focus to the visible header trigger", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/dashboard/providers");
  await page.getByRole("button", { name: "More navigation", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Dashboard navigation", exact: true });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: /Find a page/ }).click();
  await expect(drawer).not.toBeVisible();
  await expect(finder(page)).toBeVisible();
  await expect(finder(page).getByRole("searchbox")).toBeFocused();
  await page.keyboard.press("Control+k");
  await expect(finder(page).getByRole("searchbox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(finder(page)).not.toBeVisible();
  await expect(trigger(page)).toBeFocused();
});

test("page-search shortcut preserves an existing language dialog", async ({ page }) => {
  await page.goto("/dashboard/endpoint");
  await page.getByRole("button", { name: "Choose language, current: English", exact: true }).click();
  const language = page.locator("dialog.language-picker");
  await expect(language).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(language).toBeVisible();
  await expect(finder(page)).not.toBeVisible();
  await page.keyboard.press("Escape");
});

test("blocked session storage preserves the security prompt and its settings destination", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (this === sessionStorage) throw new DOMException("Synthetic blocked session storage", "SecurityError");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (this === sessionStorage) throw new DOMException("Synthetic blocked session storage", "SecurityError");
      return set.call(this, key, value);
    };
  });
  await page.route("**/api/settings", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), usesDefaultPassword: true } });
  });
  await page.goto("/dashboard/endpoint");
  const prompt = page.getByRole("dialog", { name: "Secure your gateway", exact: true });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "Update Password Now", exact: true }).click();
  await expect(prompt).not.toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/profile#password$/);
  await expect(page.locator("#password-section input").first()).toBeFocused();
  expect(errors).toEqual([]);
});
