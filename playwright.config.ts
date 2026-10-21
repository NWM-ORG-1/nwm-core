import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against a production server (`npm run build` first). Set E2E_BASE_URL to
 * test an already-running server instead (e.g. the dev server or a deployment).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    httpCredentials: { username: process.env.E2E_ADMIN_USER ?? "admin", password: process.env.E2E_ADMIN_PASS ?? "nwm-dev" },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /(reader|public|perf)\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npx next start -p 3100",
        url: "http://localhost:3100/api/health",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
