import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/firefox",
  outputDir: "./test-results/firefox",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  timeout: 30_000,
  use: {
    ...devices["Desktop Firefox"],
    baseURL: "http://127.0.0.1:5190",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev:e2e",
    env: {
      CAUSESCOPE_E2E: "1",
    },
    url: "http://127.0.0.1:5190",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
