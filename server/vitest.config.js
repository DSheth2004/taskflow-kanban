import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // First run downloads a mongod binary for mongodb-memory-server.
    hookTimeout: 120_000,
    testTimeout: 20_000,
    fileParallelism: false,
  },
});
