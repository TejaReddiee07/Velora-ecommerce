import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end acceptance tests. They run against a live stack:
 *   API on :4000 (with Stripe TEST keys) and the storefront on :3000.
 * Start both with `npm run dev` (or `npm start` after a build) from the repo root.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
