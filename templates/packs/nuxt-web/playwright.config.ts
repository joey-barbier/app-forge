import { defineConfig, devices } from '@playwright/test'

// E2E suite — real dependency, real config, runs from a clean checkout
// (one-time per machine: `npx playwright install`). Specs live in tests/e2e ONLY;
// vitest owns app/** and tests/unit/**. Reports are gitignored — a committed
// report is a claim, a green run is proof (ANTI_PATTERNS.md #10).
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
