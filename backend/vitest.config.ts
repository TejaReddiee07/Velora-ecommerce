import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup-env.ts'],
    testTimeout: 60_000,
    hookTimeout: 240_000,
    pool: 'forks',
    fileParallelism: false,
    include: ['tests/**/*.test.ts'],
  },
});
