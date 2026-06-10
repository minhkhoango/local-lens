import { defineConfig, mergeConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import base from './vitest.config';

// The structured engine bundles a ~130 MB PP-DocLayoutV3 ONNX model plus the
// PP-OCRv5 detector + recognizer, so it gets its own config with longer
// timeouts and WebGPU-friendly Chromium flags. WebGPU is optional — the
// engine falls back to WASM — but the flags let us exercise the WebGPU path
// where the host supports it.

interface MergedTestConfig {
  test: {
    include: string[];
    exclude: string[];
    browser: { instances: { browser: string; name: string }[] };
  };
}

const config = mergeConfig(
  base as never,
  defineConfig({
    test: {
      testTimeout: 180_000,
      hookTimeout: 180_000,
      browser: {
        enabled: true,
        provider: playwright({
          launchOptions: {
            args: [
              '--enable-unsafe-webgpu',
              '--enable-features=Vulkan',
              '--use-vulkan=swiftshader',
              '--use-angle=vulkan',
            ],
          },
        }),
        headless: true,
      },
    },
  }),
) as ReturnType<typeof defineConfig> & MergedTestConfig;

// mergeConfig CONCATENATES arrays, so the base `exclude` (which blocks
// tests/structured/**) and the base browser instance would survive the merge —
// the suite would silently run zero structured tests, each unit test twice.
// Replace the array fields outright instead of merging them.
config.test.include = ['tests/structured/**/*.test.ts'];
config.test.exclude = [];
config.test.browser.instances = [
  { browser: 'chromium', name: 'chromium-structured' },
];

export default config;
