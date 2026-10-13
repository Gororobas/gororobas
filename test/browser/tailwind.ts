import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { compile } from 'tailwindcss'

const root = join(dirname(createRequire(import.meta.url).resolve('tailwindcss')), '..')

const loadStylesheet = async (id: string, base: string) => {
  const path =
    id === 'tailwindcss'
      ? join(root, 'index.css')
      : id.startsWith('tailwindcss/')
        ? join(root, id.slice('tailwindcss/'.length))
        : join(base, id)
  return { path, base: dirname(path), content: await readFile(path, 'utf8') }
}

/** The stylesheet the pinned Tailwind v4 build generates for `candidates`, with its theme,
 *  preflight, and utilities layers, the same as `@import "tailwindcss"` in an app. */
export const tailwindCss = async (candidates: ReadonlyArray<string>): Promise<string> => {
  const compiler = await compile('@import "tailwindcss";', { base: root, loadStylesheet })
  return compiler.build([...candidates])
}
