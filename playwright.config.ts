import { defineConfig, devices } from '@playwright/test';
import { e2eDatabasePath } from './tests/e2e/db-path';

process.env.SESSION_SECRET ??= 'playwright-test-session-secret-change-me';
process.env.TODO_DB_PATH = e2eDatabasePath;

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3100',
    timezoneId: 'Asia/Singapore',
  },
  webServer: {
    command: 'npx next dev --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
    env: {
      SESSION_SECRET: process.env.SESSION_SECRET,
      TODO_DB_PATH: process.env.TODO_DB_PATH,
    },
  },
});
