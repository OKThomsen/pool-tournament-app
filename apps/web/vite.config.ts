import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Use the shared rules' source directly, so the web build never picks up a stale core build.
    alias: {
      '@franks/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
    },
  },
  server: {
    // The API runs separately in development (npm run dev -w @franks/server).
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
