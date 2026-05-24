import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { playwright } from '@vitest/browser-playwright';

// Standalone (does NOT extend vitest.config.ts) because mergeConfig
// concatenates the browser `instances` array and trips Vitest's
// duplicate-project-name check.
//
// Benchmark config: paddle int8 vs fp32 recognition, WebGPU vs WASM.
// First inference triggers kernel compilation in onnxruntime-web; bench files
// do a warm-up call per (engine, image) pair before the bench() block. The
// 600s timeout accommodates the structured engine's per-region OCR loop.

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'ppu-ocv/canvas': 'ppu-ocv/canvas-web',
    },
  },
  plugins: [
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
    include: ['tests/bench/**/*.test.ts', 'tests/bench/**/*.bench.ts'],
    exclude: ['tests/unit/**', 'tests/browser/**', 'tests/structured/**'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    benchmark: {
      include: ['tests/bench/**/*.bench.ts'],
      includeSamples: true,
    },
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
      instances: [{ browser: 'chromium', name: 'chromium-bench' }],
    },
  },
});
