import { defaultClientConditions, defaultServerConditions, defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'

import { cloudflareNotFound } from './scripts/not-found.ts'

const SOURCE_CONDITION = '@pleat/source'

export default defineConfig({
  plugins: [
    foldkit({
      ssr: {
        serverEntry: '/src/entry.server.ts',
        clientEntry: '/src/entry.ts',
        build: { prerender: {} },
      },
    }),
    cloudflareNotFound(),
  ],
  resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
  ssr: { resolve: { conditions: [SOURCE_CONDITION, ...defaultServerConditions] } },
})
