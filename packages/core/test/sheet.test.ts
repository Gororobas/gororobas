import { describe, expect, test } from 'vitest'

import { Global, Sheet, Style, Theme, Token, When } from '../src/index.ts'

describe('Sheet.render', () => {
  const base = Style.make({ color: 'rgb(10, 20, 30)', paddingTop: 3, padding: 5 })
  const states = Style.empty.pipe(
    Style.when(When.disabled, { color: 'rgb(40, 50, 60)' }),
    Style.when(When.hover, { color: 'rgb(70, 80, 90)' }),
    Style.when(When.minWidth('64rem'), { color: 'rgb(1, 2, 3)' }),
    Style.when(When.minWidth('40rem'), { color: 'rgb(4, 5, 6)' }),
  )
  const both = Style.merge(base, states)

  test('declares the layer order first: Tailwind’s base, then Pleat, then utilities', () => {
    expect(Sheet.render().split('\n').slice(0, 2)).toEqual([
      '@layer theme, base, components, pleat, utilities;',
      '@layer pleat.globals, pleat.themes, pleat.atoms;',
    ])
  })

  test('emits atoms in precedence order', () => {
    const css = Sheet.render({ classNames: both.className.split(' ') })
    const order = [
      'padding:5px',
      'color:rgb(10, 20, 30)',
      'min-width: 40rem',
      'min-width: 64rem',
      ':hover',
      ':disabled',
    ].map(fragment => css.indexOf(fragment))
    expect(order.every(index => index >= 0)).toBe(true)
    expect([...order].sort((left, right) => left - right)).toEqual(order)
  })

  test('renderFor keeps only the atoms a page uses', () => {
    const unused = Style.make({ color: 'rgb(123, 123, 123)' })
    const html = `<main class="${base.className}"><p class='x'>hi</p></main>`
    const css = Sheet.renderFor(html)
    expect(css).toContain('padding:5px')
    expect(css).not.toContain(unused.className)
    expect(Sheet.classNamesIn(html)).toEqual(new Set([...base.className.split(' '), 'x']))
  })

  test('nothing that could close the style element gets into the sheet', () => {
    expect(() => Global.rule('.prose a[href^="</"]', { color: 'blue' })).toThrow()
    expect(() => Style.make({ content: '"</style>"' })).toThrow()
    expect(() => Style.make({ fontFamily: 'a</style><script>' })).toThrow()
    const tag = Sheet.styleTag()
    expect(tag.startsWith('<style data-pleat>')).toBe(true)
    expect(tag.slice(0, -'</style>'.length)).not.toContain('</')
  })
})

