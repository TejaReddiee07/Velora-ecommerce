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
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /devices\.spec\.ts/ },
    // One project per browser engine / device class for the cross-browser smoke tests (docs/BROWSERS.md): npm run test:devices
    { name: 'edge', use: { ...devices['Desktop Edge'] }, testMatch: /devices\.spec\.ts/ },
    { name: 'safari-mac', use: { ...devices['Desktop Safari'] }, testMatch: /devices\.spec\.ts/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: /devices\.spec\.ts/ },
    { name: 'iphone', use: { ...devices['iPhone 13'] }, testMatch: /devices\.spec\.ts/ },
    { name: 'iphone-small', use: { ...devices['iPhone SE'] }, testMatch: /devices\.spec\.ts/ },
    { name: 'ipad', use: { ...devices['iPad (gen 7)'] }, testMatch: /devices\.spec\.ts/ },
    { name: 'ipad-landscape', use: { ...devices['iPad Pro 11 landscape'] }, testMatch: /devices\.spec\.ts/ },
    { name: 'android', use: { ...devices['Pixel 7'] }, testMatch: /devices\.spec\.ts/ },
    { name: 'android-small', use: { ...devices['Galaxy S9+'] }, testMatch: /devices\.spec\.ts/ },
    { name: 'android-tablet', use: { ...devices['Galaxy Tab S4'] }, testMatch: /devices\.spec\.ts/ },
  ],
});
