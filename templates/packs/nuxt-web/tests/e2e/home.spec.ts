import { expect, test } from '@playwright/test'

// Example e2e spec — proves the wiring is real (server boots, page SSRs, DS button reacts).
// One-time per machine: `npx playwright install`. Then: `npm run test:e2e`.
test('home page renders server-side and the DS button responds', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('{{PROJECT_NAME}}')

  const button = page.getByRole('button', { name: /clicked/i })
  await expect(button).toContainText('0')
  await button.click()
  await expect(button).toContainText('1')
})

test('health endpoint answers', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.ok()).toBeTruthy()
  expect((await response.json()).status).toBe('ok')
})