describe('Global', () => {
  test('themes, rules, font faces, and keyframes land in their layers', () => {
    const tokens = Token.make({ surface: Token.color })
    Global.theme(Theme.make(tokens, { surface: 'white' }))
    Global.theme(Theme.make(tokens, { surface: 'black' }), {
      selector: ':root:not([data-theme])',
      when: When.dark,
    })
    Global.rule('body', { margin: 0, backgroundColor: tokens.surface })
    const spin = Global.keyframes('spin', { to: { rotate: '1turn' } })
    const css = Sheet.render()
    expect(css).toContain('@layer pleat.themes{:root{--surface:white}')
    expect(css).toContain(
      '@media (prefers-color-scheme: dark){:root:not([data-theme]){--surface:black}}',
    )
    expect(css).toContain('body{margin:0;background-color:var(--surface)}')
    expect(spin).toMatch(/^spin-[0-9a-z]{8}$/)
    expect(css).toContain(`@keyframes ${spin}{to{rotate:1turn}}`)
  })

  test('themes at one selector and condition merge, and the later value wins', () => {
    const primitives = Token.make(
      { ink: Token.color, paper: Token.color },
      { prefix: 'p-' },
    )
    const semantics = Token.make({ ink: Token.color }, { prefix: 's-' })
    const selector = '[data-merge-test]'
    Global.theme(Theme.make(primitives, { ink: 'red', paper: 'white' }), { selector })
    Global.theme(Theme.make(semantics, { ink: 'blue' }), { selector })
    Global.theme(Theme.make(primitives, { ink: 'maroon', paper: 'white' }), { selector })
    Global.theme(Theme.make(semantics, { ink: 'navy' }), { selector, when: When.dark })
    const css = Sheet.render()
    expect(css).toContain(`${selector}{--p-ink:maroon;--p-paper:white;--s-ink:blue}`)
    expect(css).toContain(
      `@media (prefers-color-scheme: dark){${selector}{--s-ink:navy}}`,
    )
    expect(css.split(`${selector}{`)).toHaveLength(3)
  })

  test('a rejected theme leaves its scope unchanged', () => {
    const tokens = Token.make({ ink: Token.color }, { prefix: 'rejected-' })
    const selector = '[data-rejected-test]'
    Global.theme(Theme.make(tokens, { ink: 'red' }), { selector })
    expect(() =>
      Global.theme(Theme.make(tokens, { ink: 'blue' }), { selector, when: When.hover }),
    ).toThrow(/environment conditions only/)
    Global.theme(Theme.make(Token.make({ other: Token.color }), { other: 'green' }), {
      selector,
    })
    expect(Sheet.render()).toContain(`${selector}{--rejected-ink:red;--other:green}`)
  })

  test('global rules refuse element conditions', () => {
    expect(() => Global.rule('a', { color: 'red' }, { when: When.hover })).toThrow(
      /environment conditions only/,
    )
  })
})

describe('When', () => {
  test('orders conditions by their strongest atom, then by extension', () => {
    const sorted = [
      When.disabled,
      When.all(When.dark, When.hover),
      When.hover,
      When.dark,
      When.always,
      When.focusVisible,
      When.open,
      When.within(When.data('theme', 'night')),
    ].sort(When.compare)
    expect(sorted).toEqual([
      When.always,
      When.dark,
      When.within(When.data('theme', 'night')),
      When.open,
      When.hover,
      When.all(When.dark, When.hover),
      When.focusVisible,
      When.disabled,
    ])
  })

  // NOTE: these selectors are what @foldkit/ui 0.167 sets on its parts. They are also
  // condition keys, so changing one changes every class name that uses it.
  test('selects the attributes @foldkit/ui sets', () => {
    expect(When.label(When.open)).toBe('[data-open], [aria-expanded="true"]')
    expect(When.label(When.selected)).toBe('[data-selected], [aria-selected="true"]')
    expect(When.label(When.checked)).toBe(
      ':checked, [data-checked], [aria-checked="true"]',
    )
    expect(When.label(When.indeterminate)).toBe(
      ':indeterminate, [data-indeterminate], [aria-checked="mixed"]',
    )
    expect(When.label(When.highlighted)).toBe('[data-active]')
    expect(When.label(When.disabled)).toBe(
      ':disabled, [data-disabled], [aria-disabled="true"]',
    )
    expect(When.label(When.invalid)).toBe('[data-invalid], [aria-invalid="true"]')
    expect(When.label(When.readonly)).toBe('[data-readonly], [aria-readonly="true"]')
    expect(When.label(When.closed)).toBe('[data-closed]')
    expect(When.label(When.entering)).toBe('[data-enter]')
    expect(When.label(When.leaving)).toBe('[data-leave]')
    expect(When.label(When.transitioning)).toBe('[data-transition]')
  })

  test('ranks a mixed checkbox with checked, below interaction and disabled', () => {
    expect(When.compare(When.indeterminate, When.open)).toBeGreaterThan(0)
    expect(When.compare(When.indeterminate, When.hover)).toBeLessThan(0)
    expect(When.compare(When.indeterminate, When.disabled)).toBeLessThan(0)
  })

  test('rejects selectors and queries that could escape a rule', () => {
    expect(() => When.data('open"]{}')).toThrow()
    expect(() => When.media('(min-width: 1px) { body { color: red }')).toThrow()
    expect(() => When.pseudo(':hover{')).toThrow()
  })
})
