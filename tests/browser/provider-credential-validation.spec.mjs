import { test, expect } from "@playwright/test";
import { UI_TEST_PASSWORD } from "./test-settings.mjs";

async function openCredentialEditor(page, validate, openEdit = true) {
  const login = await page.request.post("/api/auth/login", { data: { password: UI_TEST_PASSWORD } });
  expect(login.status()).toBe(200);
  const checks = [], updates = [], creates = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let connection = {
    id: "synthetic-media-connection", provider: "selfhosted-stt", authType: "apikey",
    name: "Synthetic media account", isActive: true, priority: 1, testStatus: "active",
    providerSpecificData: {
      baseUrl: "http://speech-old.invalid/v1/audio/transcriptions",
      proxyPoolId: "synthetic-pool", connectionProxyEnabled: true,
      connectionProxyUrl: "http://legacy-proxy.invalid:8080",
    },
  };
  // These browser-local fixtures cover every provider endpoint used by the
  // page. No real credential, provider request or saved account is used.
  await page.route("**/api/providers", async route => {
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON();
      creates.push(payload);
      await route.fulfill({ status: 201, json: { connection: { id: "synthetic-created", ...payload } } });
    } else {
      await route.fulfill({ json: { connections: [connection] } });
    }
  });
  await page.route("**/api/provider-nodes", route => route.fulfill({ json: { nodes: [] } }));
  await page.route("**/api/proxy-pools?*", route => route.fulfill({ json: { proxyPools: [{
    id: "synthetic-pool", name: "Synthetic pool", isActive: true, proxyUrl: "http://proxy.invalid:8080",
  }] } }));
  await page.route("**/api/providers/**", async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/providers/validate") {
      const payload = request.postDataJSON();
      checks.push(payload);
      await validate(route, payload, checks.length);
    } else if (pathname === `/api/providers/${connection.id}` && request.method() === "PUT") {
      const payload = request.postDataJSON();
      updates.push(payload);
      connection = { ...connection, ...payload };
      await route.fulfill({ json: { connection } });
    } else if (pathname.endsWith("/models")) {
      await route.fulfill({ json: { models: [] } });
    } else {
      await route.fulfill({ status: 404, json: { error: "Unconfigured synthetic provider endpoint" } });
    }
  });
  await page.goto("/dashboard/providers/selfhosted-stt");
  const edit = page.getByRole("button", { name: /^edit\s+Edit$/ });
  await expect(edit).toBeVisible();
  if (openEdit) await edit.click();
  const dialog = page.getByRole("dialog", { name: "Edit Connection", exact: true });
  if (openEdit) await expect(dialog).toBeVisible();
  return { checks, updates, creates, errors, dialog, edit };
}

test("editing a checked key resets its status and Save validates the same endpoint and proxy settings", async ({ page }) => {
  const ui = await openCredentialEditor(page, (route, payload) => route.fulfill({ json: {
    valid: payload.apiKey === "synthetic-key-a",
  } }));
  const endpointA = "http://speech-checked.invalid/v1/audio/transcriptions";
  const endpointB = "http://speech-saved.invalid/v1/audio/transcriptions";
  await ui.dialog.getByLabel("API Key", { exact: true }).fill("synthetic-key-a");
  await ui.dialog.getByLabel("Base URL", { exact: true }).fill(` ${endpointA} `);
  await ui.dialog.getByRole("button", { name: "Check", exact: true }).click();
  await expect(ui.dialog.getByText("Valid", { exact: true })).toBeVisible();
  expect(ui.checks).toHaveLength(1);
  expect(ui.checks[0]).toEqual({
    provider: "selfhosted-stt", apiKey: "synthetic-key-a",
    providerSpecificData: {
      baseUrl: endpointA, proxyPoolId: "synthetic-pool", connectionProxyEnabled: true,
      connectionProxyUrl: "http://legacy-proxy.invalid:8080",
    },
  });

  await ui.dialog.getByLabel("API Key", { exact: true }).fill("synthetic-key-b");
  await ui.dialog.getByLabel("Base URL", { exact: true }).fill(` ${endpointB} `);
  await expect(ui.dialog.getByText("Valid", { exact: true })).toHaveCount(0);
  await ui.dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(ui.dialog).not.toBeVisible();
  expect(ui.checks).toHaveLength(2);
  expect(ui.checks[1]).toEqual({
    provider: "selfhosted-stt", apiKey: "synthetic-key-b",
    providerSpecificData: { ...ui.checks[0].providerSpecificData, baseUrl: endpointB },
  });
  expect(ui.updates).toHaveLength(1);
  expect(ui.updates[0]).toMatchObject({
    apiKey: "synthetic-key-b", testStatus: "unknown",
    providerSpecificData: ui.checks[1].providerSpecificData,
  });
  expect(ui.errors).toEqual([]);
});

