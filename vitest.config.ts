import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'ppu-ocv/canvas': 'ppu-ocv/canvas-web',
    },
  },
  plugins: [
    // Serve onnxruntime-web runtime alongside the paddle models under
    // /paddle_engine/* during tests. The ONNX model + dict files are
    // picked up from public/paddle_engine/ by Vite's default public dir.
    viteStaticCopy({
      targets: [
        {
          src: [
            'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm',
            'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs',
            'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
            'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
          ],
          dest: 'paddle_engine',
        },
      ],
    }),
  ],
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/browser/**/*.test.ts'],
    exclude: ['tests/structured/**'],
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
