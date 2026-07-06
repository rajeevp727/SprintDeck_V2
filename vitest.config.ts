import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so tsc's build-artifact vite.config.js can't shadow it.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'api/**/*.test.mjs'],
  },
});