test("a Check completed after closing and reopening cannot mark the reopened draft valid", async ({ page }) => {
  let release, complete;
  const delayed = new Promise(resolve => { release = resolve; });
  const completed = new Promise(resolve => { complete = resolve; });
  const ui = await openCredentialEditor(page, async (route, _payload, number) => {
    if (number === 1) {
      try {
        await delayed;
        await route.fulfill({ json: { valid: true } });
      } catch (error) {
        if (route.request().failure()?.errorText !== "net::ERR_ABORTED") throw error;
      } finally {
        complete();
      }
    } else {
      await route.fulfill({ json: { valid: false } });
    }
  });
  try {
    await ui.dialog.getByLabel("API Key", { exact: true }).fill("synthetic-delayed-key");
    await ui.dialog.getByRole("button", { name: "Check", exact: true }).click();
    await expect.poll(() => ui.checks.length).toBe(1);
    await expect(ui.dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(ui.dialog).not.toBeVisible();
    await ui.edit.click();
    await expect(ui.dialog.getByLabel("API Key", { exact: true })).toHaveValue("");
    // Re-entering the same value recreates the earlier payload; an old result
    // still must not become current after the dialog's cancellation boundary.
    await ui.dialog.getByLabel("API Key", { exact: true }).fill("synthetic-delayed-key");
    release();
    await completed;
    await expect(ui.dialog.getByRole("button", { name: "Check", exact: true })).toBeEnabled();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await expect(ui.dialog.getByText("Valid", { exact: true })).toHaveCount(0);
    await ui.dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(ui.dialog).not.toBeVisible();
    expect(ui.checks).toHaveLength(2);
    expect(ui.updates).toHaveLength(1);
    expect(ui.updates[0]).toMatchObject({ apiKey: "synthetic-delayed-key", testStatus: "unknown" });
    expect(ui.errors).toEqual([]);
  } finally {
    release();
    if (ui.checks.length > 0) await completed;
  }
});


test("Add clears checked status after key and pool edits and saves the freshly checked route", async ({ page }) => {
  const ui = await openCredentialEditor(page, (route, payload) => route.fulfill({ json: {
    valid: payload.apiKey === "synthetic-add-key-a",
  } }), false);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Self-hosted STT API Key", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Name", { exact: true }).fill("Synthetic new media account");
  await dialog.getByLabel("API Key", { exact: true }).fill("synthetic-add-key-a");
  await dialog.getByLabel("Base URL", { exact: true }).fill("http://add-checked.invalid/transcriptions");
  await dialog.getByLabel("Proxy Pool", { exact: true }).selectOption("synthetic-pool");
  await dialog.getByRole("button", { name: "Check", exact: true }).click();
  await expect(dialog.getByText("Valid", { exact: true })).toBeVisible();
  expect(ui.checks).toHaveLength(1);
  expect(ui.checks[0]).toEqual({
    provider: "selfhosted-stt", apiKey: "synthetic-add-key-a", proxyPoolId: "synthetic-pool",
    providerSpecificData: { baseUrl: "http://add-checked.invalid/transcriptions" },
  });

  await dialog.getByLabel("Proxy Pool", { exact: true }).selectOption("__none__");
  await expect(dialog.getByText("Valid", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("API Key", { exact: true }).fill("synthetic-add-key-b");
  await dialog.getByLabel("Base URL", { exact: true }).fill(" http://add-saved.invalid/transcriptions ");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(ui.checks).toHaveLength(2);
  expect(ui.checks[1]).toEqual({
    provider: "selfhosted-stt", apiKey: "synthetic-add-key-b", proxyPoolId: null,
    providerSpecificData: { baseUrl: "http://add-saved.invalid/transcriptions" },
  });
  expect(ui.creates).toHaveLength(1);
  expect(ui.creates[0]).toMatchObject({
    ...ui.checks[1], name: "Synthetic new media account", testStatus: "unknown",
  });
  expect(ui.errors).toEqual([]);
});

test("saving only an endpoint edit with a redacted existing key marks its status unknown", async ({ page }) => {
  const ui = await openCredentialEditor(page, route => route.fulfill({ json: { valid: true } }));
  await expect(ui.dialog.getByLabel("API Key", { exact: true })).toHaveValue("");
  await ui.dialog.getByLabel("Base URL", { exact: true }).fill("http://endpoint-only.invalid/transcriptions");
  await ui.dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(ui.dialog).not.toBeVisible();
  expect(ui.checks).toHaveLength(0);
  expect(ui.updates).toHaveLength(1);
  expect(ui.updates[0]).toMatchObject({
    testStatus: "unknown", providerSpecificData: {
      baseUrl: "http://endpoint-only.invalid/transcriptions", proxyPoolId: "synthetic-pool",
    },
  });
  expect(ui.updates[0]).not.toHaveProperty("apiKey");
  expect(ui.updates[0]).not.toHaveProperty("lastError");
  expect(ui.errors).toEqual([]);
});
