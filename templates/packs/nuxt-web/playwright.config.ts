import { defineConfig, devices } from '@playwright/test'

// E2E suite — real dependency, real config, runs from a clean checkout
// (one-time per machine: `npx playwright install`). Specs live in tests/e2e ONLY;
// vitest owns app/** and tests/unit/**. Reports are gitignored — a committed
// report is a claim, a green run is proof (ANTI_PATTERNS.md #10).

// One source of truth for the e2e origin, so `use.baseURL` and `webServer.url` can never
// drift apart. Override with PLAYWRIGHT_BASE_URL to point at a deployed preview.
//
// ⚠️ Port-collision trap: locally `reuseExistingServer` is true, so if ANYTHING is already
// listening on this port (a stale `nuxt dev`, another app, a previous crashed run) Playwright
// silently tests THAT process instead of a fresh build — a false green or false red that has
// nothing to do with your code. Port 3000 is heavily contended; this skeleton uses a less
// common 4173. If a run looks wrong, kill stragglers first: `lsof -ti:4173 | xargs kill`,
// or set PLAYWRIGHT_BASE_URL to a clean port. In CI, reuseExistingServer is false (always fresh).
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4173)
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
