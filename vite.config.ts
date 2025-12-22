import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  server: {
    port: 5173,
    hmr: {
      overlay: false, // Prevents HMR errors from blocking the UI
    },

    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
});
