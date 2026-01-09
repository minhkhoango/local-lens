import { defineConfig } from 'vite';
import { resolve } from 'path';

// Built seperately to avoid import statement
const entry = process.env.VITE_ENTRY || 'background';

export default defineConfig({
  // esbuild: {
  //   drop: ['console'],
  // },
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
