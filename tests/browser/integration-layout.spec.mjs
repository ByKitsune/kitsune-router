import { test, expect } from "@playwright/test";
import { UI_TEST_PASSWORD } from "./test-settings.mjs";

async function expectContained(page) {
  await expect.poll(() => page.evaluate(() => {
    const main = document.querySelector("#dashboard-content");
    return Boolean(main) && main.scrollWidth <= main.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1;
  })).toBe(true);
}

test.beforeEach(async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { password: UI_TEST_PASSWORD } });
  expect(login.status()).toBe(200);
  await page.route("**/api/cli-tools/all-statuses", route => route.fulfill({ json: {
    claude: { installed: true, hasKitsuneRouter: true },
    codex: { installed: true, hasKitsuneRouter: false },
  } }));
  await page.route("**/api/cli-tools/claude-settings", route => route.fulfill({ json: { installed: false, settings: null } }));
  await page.route("**/api/cli-tools/antigravity-mitm", route => {
    expect(route.request().method()).toBe("GET");
    return route.fulfill({ json: { running: false, certExists: false, dnsStatus: {}, isAdmin: false, needsSudoPassword: true } });
  });
});

test("integration library filters actual connection status and recovers from an empty search", async ({ page }) => {
  await page.goto("/dashboard/cli-tools");
  const library = page.locator("#tool-integrations");
  const tiles = library.locator(".integration-tool-link");
  const filter = library.getByRole("button", { name: /^Connected/ });
  await expect(filter).toBeEnabled();
  const total = await tiles.count();
  expect(total).toBeGreaterThan(3);
  await filter.click();
  await expect(filter).toHaveAttribute("aria-pressed", "true");
  await expect(tiles).toHaveCount(1);
  await expect(tiles.first()).toHaveAttribute("href", "/dashboard/cli-tools/claude");
  await library.getByRole("searchbox", { name: "Search", exact: true }).fill("__no_matching_integration__");
  await expect(tiles).toHaveCount(0);
  await expect(library.getByText("No results", { exact: true })).toBeVisible();
  await library.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(filter).toHaveAttribute("aria-pressed", "false");
  await expect(tiles).toHaveCount(total);
});

test("integration library, access, MITM and detail layouts fit phone and desktop widths", async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["cli-tools", "endpoint", "mitm", "cli-tools/claude"]) {
      await page.goto(`/dashboard/${route}`);
      await expect(page.locator(".integration-workspace")).toBeVisible();
      await expectContained(page);
    }
  }
});

test("MITM tool configuration expands and collapses with keyboard without starting interception", async ({ page }) => {
  const mutations = [];
  page.on("request", request => {
    if (request.url().includes("/api/cli-tools/antigravity-mitm") && request.method() !== "GET") mutations.push(request.method());
  });
  await page.goto("/dashboard/mitm");
  const kiro = page.getByRole("button", { name: "Kiro", exact: true });
  await expect(kiro).toHaveAttribute("aria-expanded", "false");
  await kiro.focus();
  await page.keyboard.press("Enter");
  await expect(kiro).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(kiro).toHaveAttribute("aria-expanded", "false");
  expect(mutations).toEqual([]);
});
