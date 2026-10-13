import { fileURLToPath } from 'node:url'
import { build, defaultClientConditions } from 'vite'

/** Bundles a fixture module into a script a page can run, the way an application's client
 *  bundle would load Pleat: from source, with its own copy of every registry. */
export const bundle = async (entry: URL): Promise<string> => {
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { conditions: ['@pleat/source', ...defaultClientConditions] },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(entry),
        formats: ['iife'],
        name: 'PleatFixtureBundle',
      },
    },
  })
  const [result] = Array.isArray(output) ? output : [output]
  if (result === undefined || !('output' in result)) {
    throw new Error(`The fixture ${entry.pathname} did not build.`)
  }
  const [chunk] = result.output
  return chunk.type === 'chunk' ? chunk.code : ''
}
