import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { type Browser, chromium } from 'playwright-core'

const playwrightHeadlessShells = (): ReadonlyArray<string> => {
  const root = join(homedir(), '.cache', 'ms-playwright')
  if (!existsSync(root)) {
    return []
  }
  return readdirSync(root)
    .filter(entry => entry.startsWith('chromium_headless_shell-'))
    .sort()
    .reverse()
    .map(entry =>
      join(root, entry, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
    )
}

/** The Chromium to test against: `CHROMIUM_PATH`, Playwright's own download, or a system
 *  install. Throws with setup instructions when none exists. */
export const chromiumPath = (): string => {
  const candidates = [
    process.env['CHROMIUM_PATH'],
    chromium.executablePath(),
    ...playwrightHeadlessShells(),
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ]
  for (const candidate of candidates) {
    if (candidate !== undefined && existsSync(candidate)) {
      return candidate
    }
  }
  throw new Error('No Chromium found. Run `pnpm chromium:install` or set CHROMIUM_PATH.')
}

export const launch = (): Promise<Browser> =>
  chromium.launch({ executablePath: chromiumPath(), headless: true })
