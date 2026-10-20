import { defineConfig } from 'vite';

// Served from https://ohmysaint.github.io/chua-troi/ in production.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/chua-troi/' : '/',
  build: { chunkSizeWarningLimit: 2000 },
}));
