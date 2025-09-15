import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['figma-plugin/tests/**/*.test.ts'],
    environment: 'node'
  }
});
