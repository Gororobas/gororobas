import { describe, expect, test } from 'vitest'

import { type Declarations, Global, Sheet, Style } from '../src/index.ts'
import { isSafeValue } from '../src/property.ts'

const FONT = 'data:font/woff2;base64,d09GMgABAAAAAAKMAA0AAAAABZQAAAI5AAEAAAAAAAAAAAAA'
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg=='
const SVG =
  'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E'

describe('isSafeValue', () => {
  test('accepts unquoted data URLs, which hold a `;` inside url()', () => {
    for (const value of [
      `url(${FONT}) format("woff2")`,
      `url(${PNG})`,
      `url(${SVG}) no-repeat center / 1rem`,
      `url( ${PNG} )`,
      `URL(${PNG})`,
      `url(${PNG}), linear-gradient(red, blue)`,
      `image-set(url(${PNG}) 1x, url(${PNG}) 2x)`,
      `var(--icon, url(${SVG}))`,
      `"a" url(${PNG})`,
    ]) {
      expect(isSafeValue(value), value).toBe(true)
    }
  })

  test('still accepts quoted URLs, strings, and bracketed line names', () => {
    for (const value of [
      `url("${FONT}")`,
      `url( '${PNG}' )`,
      '"a;b{c}!"',
      '[full-start] minmax(1rem, 1fr) [full-end]',
    ]) {
      expect(isSafeValue(value), value).toBe(true)
    }
  })

  test('rejects a `;` where CSS does not read an unquoted url-token', () => {
    for (const value of [
      'red; color: blue',
      '1url(a;b)',
      '#url(a;b)',
      '@url(a;b)',
      '-url(a;b)',
      'myurl(a;b)',
      'url("a";b)',
      'calc(1px;2px)',
    ]) {
      expect(isSafeValue(value), value).toBe(false)
    }
  })

  test('rejects unquoted url() contents that CSS reads as a bad URL', () => {
    for (const value of [
      "url(a');}body{color:red}')",
      'url(a"b;c")',
      'url(a(b;c))',
      'url(a b;c)',
      'url(a\\;b)',
      'url(a\u0001;b)',
      'url(a\u007f;b)',
      'url(a;b',
    ]) {
      expect(isSafeValue(value), JSON.stringify(value)).toBe(false)
    }
  })

  test('rejects breakout characters inside unquoted url() too', () => {
    for (const value of [
      'url(</style>)',
      'url(a{b)',
      'url(a}b)',
      'url(a!b)',
      'url(a/*b)',
    ]) {
      expect(isSafeValue(value), value).toBe(false)
    }
  })

  test('rejects every newline in a string, which CSS reads as the end of the string', () => {
    for (const value of [
      '"a\n}body{color:red}"',
      '"a\r}body{color:red}"',
      '"a\f}body{color:red}"',
      '"a\\\n"',
      '"a\\\r"',
    ]) {
      expect(isSafeValue(value), JSON.stringify(value)).toBe(false)
    }
  })

  test('rejects `<` everywhere, escaped or not', () => {
    for (const value of ['"\\</style>"', '"</style>"', 'a</style>']) {
      expect(isSafeValue(value), value).toBe(false)
    }
  })

  test('rejects unbalanced or crossed brackets, which CSS reads past `;` and `}`', () => {
    for (const value of ['a[', '[a', 'a]', '[(])', '([)]', 'rgb(1, 2, 3']) {
      expect(isSafeValue(value), value).toBe(false)
    }
  })
})

describe('data URLs end to end', () => {
  test('Global.fontFace takes a base64 font', () => {
    // NOTE: fontFace takes style Declarations, which have no `src`; the site casts the same way.
    Global.fontFace({
      fontFamily: 'Inline',
      src: `url(${FONT}) format("woff2")`,
    } as Declarations)
    expect(Sheet.render()).toContain(
      `@font-face{font-family:Inline;src:url(${FONT}) format("woff2")}`,
    )
  })

  test('a style takes an inlined image', () => {
    const style = Style.make({ backgroundImage: `url(${PNG})` })
    expect(Sheet.render({ classNames: style.className.split(' ') })).toContain(
      `background-image:url(${PNG})`,
    )
  })
})
