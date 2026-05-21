import { defineConfig, mergeConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import base from './vitest.config';

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['tests/granite/**/*.test.ts'],
      exclude: [],
      testTimeout: 120_000,
      hookTimeout: 120_000,
      browser: {
        enabled: true,
        provider: playwright(),
        headless: true,
        instances: [
          {
            browser: 'chromium',
            launch: {
              args: [
                '--enable-unsafe-webgpu',
                '--enable-features=Vulkan',
                '--use-vulkan=swiftshader',
                '--use-angle=vulkan',
              ],
            },
          },
        ],
      },
    },
  }),
);
