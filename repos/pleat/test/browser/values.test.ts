import fc from 'fast-check'
import type { Browser, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { type Declarations, Global, Sheet, Style } from '@pleat/core'

import { isSafeValue } from '../../packages/core/src/property.ts'
import { launch } from './chromium.ts'

// The claim under test: any value isSafeValue accepts stays one declaration. Written into a
// `<style>` element, it leaves the element whole and the sheet with one rule; written into a
// rule or a `style` attribute, it ends exactly where Pleat ends it.

const CANDIDATES = 150_000
const SEED = 20_261_008

// NOTE: fragments, not characters, so that accepted values reach the tokenizer's corners:
// unquoted url() with a `;` inside, escapes, newlines in strings, and names that only look
// like `url`.
const FRAGMENTS = [
  'url(',
  'URL(',
  'uRl(',
  'url( ',
  'url("',
  "url('",
  '-url(',
  '1url(',
  '#url(',
  '@url(',
  'var(--a, ',
  'image-set(',
  'data:font/woff2;base64,d09GMgABAAAAAA==',
  'data:image/svg+xml;charset=utf-8,%3Csvg%3E',
  ';',
  ';base64,',
  '(',
  ')',
  '[',
  ']',
  '"',
  "'",
  '\\',
  '\\\\',
  '\\a ',
  '<',
  '</style>',
  '/',
  '*',
  '/*',
  '*/',
  '{',
  '}',
  '!',
  ' ',
  '\t',
  '\n',
  '\r',
  '\f',
  '\r\n',
  '\u0000',
  '\u0008',
  '\u000b',
  '\u007f',
  'é',
  'a',
  'x',
  '-',
  '#',
  '@',
  ',',
  ':',
  '=',
  '%',
  '+',
  '.',
  '1',
] as const

const fragments = (maxLength: number) =>
  fc
    .array(fc.constantFrom(...FRAGMENTS), { minLength: 0, maxLength })
    .map(parts => parts.join(''))

// NOTE: a second shape keeps `url(` ... `)` around the noise often enough that many accepted
// values put a `;` inside an unquoted url().
const candidate = fc.oneof(
  fragments(10),
  fc
    .tuple(
      fragments(3),
      fc.constantFrom('url(', 'URL(', ' url(', ',url(', '(url(', '-url(', '1url('),
      fragments(4),
      fc.constantFrom(';', ';base64,', 'data:a;b'),
      fragments(4),
      fc.constantFrom(')', ' )', '))'),
      fragments(3),
    )
    .map(parts => parts.join('')),
)

/** Accepted values, deduplicated, plus a few written by hand. */
const acceptedValues = (): ReadonlyArray<string> => [
  ...new Set(
    [
      'url(data:font/woff2;base64,d09GMgABAAAAAA==)',
      'url( data:image/png;base64,iVBORw0KGgo= )',
      'url(data:image/svg+xml;charset=utf-8,%3Csvg%3E) center / cover',
      'image-set(url(a;b) 1x, url(c;d) 2x)',
      '"a;b" url(c;d) "e"',
      '[full-start] minmax(1rem, 1fr) [full-end]',
      ...fc.sample(candidate, { numRuns: CANDIDATES, seed: SEED }),
    ].filter(isSafeValue),
  ),
]

type Failure = Readonly<{ value: string; reason: string }>

/** Runs in the page. Writes each value three ways and reports every way it escaped. */
const probe = (values: ReadonlyArray<string>): ReadonlyArray<Failure> => {
  const failures: Array<Failure> = []
  const parser = new DOMParser()
  const element = document.createElement('div')
  for (const value of values) {
    const body = `--x:${value};--sentinel:1`
    const css = `.x{${body}}`
    const fail = (reason: string) => failures.push({ value, reason })

    const html = parser.parseFromString(
      `<!doctype html><html><head><style>${css}</style></head><body></body></html>`,
      'text/html',
    )
    const styles = html.querySelectorAll('style')
    // NOTE: HTML's input stream turns CR and CRLF into LF and NUL into U+FFFD.
    const text = css.replace(/\r\n?/g, '\n').replace(/\0/g, '\uFFFD')
    if (
      styles.length !== 1 ||
      styles[0]?.textContent !== text ||
      html.head.childNodes.length !== 1 ||
      html.body.childNodes.length !== 0
    ) {
      fail(
        `the document changed around its <style> element: ${styles.length} styles, ` +
          `${html.head.childNodes.length} nodes in the head, ${html.body.childNodes.length} ` +
          `in the body, text ${JSON.stringify(styles[0]?.textContent)}`,
      )
    }

    const sheet = new CSSStyleSheet()
    sheet.replaceSync(css)
    const rule = sheet.cssRules[0]
    if (sheet.cssRules.length !== 1 || !(rule instanceof CSSStyleRule)) {
      fail(`the sheet has ${sheet.cssRules.length} rules`)
    } else if (
      rule.selectorText !== '.x' ||
      rule.style.length !== 2 ||
      rule.style.getPropertyValue('--sentinel').trim() !== '1'
    ) {
      fail(`the rule has ${rule.style.length} declarations: ${rule.style.cssText}`)
    }

    element.setAttribute('style', body)
    if (
      element.style.length !== 2 ||
      element.style.getPropertyValue('--sentinel').trim() !== '1'
    ) {
      fail(`the style attribute has ${element.style.length} declarations`)
    }
  }
  return failures
}

let browser: Browser
let page: Page

beforeAll(async () => {
  browser = await launch()
  page = await browser.newPage()
  await page.setContent('<!doctype html><html><head></head><body></body></html>')
})

afterAll(async () => {
  await browser?.close()
})

describe('isSafeValue keeps a value inside its declaration in Chromium', () => {
  test('every accepted value is exactly one declaration', async () => {
    const values = acceptedValues()
    const withUrlSemicolon = values.filter(value => /url\([^"')]*;/i.test(value))
    const failures = await page.evaluate(probe, values)
    expect(failures.slice(0, 10)).toEqual([])
    // NOTE: guards the generator. If these fall, the test stops reaching the cases it is for.
    expect(values.length).toBeGreaterThan(2_000)
    expect(withUrlSemicolon.length).toBeGreaterThan(500)
  })

  test('data URLs reach Chromium through Pleat’s own sheet', async () => {
    const font = 'url(data:font/woff2;base64,d09GMgABAAAAAA==) format("woff2")'
    const image = 'url(data:image/svg+xml;charset=utf-8,%3Csvg%3E)'
    Global.fontFace({ fontFamily: 'Inline', src: font } as Declarations)
    const style = Style.make({ backgroundImage: image })
    const css = Sheet.render({ classNames: style.className.split(' ') })
    const parsed = await page.evaluate(text => {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(text)
      const rules = [...sheet.cssRules].flatMap(rule =>
        rule instanceof CSSLayerBlockRule ? [...rule.cssRules] : [rule],
      )
      return {
        fontSrc: rules
          .filter(rule => rule instanceof CSSFontFaceRule)
          .map(rule => rule.style.getPropertyValue('src')),
        backgroundImage: rules
          .filter(rule => rule instanceof CSSStyleRule)
          .map(rule => rule.style.getPropertyValue('background-image'))
          .filter(value => value !== ''),
      }
    }, css)
    expect(parsed.fontSrc).toEqual([
      'url("data:font/woff2;base64,d09GMgABAAAAAA==") format("woff2")',
    ])
    expect(parsed.backgroundImage).toEqual([
      'url("data:image/svg+xml;charset=utf-8,%3Csvg%3E")',
    ])
  })
})
