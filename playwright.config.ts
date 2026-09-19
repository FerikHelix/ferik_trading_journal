import { defineConfig, devices } from '@playwright/test';

// Overridable so the suite still runs when another project already holds 4321.
// Default is unchanged, so CI and existing workflows behave exactly as before.
const PORT = Number(process.env.PREVIEW_PORT ?? 4321);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: BASE_URL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...(process.env.CI ? {} : { channel: 'chrome' as const }) } }],
  webServer: {
    command: `node node_modules/astro/bin/astro.mjs preview --host 127.0.0.1 --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
});
