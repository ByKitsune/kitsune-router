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
