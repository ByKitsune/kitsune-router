import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { UI_TEST_ORIGIN } from "./test-settings.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
export default defineConfig({
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  testMatch: "**/*.spec.mjs",
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 45000,
  expect: { timeout: 10000 },
  outputDir: `${root}/verification/ui-playwright/results`,
  reporter: [["list"], ["html", { outputFolder: `${root}/verification/ui-playwright/report`, open: "never" }]],
  use: {
    baseURL: UI_TEST_ORIGIN,
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ["--disable-dev-shm-usage"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/ui-test-server.mjs",
    cwd: root,
    url: `${UI_TEST_ORIGIN}/api/health`,
    reuseExistingServer: false,
    timeout: 45000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 12000 },
  },
});
