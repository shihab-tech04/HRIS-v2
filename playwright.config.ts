import { defineConfig, devices } from '@playwright/test';

const hrisTestPort = Number(process.env.HRIS_TEST_PORT || 4173);

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${hrisTestPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${hrisTestPort} --strictPort`,
    url: `http://127.0.0.1:${hrisTestPort}/`,
    reuseExistingServer: !process.env.CI && !process.env.HRIS_TEST_PORT,
    timeout: 90000,
  },
});
