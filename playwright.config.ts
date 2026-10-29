import { defineConfig } from '@playwright/test';

// Путь к установленному Chromium можно задать переменной PW_CHROMIUM; по умолчанию используется браузер, который скачивает Playwright.
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { launchOptions: { executablePath }, trace: 'retain-on-failure' },
  projects: [
    { name: 'demo', testIgnore: /UJ-4/, use: { baseURL: 'http://localhost:5174' } },
    { name: 'app', testMatch: /UJ-4/, use: { baseURL: 'http://localhost:5173' } },
  ],
  webServer: [
    { command: 'npm run dev:demo -w web -- --port 5174 --strictPort', url: 'http://localhost:5174', reuseExistingServer: true, timeout: 120_000 },
    { command: 'npm run dev -w web -- --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 120_000 },
  ],
});
