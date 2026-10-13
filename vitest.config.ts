import { defaultClientConditions, defaultServerConditions } from 'vite'
import { defineConfig } from 'vitest/config'

const SOURCE_CONDITION = '@pleat/source'

export default defineConfig({
  resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
  ssr: { resolve: { conditions: [SOURCE_CONDITION, ...defaultServerConditions] } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts', 'site/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          maxWorkers: 1,
          include: ['test/browser/**/*.test.ts'],
          environment: 'node',
          testTimeout: 180_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
