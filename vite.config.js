import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './', // 相對路徑，方便放到 GitHub Pages 等任何地方
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html') },
    },
  },
});
