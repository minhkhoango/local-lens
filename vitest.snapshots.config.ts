import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: {
    include: ['tests/ui-snapshots/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      ui: false,
      viewport: { width: 1280, height: 800 },
      instances: [{ browser: 'chromium', name: 'snapshots' }],
    },
  },
});
