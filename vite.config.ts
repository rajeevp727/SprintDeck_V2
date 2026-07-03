import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// V2 (Enterprise) dev runs on its own ports so it can run alongside V1:
// web :5273, Azure Functions host :7072 (V1 uses :5173 / :7071).
// In production on Static Web Apps, /api is served from the same origin.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: {
    port: 5273,
    proxy: {
      '/api': {
        target: 'http://localhost:7072',
        changeOrigin: true,
      },
    },
  },
});
