import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Built seperately to avoid import statement
const entry = process.env.VITE_ENTRY || 'background';
const isOffscreenBuild = entry === 'offscreen';

export default defineConfig({
  esbuild: {
    charset: 'ascii',
  },
  plugins: [
    // Copy onnxruntime-web runtime assets next to the paddle ONNX models so
    // PaddleOcrService can fetch them via chrome.runtime.getURL('paddle_engine/').
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
        {
          src: [
            'node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs',
          ],
          dest: 'transformer_engine',
        },
      ],
    }),
  ],
  build: {
    rollupOptions: {
      input: resolve(__dirname, `src/${entry}.ts`),
      output: {
        entryFileNames: `${entry}.js`,
        // Keep background/content as IIFE (no runtime imports), but let offscreen split chunks.
        format: isOffscreenBuild ? 'es' : 'iife',
        chunkFileNames: isOffscreenBuild
          ? 'chunks/[name]-[hash].js'
          : 'assets/[name]-[hash].js',
        manualChunks: isOffscreenBuild
          ? (id) => {
              if (id.includes('@huggingface/transformers')) {
                return 'engine-transformers';
              }
              if (id.includes('onnxruntime-web')) {
                return 'engine-onnxruntime';
              }
              if (id.includes('ppu-paddle-ocr') || id.includes('ppu-ocv')) {
                return 'engine-paddle';
              }
              if (id.includes('node_modules')) {
                return 'vendor';
              }
            }
          : undefined,
        assetFileNames: (assetInfo) => {
          const ext = assetInfo.names[0]
            ? assetInfo.names[0].split('.').pop()
            : '';
          if (ext === 'wasm') {
            return 'transformer_engine/[name][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
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
