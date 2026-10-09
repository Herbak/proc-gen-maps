import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const entry = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  build: {
    sourcemap: true,
    lib: {
      formats: ['es'],
      entry: {
        index: entry('./src/index.ts'),
        'pixi/index': entry('./src/pixi/index.ts'),
      },
    },
    rollupOptions: {
      external: ['pixi.js'],
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
});
