import { Effect } from 'effect'
import { Server } from 'foldkit/experimental'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { describe, expect, test } from 'vitest'

import { Recipe, Sheet, Style, Theme, Token, Var, When } from '@pleat/core'

import { className, css, cssClass } from '../src/index.ts'
import { renderDocument } from '../src/server.ts'

const card = Style.make({ display: 'grid', gap: 12, padding: 16 }).pipe(
  Style.when(When.hover, { backgroundColor: 'rgb(240, 240, 240)' }),
)
const selectedRing = Style.make({ outline: '2px solid rgb(29, 78, 216)' })
const unusedOnThisPage = Style.make({ color: 'rgb(1, 1, 1)', letterSpacing: '0.3em' })
const progress = Var.number('progress')
const bar = Style.make({ width: `calc(${progress} * 1%)` })

const button = Recipe.make({
  name: 'Button',
  variants: { tone: { Primary: { color: 'white' }, Neutral: { color: 'black' } } },
  defaults: { tone: 'Neutral' },
})

type Model = Readonly<{ isSelected: boolean; percent: number }>

const view = (model: Model, h: HtmlBuilder<never>): Document => ({
  title: 'Pleat',
  body: h.main(
    [...css(card, model.isSelected ? selectedRing : Style.empty)],
    [
      h.div([...css(bar, Var.bind(progress, model.percent))]),
      h.button([h.Type('button'), ...css(button({ tone: 'Primary' }))], ['Save']),
      h.p([...css(className('prose'), card)], ['Mixed with a class Pleat does not own.']),
    ],
  ),
})

const render = (model: Model) =>
  Effect.runPromise(
    Server.renderToString({ init: () => ({ model }), view }, { isHydratable: false }),
  )

describe('css', () => {
  test('puts one class attribute with merged atoms on each element', async () => {
    const { html } = await render({ isSelected: true, percent: 42 })
    const merged = Style.merge(card, selectedRing)
    expect(html).toContain(`<main class="${merged.className}"`)
    expect(html).toContain(`class="${button({ tone: 'Primary' }).className}"`)
    expect(html).toContain(`class="${card.className} prose"`)
  })

  test('binds variables in one inline style', async () => {
    const { html } = await render({ isSelected: false, percent: 42 })
    expect(html).toContain(`class="${bar.className}" style="--progress: 42"`)
  })

  test('applies a theme to one element in the same inline style as other bindings', async () => {
    const brand = Token.make(
      { accent: Token.color, onAccent: Token.color },
      { prefix: 'b-' },
    )
    const theme = Theme.make(brand, { accent: '#ff6600', onAccent: brand.accent })
    const { html } = await Effect.runPromise(
      Server.renderToString(
        {
          init: () => ({ model: {} }),
          view: (_model: object, h: HtmlBuilder<never>): Document => ({
            title: 'Pleat',
            body: h.div(
              [...css(bar, Var.bind(progress, 42), ...Theme.bindings(theme))],
              [],
            ),
          }),
        },
        { isHydratable: false },
      ),
    )
    expect(html).toContain(
      `class="${bar.className}" style="--progress: 42; --b-accent: #ff6600; --b-on-accent: var(--b-accent)"`,
    )
  })

  test('returns the same attributes for the same style without allocating', () => {
    expect(css(card)).toBe(css(card))
    expect(css(Style.merge(card, selectedRing))).toBe(css(card, selectedRing))
    expect(css(Style.empty)).toEqual([])
  })

  test('passes through any HTML class token, such as Tailwind arbitrary values and variants', () => {
    const tokens = [
      'w-[calc(100%-1rem)]',
      'data-[state=open]:block',
      'bg-[var(--x)]',
      'text-red-500!',
      "content-['hi']",
      '[&>*]:p-2',
      '@md:flex',
      'group-hover/item:underline',
    ]
    expect(className(tokens.join(' ')).value).toBe(tokens.join(' '))
    expect(className(' a\tb\n c\f\r ').value).toBe('a b c')
  })

  test('rejects whitespace and control characters inside a class token', () => {
    for (const token of [
      'a\u0000b',
      'a\u0007b',
      'a\u007fb',
      'a\u0085b',
      'a\u00a0b',
      'a\u2028b',
    ]) {
      expect(() => className(token)).toThrow(/whitespace or a control character/)
    }
  })

  test('leaves escaping to Foldkit, so a token cannot break out of the attribute', async () => {
    const html = await Effect.runPromise(
      Server.renderToString(
        {
          init: () => ({ model: {} }),
          view: (_model: object, h: HtmlBuilder<never>): Document => ({
            title: 'Pleat',
            body: h.p([...css(className('ok "><script>alert(1)</script>'))], []),
          }),
        },
        { isHydratable: false },
      ),
    )
    expect(html.html).toContain('class="ok &quot;>&lt;script>alert(1)&lt;/script>"')
    expect(html.html).not.toContain('<script>')
  })
})

describe('cssClass', () => {
  test('returns the same classes css would put on the element', () => {
    expect(cssClass(card)).toBe(card.className)
    expect(cssClass(card, selectedRing)).toBe(Style.merge(card, selectedRing).className)
    expect(cssClass(className('prose'), card)).toBe(`${card.className} prose`)
    expect(cssClass(className('prose'))).toBe('prose')
    expect(cssClass(Style.empty)).toBe('')
  })
})

describe('renderDocument', () => {
  const assets = { entryScript: '/entry.js', stylesheets: [], modulePreloads: [] }

  test('puts the page’s critical CSS in the head', async () => {
    const application = await render({ isSelected: true, percent: 10 })
    const document = renderDocument()(application, assets)
    const head = document.slice(0, document.indexOf('</head>'))
    expect(head).toContain('<style data-pleat>')
    expect(head).toContain('@layer pleat.globals, pleat.themes, pleat.atoms;')
    for (const atomClass of card.className.split(' ')) {
      expect(head).toContain(`.${atomClass}`)
    }
    for (const atomClass of unusedOnThisPage.className.split(' ')) {
      expect(head).not.toContain(`.${atomClass}`)
    }
  })

  test('puts Pleat’s style ahead of the app’s stylesheets, so its layer order comes first', async () => {
    const application = await render({ isSelected: false, percent: 10 })
    const document = renderDocument({ head: '<link rel="stylesheet" href="/head.css">' })(
      application,
      { ...assets, stylesheets: ['/tailwind.css'] },
    )
    const style = document.indexOf('<style data-pleat>')
    expect(style).toBeGreaterThan(0)
    expect(style).toBeLessThan(document.indexOf('href="/head.css"'))
    expect(style).toBeLessThan(document.indexOf('href="/tailwind.css"'))
    expect(document).toContain(
      '<style data-pleat>@layer theme, base, components, pleat, utilities;',
    )
  })

  test('can ship the whole sheet instead', async () => {
    const application = await render({ isSelected: false, percent: 10 })
    const document = renderDocument({ isCritical: false, head: '<meta name="x">' })(
      application,
      assets,
    )
    expect(document).toContain('</style><meta name="x">')
    expect(document).toContain(Sheet.render())
  })
})
