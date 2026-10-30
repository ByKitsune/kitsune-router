import { test, expect } from "@playwright/test";
import { UI_TEST_PASSWORD } from "./test-settings.mjs";

test("partial recorded costs stay legible and link to pricing without changing saved estimates", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.request.post("/api/auth/login", { data: { password: UI_TEST_PASSWORD } });
  expect(response.status()).toBe(200);
  const costCoverage = {
    totalCost: { knownCost: 3.5, unknownRequests: 2 },
    inputCost: { knownCost: 2.5, unknownRequests: 2 },
    cachedCost: { knownCost: 0.25, unknownRequests: 0 },
    outputCost: { knownCost: 0.75, unknownRequests: 2 },
  };
  const model = {
    rawModel: "synthetic-dynamic-model", provider: "bykitsune", requests: 12,
    promptTokens: 1000, cachedTokens: 100, completionTokens: 100,
    totalCost: null, cost: null, inputCost: null, cachedCost: 0.25, outputCost: null,
    costCoverage, lastUsed: new Date().toISOString(),
  };
  const byAccount = {
    first: { ...model, accountName: "main", connectionId: "account-alpha", requests: 10, promptTokens: 800, completionTokens: 80,
      costCoverage: { ...costCoverage, totalCost: { knownCost: 2, unknownRequests: 2 },
        inputCost: { knownCost: 1.5, unknownRequests: 2 }, outputCost: { knownCost: 0.25, unknownRequests: 2 } } },
    legacy: { ...model, accountName: "main", connectionId: "account-alpha", rawModel: "", modelAllocationUnknown: true,
      requests: 1, promptTokens: 100, cachedTokens: 0, completionTokens: 10,
      totalCost: 0, cost: 0, inputCost: null, cachedCost: 0, outputCost: null,
      costCoverage: { totalCost: { knownCost: 0, unknownRequests: 0 }, inputCost: { knownCost: null, unknownRequests: null },
        cachedCost: { knownCost: 0, unknownRequests: 0 }, outputCost: { knownCost: null, unknownRequests: null } } },
    second: { ...model, accountName: "main", connectionId: "account-beta", requests: 1, promptTokens: 100, cachedTokens: 0, completionTokens: 10,
      totalCost: 1.5, cost: 1.5, inputCost: 1, cachedCost: 0, outputCost: 0.5,
      costCoverage: { totalCost: { knownCost: 1.5, unknownRequests: 0 }, inputCost: { knownCost: 1, unknownRequests: 0 },
        cachedCost: { knownCost: 0, unknownRequests: 0 }, outputCost: { knownCost: 0.5, unknownRequests: 0 } } },
  };
  // This response is synthetic recorded history; no provider, billing or model
  // catalog service is contacted and no usage records are written.
  await page.route("**/api/usage/stats?*", route => route.fulfill({ json: {
    totalRequests: 12, totalPromptTokens: 1000, totalCachedTokens: 100, totalCompletionTokens: 100,
    totalCost: null, costCoverage, byModel: { synthetic: model }, byAccount,
  } }));
  await page.route("**/api/usage/chart?*", route => route.fulfill({ json: [] }));
  await page.goto("/dashboard/usage");
  const coverage = page.getByRole("complementary", { name: "Recorded price coverage", exact: true });
  await expect(coverage).toBeVisible();
  await expect(coverage).toContainText("2 unpriced");
  const total = page.locator("tr.group-summary td").last();
  await expect(total).toContainText("$3.50");
  await expect(total).toContainText("known subtotal");
  await expect(total).toContainText("2 unpriced");
  expect(await total.evaluate(element => element.innerText)).toMatch(/\$3\.50\s+known subtotal\s+2 unpriced/);
  await coverage.getByText("Why can prices be missing?", { exact: true }).click();
  await expect(coverage).toContainText("A recorded $0.00 can mean no charge or no tokens used for that component.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("combobox", { name: "Group usage by", exact: true }).selectOption("account");
  await expect(page.locator("tr.group-summary")).toHaveCount(2);
  await expect(page.locator("tr.group-summary").first()).toContainText("account-alpha");
  await expect(page.locator("tr.group-summary").last()).toContainText("account-beta");
  await page.locator("tr.group-summary").first().getByRole("button").click();
  await expect(page.locator("tr.group-detail")).toHaveCount(2);
  await expect(page.locator("tr.group-detail").first()).toContainText("main");
  await expect(page.locator("tr.group-detail").filter({ hasText: "Model allocation unavailable" })).toHaveCount(1);
  const breakdownMetric = page.getByRole("button", { name: "Costs", exact: true }).locator("..");
  await breakdownMetric.getByRole("button", { name: "Tokens", exact: true }).click();
  await expect(coverage).not.toBeVisible();
  await breakdownMetric.getByRole("button", { name: "Costs", exact: true }).click();
  await coverage.getByRole("link", { name: "Review pricing", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings\/pricing$/);
  await expect(page.getByRole("button", { name: "Edit Pricing", exact: true })).toBeEnabled();
});
