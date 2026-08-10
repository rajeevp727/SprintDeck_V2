import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so tsc's build-artifact vite.config.js can't shadow it.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'api/**/*.test.mjs'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: [
        'src/lib/analytics.ts',
        'src/lib/estimate.ts',
        'src/lib/auth.ts',
        'api/src/store.js',
        'api/src/linear.js',
        'api/src/payments-store.js',
        'api/src/users-store.js',
      ],
      thresholds: {
        statements: 40,
        branches: 35,
        functions: 40,
        lines: 40,
      },
    },
  },
});
