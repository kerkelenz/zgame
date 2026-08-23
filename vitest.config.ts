import { defineConfig } from 'vitest/config';

/**
 * Vitest only ever looks at `src/engine`. That is not an arbitrary restriction:
 * the engine is pure TypeScript with no React Native imports (enforced by the
 * `no-restricted-imports` rule in eslint.config.js), so it runs in a plain Node
 * environment with no transform pipeline, no jsdom, and no native mocks.
 *
 * UI tests, if we ever add them, would need a completely different setup and
 * belong in their own config so they cannot slow this one down.
 */
export default defineConfig({
  test: {
    include: ['src/engine/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
