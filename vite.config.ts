import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Built seperately to avoid import statement
const entry = process.env.VITE_ENTRY || 'background';

export default defineConfig({
  // esbuild: {
  //   drop: ['console'],
  // },
  plugins: [
    // Copy Tesseract core assets into dist/tesseract_engine for runtime loading
    viteStaticCopy({
      targets: [
        {
          src: [
            'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
            'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
            'node_modules/tesseract.js-core/tesseract-core-relaxedsimd.wasm.js',
            'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
            'node_modules/tesseract.js-core/tesseract-core-simd.wasm.js',
            'node_modules/tesseract.js-core/tesseract-core.wasm.js',
            'node_modules/tesseract.js/dist/worker.min.js',
          ],
          dest: 'tesseract_engine',
        },
      ],
    }),
  ],
  build: {
    rollupOptions: {
      input: resolve(__dirname, `src/${entry}.ts`),
      output: {
        entryFileNames: `${entry}.js`,
        format: 'iife',
      },
    },
    outDir: 'dist',
    // Don't empty output dir to build multiple entries sequentially
    emptyOutDir: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
