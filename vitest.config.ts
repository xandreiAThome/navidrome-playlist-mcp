import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts', 'src/mcp/**'],
      reporter: ['text', 'html'],
    },
    projects: [
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          testTimeout: 10000,
        },
      },
      { test: { name: 'e2e', include: ['tests/e2e/**/*.test.ts'], testTimeout: 30000 } },
    ],
  },
});
