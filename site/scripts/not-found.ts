import { existsSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'

/** Copies Foldkit’s prerendered 404 to the filename Workers Assets serves.
 *  A build hook runs for both the Vite CLI and Alchemy’s programmatic build. */
export const cloudflareNotFound = (): Plugin => ({
  name: 'pleat:cloudflare-not-found',
  buildApp: {
    order: 'post',
    handler: async builder => {
      const client = builder.environments['client']
      if (client === undefined) {
        throw new Error('The Foldkit client build is missing.')
      }
      const directory = resolve(client.config.root, client.config.build.outDir)
      const prerendered = join(directory, '404', 'index.html')
      if (!existsSync(prerendered)) {
        throw new Error('The Foldkit prerendered 404 page is missing.')
      }
      await copyFile(prerendered, join(directory, '404.html'))
    },
  },
})
