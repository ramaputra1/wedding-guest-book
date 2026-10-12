import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    // One local server for the whole run, started with throwaway secrets.
    globalSetup: ['tests/setup/global.ts'],
    // Files share that server; run them one after another for readable failures.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
