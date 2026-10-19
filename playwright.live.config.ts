import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  outputDir: 'test-results/live',
  testDir: './tests/live',
  workers: 1,
  timeout: 150000,
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'live-desktop',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
          args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
        },
      },
    },
    {
      name: 'live-iphone',
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
          args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
});
