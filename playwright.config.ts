import { defineConfig } from '@playwright/test';

/**
 * Browser journeys against the built site and the real Functions, in the
 * installed Google Chrome (no browser download), with Chrome's fake camera
 * and microphone standing in for the iPad's. Run with `npm run test:e2e`.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  // One server, one shared database: run journeys one at a time.
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    channel: 'chrome',
    baseURL: process.env.E2E_BASE_URL,
    viewport: { width: 1180, height: 820 },
    permissions: ['camera', 'microphone'],
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        // The viewer autoplays a video with sound; let the test watch it play.
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
});
