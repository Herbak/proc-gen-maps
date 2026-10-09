import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  plugins: [svelte()],
  server: {
    port: 5173,
    open: false,
    fs: { allow: ['..'] },
  },
  resolve: {
    alias: [
      // Keep the more specific alias first so '@lib/pixi' does not match '@lib'.
      { find: '@lib/pixi', replacement: fileURLToPath(new URL('../src/pixi/index.ts', import.meta.url)) },
      { find: '@lib', replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)) },
    ],
  },
});
