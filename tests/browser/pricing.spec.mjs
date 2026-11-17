import { test, expect } from "@playwright/test";
import { UI_TEST_PASSWORD } from "./test-settings.mjs";

test.beforeEach(async ({ page }) => {
  const response = await page.request.post("/api/auth/login", { data: { password: UI_TEST_PASSWORD } });
  expect(response.status()).toBe(200);
});

test("effective pricing diagnostics distinguish priced, missing and reference-only models", async ({ page }) => {
  const response = await page.request.get("/api/pricing?view=diagnostics");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.summary.models).toBeGreaterThan(1000);
  expect(data.summary.priced).toBeGreaterThan(0);
  expect(data.summary.unknown).toBeGreaterThan(0);
  expect(data.summary.referenceOnly).toBeGreaterThan(0);
  const unknown = Object.values(data.providers).flatMap(rows => Object.values(rows)).find(row => row.status === "unknown");
  expect(unknown.missingFields).toContain("input");
  expect(unknown.source).toBe("unpriced");
});

test("GPT-6.2 model discovery keeps API rates and Codex plan billing separate", async ({ page }) => {
  const cases = [
    { model: "gpt-6.2-sol", input: 2, output: 10, cached: 0.1, cliDefaultContext: 500000 },
    { model: "gpt-6.2-astra", input: 8, output: 40, cached: 0.4, cliDefaultContext: 272000 },
  ];
  const modelInfo = async (id) => {
    const response = await page.request.get("/v1/models/info", { params: { id } });
    expect(response.status(), id).toBe(200);
    return response.json();
  };
  for (const { model, input, output, cached, cliDefaultContext } of cases) {
    const [api, zen, codex] = await Promise.all([
      modelInfo(`openai/${model}`), modelInfo(`opencode-zen/${model}`), modelInfo(`cx/${model}`),
    ]);
    for (const entry of [api, zen]) {
      expect(entry.capabilities).toMatchObject({ contextWindow: 1050000, maxInput: 922000, maxOutput: 128000 });
      expect(entry.metadata.pricing).toMatchObject({ input, output, cached, tier: { threshold: 272000 } });
    }
    expect(codex.capabilities.thinkingEfforts).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(codex.contextWindow).toBe(cliDefaultContext);
    expect(codex.capabilities.maxInput ?? null).toBeNull();
    expect(codex.capabilities.maxOutput ?? null).toBeNull();
    expect(codex.metadata.limits.cliDefaultContext).toBe(cliDefaultContext);
    expect(codex.metadata.billing).toMatchObject({ kind: "plan", unit: "subscription" });
    expect(codex.metadata.pricing).toMatchObject({ input: null, output: null });
  }
});

test("Gemini 4 Hydrogen shows paid Standard and Priority rates in the pricing editor", async ({ page }) => {
  const model = "gemini-4-hydrogen";
  const response = await page.request.get("/v1/models/info", { params: { id: `gemini/${model}` } });
  expect(response.status()).toBe(200);
  const info = await response.json();
  expect(info.capabilities).toMatchObject({ contextWindow: 1048576, maxOutput: 65536 });
  expect(info.metadata.pricing).toMatchObject({ input: 1.5, output: 7.5, cached: 0.075, service_tiers: { priority: { input: 2.7, output: 13.5 } } });

  await page.goto("/dashboard/settings/pricing");
  await page.getByRole("button", { name: "Edit Pricing", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Pricing Configuration", exact: true });
  await dialog.getByRole("searchbox", { name: "Find provider or model" }).fill(model);
  const input = dialog.getByRole("spinbutton", { name: `gemini ${model} input (USD per million tokens)`, exact: true });
  await expect(input).toHaveValue("1.5");
  const row = dialog.getByRole("row").filter({ has: input });
  await row.getByText("Delivered speed tariffs", { exact: true }).click();
  await expect(row.getByRole("spinbutton", { name: "priority input", exact: true })).toHaveValue("2.7");
  await expect(row.getByRole("spinbutton", { name: "priority output", exact: true })).toHaveValue("13.5");
});

test("pricing editor fits a phone, retains fractional rates and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/settings/pricing");
  const trigger = page.getByRole("button", { name: "Edit Pricing", exact: true });
  await expect(trigger).toBeEnabled();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Pricing Configuration", exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth && rect.height <= innerHeight;
  })).toBe(true);
  const input = dialog.getByRole("spinbutton").first();
  await expect(input).toHaveAttribute("step", "any");
  await input.fill("0.000024");
  expect(await input.evaluate(element => element.validity.valid)).toBe(true);
  const pending = page.waitForRequest(request => request.method() === "PATCH" && new URL(request.url()).pathname === "/api/pricing");
  await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
  const request = await pending;
  const payload = request.postDataJSON();
  expect(JSON.stringify(payload)).toContain("0.000024");
  await expect(dialog).not.toBeVisible();
  const overrides = await (await page.request.get("/api/pricing?view=overrides")).json();
  let persisted = false;
  for (const [provider, models] of Object.entries(payload)) {
    for (const [model, rates] of Object.entries(models)) {
      for (const [field, value] of Object.entries(rates)) {
        if (value === 0.000024) persisted ||= overrides[provider]?.[model]?.[field] === value;
      }
    }
  }
  expect(persisted).toBe(true);
  await expect(trigger).toBeFocused();
  const bounds = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(bounds).toBe(true);
});

test("pricing load failures remain visible and can recover through Retry", async ({ page }) => {
  let fail = true;
  await page.route("**/api/pricing", async route => {
    if (fail && route.request().method() === "GET") await route.fulfill({ status: 503, json: { error: "Synthetic unavailable pricing fixture" } });
    else await route.continue();
  });
  await page.goto("/dashboard/settings/pricing");
  const error = page.getByRole("alert").filter({ hasText: "Pricing could not be loaded" });
  await expect(error).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Pricing", exact: true })).toBeDisabled();
  fail = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(error).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Pricing", exact: true })).toBeEnabled();
});
