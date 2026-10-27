import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    setupFiles: ['./test/setup.js'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
