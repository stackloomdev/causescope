import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  timeout: 30_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5192",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev:e2e",
    url: "http://127.0.0.1:5192",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
