import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'
import { fileURLToPath } from 'node:url'

// Foldkit owns the Vite build, including prerendered pages and the Cloudflare 404.
const SITE_ROOT = fileURLToPath(new URL('.', import.meta.url))

/** The docs site, built and deployed through Alchemy’s Foldkit integration. */
export const Docs = Cloudflare.Website.Foldkit('Docs', {
  name: 'pleat-docs',
  domain: 'pleat.manzanita.dev',
  rootDir: SITE_ROOT,
  memo: {
    include: [
      'src/**',
      'scripts/**',
      'public/**',
      'vite.config.ts',
      'tsconfig.json',
      'package.json',
      '../package.json',
      '../pnpm-workspace.yaml',
      '../tsconfig.base.json',
    ],
    lockfile: true,
    workspaces: [
      { cwd: '../packages/core', include: ['src/**', 'package.json'] },
      { cwd: '../packages/foldkit', include: ['src/**', 'package.json'] },
    ],
  },
  assets: {
    notFoundHandling: '404-page',
    htmlHandling: 'auto-trailing-slash',
  },
}).pipe(
  // Keep the legacy worker identity supported by Alchemy’s StaticSite wrapper.
  Alchemy.renamedFrom('Docs/Worker'),
)

export default Alchemy.Stack(
  'Pleat',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const docs = yield* Docs
    return { url: docs.url }
  }),
)
