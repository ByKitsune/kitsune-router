import { test, expect } from "@playwright/test";
import { UI_TEST_PASSWORD } from "./test-settings.mjs";

// Exercise the real graph with synthetic connection/activity responses. No
// provider account or inference request is created by this visualization test.
async function openRoutingMap(page) {
  const login = await page.request.post("/api/auth/login", { data: { password: UI_TEST_PASSWORD } });
  expect(login.status()).toBe(200);
  const providerIds = ["bykitsune", "openai", "anthropic", "gemini", "groq", "openrouter", "codex", "antigravity", "nvidia", "xai", "kimi", "deepseek", "mistral", "qwen", "cerebras", "ollama"];
  await page.route("**/api/providers", route => route.fulfill({ json: {
    connections: providerIds.map(provider => ({ id: `fixture-${provider}`, provider, isActive: true })),
  } }));
  await page.route("**/api/usage/stream", route => route.fulfill({
    contentType: "text/event-stream",
    body: `data: ${JSON.stringify({
      activeRequests: [{ provider: "openai", model: "synthetic-model" }],
      recentRequests: [{ id: "synthetic-recent", provider: "anthropic", model: "synthetic-model", timestamp: "2026-10-31T00:00:00Z", promptTokens: 1, completionTokens: 1 }],
      errorProvider: "gemini", pending: { byModel: {}, byAccount: {} },
    })}\n\n`,
  }));
  await page.goto("/dashboard/usage");
  const map = page.getByRole("region", { name: "Routing map", exact: true });
  await map.scrollIntoViewIfNeeded();
  await expect(map.locator('.react-flow__node[data-id="provider-openai"] .topology-provider')).toHaveAttribute("data-state", "active");
  return map;
}

test("routing map animates connected flow, distinguishes activity and pauses outside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const map = await openRoutingMap(page);
  await expect(map).toHaveAttribute("data-motion", "running");
  await expect(map.locator('.react-flow__node[data-id="provider-gemini"] .topology-provider')).toHaveAttribute("data-state", "error");
  await expect(map.locator('.react-flow__node[data-id="provider-anthropic"] .topology-provider')).toHaveAttribute("data-state", "recent");
  await expect(map.locator('.react-flow__node[data-id="provider-bykitsune"] .topology-provider')).toHaveAttribute("data-state", "connected");
  await expect(map.locator(".topology-hub-count")).toHaveText("1");
  const flow = map.locator('.topology-connection[data-state="active"] .topology-connection-flow');
  await expect(flow).toBeVisible();
  expect(await flow.evaluate(element => {
    const viewport = element.ownerSVGElement.getBoundingClientRect();
    return viewport.width > 0 && viewport.height > 0 && element.getTotalLength() > 0 && !element.getAttribute("d").includes("NaN");
  })).toBe(true);
  const firstOffset = await flow.evaluate(element => getComputedStyle(element).strokeDashoffset);
  await expect.poll(() => flow.evaluate(element => getComputedStyle(element).strokeDashoffset)).not.toBe(firstOffset);
  await page.locator("#dashboard-content").evaluate(element => element.scrollTo(0, 0));
  await expect(map).toHaveAttribute("data-motion", "paused");
  await expect(flow).toHaveCSS("animation-play-state", "paused");
  await map.scrollIntoViewIfNeeded();
  await expect(map).toHaveAttribute("data-motion", "running");
  await expect(flow).toHaveCSS("animation-play-state", "running");
  const before = await map.locator(".react-flow__viewport").getAttribute("style");
  await map.getByRole("button", { name: "Zoom In", exact: true }).click();
  await expect.poll(() => map.locator(".react-flow__viewport").getAttribute("style")).not.toBe(before);
  expect(errors).toEqual([]);
});

test("routing map retains readable status and controls without motion on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("theme", JSON.stringify({ state: { theme: "dark" }, version: 0 })));
  const map = await openRoutingMap(page);
  await expect(map).toHaveAttribute("data-layout", "fan");
  await expect(map).toHaveAttribute("data-motion", "paused");
  await expect(map.locator('.react-flow__node[data-id="provider-openai"] .topology-provider')).toHaveCSS("animation-name", "none");
  await expect(map.locator(".topology-hub-orbit").first()).toHaveCSS("animation-name", "none");
  await expect(map.locator(".topology-connection-flow").first()).toHaveCSS("display", "none");
  await expect(map.getByText("Connected", { exact: true })).toBeVisible();
  await expect(map.getByText("Active", { exact: true })).toBeVisible();
  await expect(map.getByRole("button", { name: "Fit View", exact: true })).toBeVisible();
  await expect.poll(() => map.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return [...element.querySelectorAll(".topology-provider")].every(node => {
      const rect = node.getBoundingClientRect();
      const label = node.querySelector(".truncate");
      const renderedFontSize = parseFloat(getComputedStyle(label).fontSize) * rect.width / node.offsetWidth;
      return rect.left >= bounds.left && rect.right <= bounds.right && rect.top >= bounds.top && rect.bottom <= bounds.bottom && renderedFontSize >= 10;
    });
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
