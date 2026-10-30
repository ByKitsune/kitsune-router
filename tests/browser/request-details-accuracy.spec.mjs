import { test, expect } from "@playwright/test";
import { UI_TEST_PASSWORD } from "./test-settings.mjs";

const detail = (id, tokens, latency = {}) => ({
  id, model: `accuracy-${id}`, provider: "openai", status: "success",
  timestamp: "2026-10-31T00:00:00Z", tokens, latency,
  request: { redacted: true }, response: { redacted: true },
});
const details = [
  detail("zero", {
    prompt_tokens: 0, input_tokens: 99, cached_tokens: 0, cache_read_input_tokens: 77,
    cache_creation_input_tokens: 0, completion_tokens: 0, output_tokens: 88,
  }, { ttft: 0, total: 0 }),
  detail("native", { input_tokens: "1240", cache_read_input_tokens: "17", cache_creation_input_tokens: 0, output_tokens: "25" }),
  detail("invalid", {
    prompt_tokens: null, input_tokens: 99, cached_tokens: "not-a-count", cache_creation_input_tokens: -2,
    completion_tokens: "8.5", usage_invalid: true, cache_write_invalid: true,
  }, { ttft: null, total: -4 }),
  detail("estimated", { prompt_tokens: 55, cached_tokens: 0, cache_creation_input_tokens: 0, completion_tokens: 8, estimated: true }),
];

test.beforeEach(async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { password: UI_TEST_PASSWORD } });
  expect(login.status()).toBe(200);
  await page.route("**/api/usage/request-details?*", route => route.fulfill({
    json: { details, pagination: { page: 1, pageSize: 20, totalItems: details.length, totalPages: 1 } },
  }));
});

test("request history preserves zero, native aliases and unknown counters without inventing measurements", async ({ page }) => {
  await page.goto("/dashboard/usage?tab=details");
  const row = id => page.getByRole("row").filter({ has: page.getByText(`accuracy-${id}`, { exact: true }) });
  await expect(row("zero")).toBeVisible();
  const zero = row("zero").getByRole("cell");
  for (const index of [3, 4, 5, 6]) await expect(zero.nth(index)).toHaveText("0");
  await expect(zero.nth(7)).toHaveText("TTFT: 0msTotal: 0ms");
  await expect(row("zero")).not.toContainText("Estimated tokens");

  const native = row("native").getByRole("cell");
  await expect(native.nth(3)).toHaveText("1,240");
  await expect(native.nth(4)).toHaveText("17");
  await expect(native.nth(6)).toHaveText("25");
  await expect(native.nth(7)).toHaveText("TTFT: —Total: —");

  const invalid = row("invalid").getByRole("cell");
  for (const index of [3, 4, 5, 6]) await expect(invalid.nth(index)).toHaveText("—");
  await expect(row("invalid").getByText("Invalid usage", { exact: true })).toBeVisible();
  await expect(invalid.nth(7)).toHaveText("TTFT: —Total: —");
  await expect(row("estimated").getByText("Estimated tokens", { exact: true })).toBeVisible();
  await expect(row("estimated").getByRole("cell").nth(3)).toHaveText("55");
});

test("detail drawer keeps the same count provenance and identifies redacted content", async ({ page }) => {
  await page.goto("/dashboard/usage?tab=details");
  const zero = page.getByRole("row").filter({ has: page.getByText("accuracy-zero", { exact: true }) });
  await zero.getByRole("button", { name: "Detail", exact: true }).click();
  const drawer = page.locator(".slide-in-right");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(/Input Tokens:\s*0/);
  await expect(drawer).toContainText(/Cached Tokens:\s*0/);
  await expect(drawer).toContainText(/Cache Creation:\s*0/);
  await expect(drawer).toContainText(/Output Tokens:\s*0/);
  await expect(drawer.getByText("Content redacted", { exact: true })).toBeVisible();
  await expect(drawer).not.toContainText("[No content]");
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();

  const estimated = page.getByRole("row").filter({ has: page.getByText("accuracy-estimated", { exact: true }) });
  await estimated.getByRole("button", { name: "Detail", exact: true }).click();
  await expect(drawer.getByText("Estimated tokens", { exact: true })).toBeVisible();
  await expect(drawer).toContainText(/Input Tokens:\s*55/);
  await expect(drawer).toContainText(/Latency:\s*TTFT — \/ Total —/);
});
