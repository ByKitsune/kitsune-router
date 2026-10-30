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
  const picker = page.locator("dialog.language-picker");
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
  const selected = page.getByRole("button", { name: "Pilih bahasa, saat ini: Indonesia", exact: true });
  await expect(selected).toBeVisible();
  await selected.click();
  await expect(picker.getByRole("searchbox", { name: "Cari bahasa", exact: true })).toBeFocused();
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


test("Indonesian UI updates labels and counters without translating code or model identifiers", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.request.post("/api/locale", { data: { locale: "id" } });
  await openUsage(page);
  await expect(page.getByRole("heading", { name: "Setiap permintaan, dalam perspektif.", exact: true })).toBeVisible();
  await expect(page.locator(".usage-metrics")).toContainText("Total permintaan");
  await expect(page.getByRole("button", { name: "Buka navigasi", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  // A synthetic subtree exercises the same observer paths as asynchronously
  // inserted React views. Values and code remain source text; no API is called.
  await page.evaluate(() => {
    const fixture = document.createElement("section");
    fixture.id = "localization-fixture";
    fixture.innerHTML = '<p id="localized-state">Estimated cost</p><input id="localized-search" placeholder="Search models..." title="Source 1" aria-label="Find provider or model"><span id="localized-count">2 requests</span><code><span id="preserved-code">Not specified</span></code><span data-i18n-skip id="preserved-model">Not specified</span>';
    document.querySelector("main").prepend(fixture);
  });
  await expect(page.locator("#localized-state")).toHaveText("Perkiraan biaya");
  await expect(page.locator("#localized-search")).toHaveAttribute("placeholder", "Cari model...");
  await expect(page.locator("#localized-search")).toHaveAttribute("title", "Sumber 1");
  await expect(page.locator("#localized-search")).toHaveAttribute("aria-label", "Cari penyedia atau model");
  await expect(page.locator("#localized-count")).toHaveText("2 permintaan");
  await expect(page.locator("#preserved-code")).toHaveText("Not specified");
  await expect(page.locator("#preserved-model")).toHaveText("Not specified");
  await page.evaluate(() => {
    document.querySelector("#localized-state").firstChild.nodeValue = "Not specified";
    document.querySelector("#localized-count").firstChild.nodeValue = "7 requests";
    document.querySelector("#localized-search").setAttribute("title", "Source 2");
  });
  await expect(page.locator("#localized-state")).toHaveText("Belum ditentukan");
  await expect(page.locator("#localized-count")).toHaveText("7 permintaan");
  await expect(page.locator("#localized-search")).toHaveAttribute("title", "Sumber 2");
  await page.getByRole("button", { name: "Pilih bahasa, saat ini: Indonesia", exact: true }).click();
  const picker = page.locator("dialog.language-picker");
  await expect(picker.getByRole("heading", { name: "Ruang kerja Anda, bahasa Anda.", exact: true })).toBeVisible();
  await picker.getByRole("searchbox", { name: "Cari bahasa", exact: true }).fill("English");
  await picker.getByRole("button", { name: "English, English", exact: true }).click();
  await expect(page.locator("#localized-state")).toHaveText("Not specified");
  await expect(page.locator("#localized-count")).toHaveText("7 requests");
  await expect(page.locator("#localized-search")).toHaveAttribute("title", "Source 2");
  await expect(page.locator("#preserved-code")).toHaveText("Not specified");
});

test("Japanese pricing states and accessible labels use the selected dictionary", async ({ page }) => {
  await page.request.post("/api/locale", { data: { locale: "ja" } });
  await openUsage(page);
  await expect(page.locator(".usage-metrics")).toContainText("総リクエスト数");
  await page.evaluate(() => {
    const element = document.createElement("p");
    element.id = "localized-japanese";
    element.textContent = "Not specified";
    element.setAttribute("title", "Find provider or model");
    document.querySelector("main").prepend(element);
  });
  await expect(page.locator("#localized-japanese")).toHaveText("未指定");
  await expect(page.locator("#localized-japanese")).toHaveAttribute("title", "プロバイダーまたはモデルを検索");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
});

test("official provider setup keeps its identity and translates the website label", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/providers");
  const official = page.locator("#official-provider");
  await expect(official.getByRole("heading", { name: "ByKitsune", exact: true })).toBeVisible();
  await expect(official.getByRole("link", { name: "Connect ByKitsune", exact: true }))
    .toHaveAttribute("href", "/dashboard/providers/bykitsune");
  await expectNoPageOverflow(page);

  await page.request.post("/api/locale", { data: { locale: "id" } });
  await page.reload();
  await expect(official).toContainText("Penyedia resmi");
  await expect(official.getByRole("link", { name: "Kunjungi situs web ByKitsune (dibuka di tab baru)", exact: true }))
    .toHaveAttribute("href", "https://bykitsune.com/");
  await expect(official.getByRole("heading", { name: "ByKitsune", exact: true })).toBeVisible();
});

test("observability switch persists the server-confirmed preference across a reload", async ({ page }) => {
  const initialResponse = await page.request.get("/api/settings");
  expect(initialResponse.status()).toBe(200);
  const initial = await initialResponse.json();
  expect(initial.observabilitySource).toBe("settings");
  const selected = !initial.observabilityEnabled;

  try {
    await page.goto("/dashboard/profile");
    const toggle = page.getByRole("switch", { name: "Enable Observability", exact: true });
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute("aria-checked", String(initial.observabilityEnabled));
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", String(selected));
    await expect.poll(async () => {
      const response = await page.request.get("/api/settings");
      const settings = await response.json();
      return { saved: settings.enableObservability, effective: settings.observabilityEnabled, source: settings.observabilitySource };
    }).toEqual({ saved: selected, effective: selected, source: "settings" });
    await page.reload();
    await expect(toggle).toHaveAttribute("aria-checked", String(selected));
  } finally {
    const restored = await page.request.patch("/api/settings/observability", {
      data: { enableObservability: initial.enableObservability === true },
    });
    expect(restored.status()).toBe(200);
  }
});
