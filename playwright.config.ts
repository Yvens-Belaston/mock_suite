import { defineConfig, devices } from '@playwright/test';

// Screen smoke tests: build the web app, start the mock server, drive /ui/* in Chromium.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 8181);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'tests/ui',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build:web && npx tsx src/server.ts',
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(port), RESPONSE_DELAY_MS: '0', BONITA_ENABLED: 'false' },
  },
});
