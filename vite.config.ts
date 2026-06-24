import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy /api to the local Azure Functions host (func start -> :7071).
// In production on Static Web Apps, /api is served from the same origin.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:7071',
        changeOrigin: true,
      },
    },
  },
});
