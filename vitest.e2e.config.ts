import { defineConfig } from 'vitest/config';

// browser smoke tests: slow, need a built client and a browser; run with `npm run e2e`
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.test.ts'],
    testTimeout: 90_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
