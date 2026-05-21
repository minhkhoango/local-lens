import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    // Serve Tesseract WASM/worker assets under /tesseract_engine/* during tests.
    viteStaticCopy({
      targets: [
        {
          src: [
            'node_modules/tesseract.js-core/tesseract-core.wasm.js',
            'node_modules/tesseract.js-core/tesseract-core-simd.wasm.js',
            'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
            'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
            'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
            'node_modules/tesseract.js/dist/worker.min.js',
          ],
          dest: 'tesseract_engine',
        },
      ],
    }),
  ],
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/browser/**/*.test.ts'],
    exclude: ['tests/granite/**'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
});
