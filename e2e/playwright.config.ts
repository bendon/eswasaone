/**
 * Playwright e2e scaffold (F0d) — Wave 1 workflows assert against staging Core.
 *
 * Install (once):
 *   cd e2e && npm install && npx playwright install chromium
 *
 * Run against staging:
 *   ESWASAONE_BASE_URL=https://eswasaone.aiceafrica.com npm test
 *
 * DoD per workflow: drive UI → assert Frappe state via Core → assert rule side-effect.
 * Never commit against fixture data (VITE_DEMO_MODE must be false on staging).
 */
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.ESWASAONE_BASE_URL ?? "https://eswasaone.aiceafrica.com";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
