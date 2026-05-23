import { defineConfig, mergeConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import base from './vitest.config';

// The structured engine bundles a ~130 MB PP-DocLayoutV3 ONNX model plus the
// PP-OCRv5 detector + recognizer, so it gets its own config with longer
// timeouts and WebGPU-friendly Chromium flags. WebGPU is optional — the
// engine falls back to WASM — but the flags let us exercise the WebGPU path
// where the host supports it.

export default mergeConfig(
  base as never,
  defineConfig({
    test: {
      include: ['tests/structured/**/*.test.ts'],
      exclude: [],
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
        instances: [{ browser: 'chromium', name: 'chromium-structured' }],
      },
    },
  }),
);
