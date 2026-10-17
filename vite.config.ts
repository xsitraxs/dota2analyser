import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * В dev-режиме запросы к внешним API идут через прокси Vite:
 * это снимает CORS и позволяет спокойно пользоваться Valve API из браузера.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/steam': {
        target: 'https://api.steampowered.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/steam/, ''),
      },
      '/opendota': {
        target: 'https://api.opendota.com/api',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/opendota/, ''),
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
});
