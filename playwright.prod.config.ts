import { defineConfig } from '@playwright/test';
export default defineConfig({
  outputDir: 'test-results/production',
  testDir: './tests/production',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4175',
    url: 'http://127.0.0.1:4175',
    timeout: 120000,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
});
