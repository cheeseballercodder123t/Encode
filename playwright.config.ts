import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. AI API routes (/api/encode, /api/youtube, /api/evaluate, ...) are
 * mocked at the network level in e2e/helpers/mocks.ts, so no Gemini keys are
 * needed. Run with: npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4310',
    trace: 'retain-on-failure',
    navigationTimeout: 120_000, // first `next dev` compile of the page is slow
  },
  webServer: {
    command: 'npm run dev -- -p 4310',
    url: 'http://127.0.0.1:4310',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
