import { test, expect } from "@playwright/test";
import { UI_TEST_PASSWORD } from "./test-settings.mjs";

test.beforeEach(async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { password: UI_TEST_PASSWORD } });
  expect(login.status()).toBe(200);
  expect(await login.json()).toMatchObject({ success: true, mustChangePassword: false });
});

test("five mobile destinations fit narrow and tablet screens without covering content", async ({ page }) => {
  await page.goto("/dashboard/endpoint");
  const dock = page.getByRole("navigation", { name: "Mobile quick navigation", exact: true });
  for (const [width, height] of [[320, 740], [390, 844], [768, 1024]]) {
    await page.setViewportSize({ width, height });
    await expect(dock).toBeVisible();
    await expect(dock.getByRole("link")).toHaveCount(4);
    for (const label of ["Gateway", "Providers", "Chat", "Usage"]) {
      await expect(dock.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    await expect(dock.getByRole("link", { name: "Gateway", exact: true })).toHaveAttribute("aria-current", "page");
    const layout = await dock.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const main = document.querySelector("#dashboard-content").getBoundingClientRect();
      const destinations = Array.from(element.querySelectorAll("a,button"), control => {
        const box = control.getBoundingClientRect();
        return { width: box.width, height: box.height, contained: box.left >= 0 && box.right <= innerWidth };
      });
      return { destinations, noOverlay: main.bottom <= bounds.top + 1, contained: bounds.bottom <= innerHeight + 1, noOverflow: document.documentElement.scrollWidth <= innerWidth };
    });
    expect(layout.destinations).toHaveLength(5);
    for (const control of layout.destinations) {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
      expect(control.contained).toBe(true);
    }
    expect(layout).toMatchObject({ noOverlay: true, contained: true, noOverflow: true });
  }
});

test("Chat is directly reachable by keyboard and preserves the dock current-page state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/endpoint");
  const dock = page.getByRole("navigation", { name: "Mobile quick navigation", exact: true });
  const chat = dock.getByRole("link", { name: "Chat", exact: true });
  await chat.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/basic-chat$/);
  await expect(chat).toHaveAttribute("aria-current", "page");
  await expect(dock.locator('[aria-current="page"]')).toHaveCount(1);
  await dock.getByRole("link", { name: "Providers", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/providers$/);
  await expect(chat).not.toHaveAttribute("aria-current", "page");
});

test("More exposes secondary destinations and closes after selecting a page", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/dashboard/pxpipe");
  const dock = page.getByRole("navigation", { name: "Mobile quick navigation", exact: true });
  const more = dock.getByRole("button", { name: "More navigation", exact: true });
  await expect(more).toHaveClass(/is-active/);
  await expect(dock.locator('[aria-current="page"]')).toHaveCount(0);
  await more.click();
  const drawer = page.getByRole("dialog", { name: "Dashboard navigation", exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('a[href="/dashboard/pxpipe"]')).toBeInViewport();
  for (const route of ["basic-chat", "pxpipe", "mitm", "settings/pricing"]) {
    await expect(drawer.locator(`a[href="/dashboard/${route}"]`)).toHaveCount(1);
  }
  const pricing = drawer.locator('a[href="/dashboard/settings/pricing"]');
  await pricing.click();
  await expect(page).toHaveURL(/\/dashboard\/settings\/pricing$/);
  await expect(drawer).not.toBeVisible();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toHaveClass(/is-active/);
  await more.click();
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(more).toBeFocused();
});
