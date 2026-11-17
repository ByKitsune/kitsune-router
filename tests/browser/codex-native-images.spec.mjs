import { test, expect } from "@playwright/test";
import { UI_TEST_PASSWORD } from "./test-settings.mjs";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
const denial = "This account cannot use GPT Image 2.";

async function openCodexImages(page, rejectModel = false) {
  const login = await page.request.post("/api/auth/login", { data: { password: UI_TEST_PASSWORD } });
  expect(login.status()).toBe(200);
  const requests = [], errors = [], external = [];
  page.on("pageerror", error => errors.push(error.message));
  // Browser-local fixtures only: no account/key is stored and every generation
  // request is intercepted before the gateway can contact a provider.
  await page.route("**/api/keys", route => route.fulfill({ json: {
    keys: [{ id: "synthetic-image-key", key: "synthetic-browser-image-key", isActive: true }],
  } }));
  await page.route("**/api/providers", route => route.fulfill({ json: { connections: [] } }));
  await page.route("**/api/providers/client", route => route.fulfill({ json: { connections: [] } }));
  await page.route("**/api/settings", route => route.fulfill({ json: {} }));
  await page.route("**/api/proxy-pools?*", route => route.fulfill({ json: { proxyPools: [] } }));
  await page.route("**/api/models/alias", route => route.fulfill({ json: { aliases: {} } }));
  await page.route("**/api/models/custom", route => route.fulfill({ json: { models: [] } }));
  await page.route("**/api/tunnel/status", route => route.fulfill({ json: { publicUrl: null } }));
  await page.route("https://chatgpt.com/**", route => {
    external.push(route.request().url());
    return route.abort();
  });
  await page.route("**/api/v1/**", route => {
    const request = route.request();
    const body = request.postDataJSON();
    requests.push({ path: new URL(request.url()).pathname, method: request.method(), body, headers: request.headers() });
    if (rejectModel) return route.fulfill({ status: 403, headers: { "x-should-retry": "false" }, json: {
      error: { message: denial, type: "permission_error", code: "model_access_denied" },
    } });
    return route.fulfill({ status: 200, contentType: "text/event-stream", body: [
      "event: progress\ndata: {\"stage\":\"generating\"}\n\n",
      `event: done\ndata: ${JSON.stringify({ model: body.model, data: [{ b64_json: PNG }] })}\n\n`,
    ].join("") });
  });
  await page.goto("/dashboard/media-providers/image/codex");
  const example = page.locator("#provider-reference");
  await expect(example.getByRole("heading", { name: "Example", exact: true })).toBeVisible();
  const select = label => example.getByText(label, { exact: true }).locator("..").getByRole("combobox");
  const run = example.getByRole("button", { name: /\bRun$/ });
  await expect(run).toBeEnabled();
  return { example, select, run, requests, errors, external };
}

test("Codex image example uses GPT Image 2 with only advertised native parameters and renders SSE output", async ({ page }) => {
  const ui = await openCodexImages(page);
  await expect(ui.select("Model")).toHaveValue("gpt-image-2");
  await expect(ui.select("Quality").getByRole("option")).toHaveText(["auto", "low", "medium", "high"]);
  await expect(ui.example.getByText("Image Detail", { exact: true })).toHaveCount(0);
  await expect(ui.example.getByText("Style", { exact: true })).toHaveCount(0);
  await ui.example.getByPlaceholder("A cute cat wearing a hat", { exact: true }).fill("Native Codex fixture");
  await ui.select("Size").selectOption("1024x1536");
  await ui.select("Quality").selectOption("medium");
  await ui.select("Background").selectOption("transparent");
  await ui.run.click();
  await expect.poll(() => ui.requests.length).toBe(1);
  await expect(ui.run).toBeEnabled();
  expect(ui.requests[0]).toMatchObject({ path: "/api/v1/images/generations", method: "POST", body: {
    model: "cx/gpt-image-2", prompt: "Native Codex fixture", n: 1,
    size: "1024x1536", quality: "medium", background: "transparent", output_format: "png",
  }, headers: { accept: "text/event-stream" } });
  expect(Object.keys(ui.requests[0].body).sort()).toEqual([
    "background", "model", "n", "output_format", "prompt", "quality", "size",
  ]);
  const image = ui.example.getByRole("img", { name: "Generated", exact: true });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", `data:image/png;base64,${PNG}`);
  await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth === 1)).toBe(true);
  expect(ui.external).toEqual([]);
  expect(ui.errors).toEqual([]);
});

test("Codex legacy image aliases retain the caller route while identifying GPT Image 2", async ({ page }) => {
  const ui = await openCodexImages(page);
  const aliases = ["gpt-5.5-image", "gpt-5.4-image", "gpt-5.3-image"];
  for (const [index, alias] of aliases.entries()) {
    await expect(ui.select("Model").locator(`option[value="${alias}"]`)).toHaveText(/GPT Image 2.*legacy/);
    await ui.select("Model").selectOption(alias);
    await ui.run.click();
    await expect.poll(() => ui.requests.length).toBe(index + 1);
    await expect(ui.run).toBeEnabled();
    expect(ui.requests[index].body.model).toBe(`cx/${alias}`);
    expect(ui.requests[index].body).not.toHaveProperty("image_detail");
    expect(ui.requests[index].body.quality).toBe("auto");
    await expect(ui.example.getByRole("img", { name: "Generated", exact: true })).toBeVisible();
  }
  expect(ui.requests.map(request => request.body.model)).toEqual(aliases.map(alias => `cx/${alias}`));
  expect(ui.external).toEqual([]);
  expect(ui.errors).toEqual([]);
});

test("Codex model denial is visible and does not retry image generation", async ({ page }) => {
  await page.clock.install();
  const ui = await openCodexImages(page, true);
  await ui.run.click();
  await expect(ui.example.getByText(denial, { exact: true })).toBeVisible();
  await expect(ui.run).toBeEnabled();
  await page.clock.fastForward(10000);
  expect(ui.requests).toHaveLength(1);
  expect(ui.requests[0].body.model).toBe("cx/gpt-image-2");
  await expect(ui.example.getByRole("img", { name: "Generated", exact: true })).toHaveCount(0);
  expect(ui.external).toEqual([]);
  expect(ui.errors).toEqual([]);
});
