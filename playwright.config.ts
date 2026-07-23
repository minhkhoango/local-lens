import { defineConfig } from '@playwright/test';

/**
 * Playwright runner config for the Local Lens REAL end-to-end suite.
 *
 * The suite loads the actual built extension (dist/) into a real, HEADED
 * persistent browser context and drives the true capture → drag → OCR → island
 * flow. MV3 extensions do not load under classic headless, so the browser is
 * launched with `headless: false` inside tests/e2e/helpers/extension.ts (which
 * also wires the WebGPU flags, browser channel/executable selection for
 * Chrome/Brave, and the host-permission-patched extension copy).
 *
 * Because a single real browser + (optional) GPU is shared, tests run serially.
 * Timeouts are generous: models load on the first OCR and the structured engine
 * is WASM-bound.
 *
 * Run:
 *   npm run test:e2e                     # bundled Chromium, headed
 *   E2E_CHANNEL=chrome npm run test:e2e  # installed Google Chrome
 *   E2E_EXECUTABLE_PATH=/path/to/brave npm run test:e2e   # Brave
 *   E2E_HEADLESS=new npm run test:e2e    # displayless (CI); WebGPU usually off
 *   xvfb-run -a npm run test:e2e         # Linux without a real display
 */
const FIXTURE_PORT = Number(process.env.E2E_FIXTURE_PORT ?? 5232);
const BASE_URL = `http://127.0.0.1:${FIXTURE_PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/e2e/global-setup.ts',

  // One real browser instance, one GPU — never parallelize.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,

  // First-OCR model load + (slow) structured WASM inference need headroom.
  timeout: 240_000,
  expect: { timeout: 20_000 },

  reporter: [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'off',
    // We manage the browser lifecycle manually via launchPersistentContext, so
    // the default `page` fixture is unused; these are here for completeness.
    actionTimeout: 30_000,
  },

  // Serve the fixture pages over real HTTP so the extension treats them like a
  // normal website (content-script injection, captureVisibleTab, URL classing).
  webServer: {
    command: 'node tests/e2e/fixtures/serve.mjs',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
