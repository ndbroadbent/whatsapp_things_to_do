import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/cli.ts',
        'src/cli/**/*.ts',
        'src/index.ts',
        'src/export/index.ts',
        'src/types.ts'
      ],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90
      }
    }
  }
})
