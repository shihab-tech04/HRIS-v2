import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'hris-dev-entry',
        configureServer(server) {
          server.middlewares.use((request, _response, next) => {
            if (request.url === '/' || request.url?.startsWith('/?')) {
              request.url = `/app.html${request.url.slice(1)}`;
            }
            next();
          });
        },
      },
    ],
    base: process.env.GITHUB_PAGES === 'true' || process.env.NODE_ENV === 'production'
      ? '/HRIS-v2/'
      : '/',
    build: {
      rollupOptions: {
        input: fileURLToPath(new URL('./app.html', import.meta.url)),
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('.', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
