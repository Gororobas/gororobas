import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright-core'
import { build, defaultClientConditions } from 'vite'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { tokens } from '../../site/src/design.ts'
import { launch } from './chromium.ts'

// The claim under test: the attributes @foldkit/ui sets as a user works a
// component by keyboard are the ones Pleat's When conditions select, so the
// state styles in its recipes apply in a real browser.

let browser: Browser
let fixtureScript = ''

beforeAll(async () => {
  browser = await launch()
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { conditions: ['@pleat/source', ...defaultClientConditions] },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL('./foldkitUi.fixture.ts', import.meta.url)),
        formats: ['iife'],
        name: 'PleatFoldkitUiFixture',
      },
    },
  })
  const [result] = Array.isArray(output) ? output : [output]
  if (result === undefined || !('output' in result)) {
    throw new Error('The Foldkit UI fixture did not build.')
  }
  const [chunk] = result.output
  fixtureScript = chunk.type === 'chunk' ? chunk.code : ''
})

afterAll(async () => {
  await browser?.close()
})

/** What a token resolves to as a background color on this page. */
const tokenColor = (page: Page, token: unknown): Promise<string> =>
  page.evaluate(value => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = value
    document.body.append(probe)
    const resolved = getComputedStyle(probe).backgroundColor
    probe.remove()
    return resolved
  }, String(token))

const itemBackgrounds = (page: Page) =>
  page.$$eval('[role="menuitem"]', items =>
    items.map(item => ({
      label: item.textContent ?? '',
      isActive: item.hasAttribute('data-active'),
      background: getComputedStyle(item).backgroundColor,
    })),
  )

describe('a @foldkit/ui Menu styled with Pleat', () => {
  test('applies open, highlighted, and transition styles as the keyboard drives it', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setContent(
      '<!doctype html><html><body><div id="root"></div></body></html>',
    )
    await page.addScriptTag({ content: fixtureScript })
    await page.waitForSelector('#actions-button')

    const sunken = await tokenColor(page, tokens.color.sunken)
    const line = await tokenColor(page, tokens.color.line)
    const accent = await tokenColor(page, tokens.color.accent)
    const borderOf = (selector: string) =>
      page.$eval(selector, element => getComputedStyle(element).borderTopColor)

    // Closed: the trigger has its resting border and no panel exists.
    await expect.poll(() => borderOf('#actions-button')).toBe(line)
    expect(await page.$('#actions-items')).toBeNull()

    // Enter opens the Menu on the first item. data-open and aria-expanded
    // select When.open, which turns the trigger's border to the accent.
    await page.focus('#actions-button')
    await page.keyboard.press('Enter')
    await page.waitForSelector('#actions-items')
    expect(await page.getAttribute('#actions-button', 'aria-expanded')).toBe('true')
    await expect.poll(() => borderOf('#actions-button')).toBe(accent)

    // The panel enters from When.closed and settles at its open look.
    await page.waitForFunction(
      () => {
        const panel = document.getElementById('actions-items')
        return (
          panel !== null &&
          !panel.hasAttribute('data-transition') &&
          getComputedStyle(panel).opacity === '1'
        )
      },
      undefined,
      { timeout: 5000 },
    )

    // data-active selects When.highlighted: only that item gets the background.
    expect(await itemBackgrounds(page)).toEqual([
      { label: 'Rename', isActive: true, background: sunken },
      { label: 'Archive', isActive: false, background: 'rgba(0, 0, 0, 0)' },
    ])

    // ArrowDown moves the highlight, and the style follows the attribute.
    await page.keyboard.press('ArrowDown')
    await page.waitForSelector('[role="menuitem"][data-active]:has-text("Archive")')
    expect(await itemBackgrounds(page)).toEqual([
      { label: 'Rename', isActive: false, background: 'rgba(0, 0, 0, 0)' },
      { label: 'Archive', isActive: true, background: sunken },
    ])

    // Escape closes it: the panel leaves through When.closed, and the trigger
    // returns to its resting border.
    await page.keyboard.press('Escape')
    await page.waitForSelector('#actions-items', { state: 'detached', timeout: 5000 })
    expect(await page.getAttribute('#actions-button', 'aria-expanded')).toBe('false')
    await expect.poll(() => borderOf('#actions-button')).toBe(line)

    await page.close()
  })
})
