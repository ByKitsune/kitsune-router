import { test, expect } from "@playwright/test";
import { UI_TEST_PASSWORD } from "./test-settings.mjs";

test("combo picker offers discovered models from enabled ByKitsune and Cursor accounts", async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { password: UI_TEST_PASSWORD } });
  expect(login.status()).toBe(200);
  const calls = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  // All connections/catalogs are browser-local fixtures. Nothing is saved and
  // no provider endpoint or inference request is contacted by this test.
  await page.route("**/api/providers", route => route.fulfill({ json: {
    connections: [
      { id: "synthetic-disabled-bykitsune", provider: "bykitsune", isActive: false },
      { id: "synthetic-bykitsune", provider: "bykitsune", isActive: true },
      { id: "synthetic-disabled-cursor", provider: "cursor", isActive: false },
      { id: "synthetic-cursor", provider: "cursor", isActive: true },
    ],
  } }));
  await page.route("**/api/combos", route => route.fulfill({ json: { combos: [] } }));
  await page.route("**/api/providers/*/models", route => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2);
    calls.push(id);
    const name = id.includes("disabled") ? "Disabled-only catalog model"
      : id.endsWith("bykitsune") ? "Observed ByKitsune model" : "Observed Cursor model";
    return route.fulfill({ json: { models: [{ id: "synthetic-discovered-model", name }] } });
  });
  await page.goto("/dashboard/combos");
  await page.getByRole("button", { name: /Create Combo/ }).first().click();
  const form = page.getByRole("dialog", { name: "Create Combo", exact: true });
  await form.getByRole("button", { name: /Add Model/ }).click();
  const picker = page.getByRole("dialog", { name: "Add Model to Combo", exact: true });
  await expect(picker.getByRole("button", { name: /Observed ByKitsune model/ })).toBeVisible();
  await expect(picker.getByRole("button", { name: /Observed Cursor model/ })).toBeVisible();
  await expect(picker.getByRole("button", { name: /Disabled-only catalog model/ })).toHaveCount(0);
  expect([...new Set(calls)].sort()).toEqual(["synthetic-bykitsune", "synthetic-cursor"]);
  await picker.getByRole("button", { name: /Observed ByKitsune model/ }).click();
  await page.keyboard.press("Escape");
  await expect(picker).not.toBeVisible();
  await expect(form).toContainText("bykitsune/synthetic-discovered-model");
  expect(errors).toEqual([]);
});

test("Web Search combo can select SearXNG without creating a provider account", async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { password: UI_TEST_PASSWORD } });
  expect(login.status()).toBe(200);
  const errors = [], saved = [], upstream = [];
  page.on("pageerror", error => errors.push(error.message));
  const combo = { id: "synthetic-search-combo", name: "synthetic-search-combo", kind: "webSearch", models: [] };
  await page.route("**/api/providers", route => route.fulfill({ json: { connections: [] } }));
  await page.route("**/api/settings", route => route.fulfill({ json: {} }));
  await page.route("**/api/usage/logs", route => route.fulfill({ json: [] }));
  await page.route("**/api/keys", route => route.fulfill({ json: { keys: [] } }));
  await page.route("**/api/models/alias", route => route.fulfill({ json: { aliases: {} } }));
  await page.route("**/api/combos", route => route.fulfill({ json: { combos: [] } }));
  await page.route("**/api/combos/synthetic-search-combo", route => {
    if (route.request().method() === "PUT") saved.push(route.request().postDataJSON());
    return route.fulfill({ json: combo });
  });
  // Choosing a route is configuration only; it must not run a search or spend
  // provider tokens. Capture an accidental call without allowing it upstream.
  await page.route("**/v1/search**", route => {
    upstream.push(route.request().url());
    return route.abort();
  });
  await page.goto("/dashboard/media-providers/combo/synthetic-search-combo");
  await page.getByRole("button", { name: "Add Provider", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Add Web Search Model", exact: true });
  const searxng = picker.getByRole("button", { name: /SearXNG/ });
  await expect(searxng).toBeVisible();
  await expect(picker.getByRole("button", { name: /Brave Search/ })).toHaveCount(0);
  await searxng.click();
  await expect.poll(() => saved).toEqual([{ models: ["searxng"] }]);
  await page.keyboard.press("Escape");
  await expect(picker).not.toBeVisible();
  // The closing picker can remain mounted during its exit animation. Assert
  // the configured row in the editor rather than its duplicate picker label.
  await expect(page.locator(".provider-combo-editor").getByText("SearXNG", { exact: true })).toBeVisible();
  expect(upstream).toEqual([]);
  expect(errors).toEqual([]);
});
