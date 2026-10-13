import fc from 'fast-check'
import type { Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { Sheet, Style } from '@pleat/core'

import { launch } from './chromium.ts'

// The claim under test: merging one-declaration styles in order means what the same
// declarations mean written in that order in an inline style. The browser computes both
// sides, so Style.resolve plays no part.

const PROGRAMS = 300
const SEED = 20_261_008

// NOTE: every property here is supported, so programs leave out `all` (rejected),
// logical properties (mixing them with physical ones is ordered by property priority),
// and shorthands that share only some longhands (borderTop and borderWidth).
const UNIVERSE: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['color', ['rgb(1, 2, 3)', 'rgb(200, 10, 10)']],
  ['opacity', ['0.5', '0.25']],
  ['padding', ['4px', '8px 2px']],
  ['paddingTop', ['12px']],
  ['paddingLeft', ['16px']],
  ['margin', ['1px', '3px 5px']],
  ['marginTop', ['7px']],
  ['inset', ['1px', '2px 3px']],
  ['top', ['4px']],
  ['border', ['2px solid rgb(1, 2, 3)']],
  ['borderTop', ['3px dashed rgb(4, 5, 6)']],
  ['borderTopWidth', ['5px']],
  ['borderTopColor', ['rgb(7, 8, 9)']],
  ['borderLeftStyle', ['dotted']],
  ['borderRadius', ['4px', '2px 6px']],
  ['borderTopLeftRadius', ['9px']],
  ['background', ['rgb(10, 20, 30)', 'no-repeat rgb(5, 5, 5)']],
  ['backgroundColor', ['rgb(40, 50, 60)']],
  ['backgroundRepeat', ['repeat-x']],
  ['font', ['700 20px/30px serif', 'italic 12px monospace']],
  ['fontWeight', ['300']],
  ['fontSize', ['15px']],
  ['lineHeight', ['19px']],
  ['fontFamily', ['sans-serif']],
  ['fontStyle', ['oblique']],
  ['fontVariant', ['small-caps', 'oldstyle-nums']],
  ['fontVariantCaps', ['all-small-caps']],
  ['fontKerning', ['none']],
  ['fontFeatureSettings', ['"liga" 0']],
  ['columns', ['3 10em']],
  ['columnCount', ['2']],
  ['flex', ['2 3 10px', 'none']],
  ['flexGrow', ['5']],
  ['flexBasis', ['20px']],
  ['gap', ['6px', '1px 2px']],
  ['rowGap', ['9px']],
  ['overflow', ['hidden', 'clip auto']],
  ['overflowX', ['scroll']],
  ['textDecoration', ['underline dotted rgb(1, 1, 1)']],
  ['textDecorationColor', ['rgb(2, 2, 2)']],
  ['transition', ['opacity 1s ease 2s']],
  ['transitionDuration', ['3s']],
  ['animation', ['spin 1s linear 2s infinite']],
  ['animationDuration', ['4s']],
  ['animationTimeline', ['none']],
]

const kebab = (property: string): string =>
  property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)

type Program = ReadonlyArray<readonly [property: string, value: string]>

const program: fc.Arbitrary<Program> = fc.array(
  fc
    .constantFrom(...UNIVERSE)
    .chain(([property, values]) =>
      fc.constantFrom(...values).map(value => [property, value] as const),
    ),
  { minLength: 1, maxLength: 6 },
)

const inlineStyle = (declarations: Program): string =>
  declarations.map(([property, value]) => `${kebab(property)}:${value}`).join(';')

const compile = (declarations: Program): Style.Style =>
  Style.mergeAll(
    declarations.map(([property, value]) => Style.make({ [property]: value })),
  )

let browser: Browser

beforeAll(async () => {
  browser = await launch()
})

afterAll(async () => {
  await browser?.close()
})

describe('merging in order means what inline declarations mean in order', () => {
  test('in Chromium, for every supported shorthand and longhand', async () => {
    const programs = fc.sample(program, { numRuns: PROGRAMS, seed: SEED })
    const classNames = programs.map(declarations => compile(declarations).className)
    const body = programs
      .map(
        (declarations, index) =>
          `<div id="pleat${index}" class="${classNames[index]}"></div>` +
          `<div id="inline${index}" style="${inlineStyle(declarations).replaceAll('"', '&quot;')}"></div>`,
      )
      .join('')
    const page = await browser.newPage()
    await page.setContent(
      `<!doctype html><html><head>${Sheet.styleTag()}</head><body>${body}</body></html>`,
    )
    const mismatches = await page.evaluate(
      ({ count, properties }) => {
        const found: Array<string> = []
        for (let index = 0; index < count; index += 1) {
          const pleat = document.getElementById(`pleat${index}`)
          const inline = document.getElementById(`inline${index}`)
          if (pleat === null || inline === null) {
            found.push(`${index}: missing element`)
            continue
          }
          const fromPleat = getComputedStyle(pleat)
          const fromInline = getComputedStyle(inline)
          for (const property of properties) {
            const expected = fromInline.getPropertyValue(property)
            const actual = fromPleat.getPropertyValue(property)
            if (actual !== expected) {
              found.push(`${index} ${property}: Pleat ${actual}, inline ${expected}`)
            }
          }
        }
        return found
      },
      { count: programs.length, properties: probedProperties() },
    )
    await page.close()
    const explained = mismatches.slice(0, 5).map(mismatch => {
      const index = Number(mismatch.split(/[ :]/)[0])
      return `${mismatch}\n  program: ${inlineStyle(programs[index] ?? [])}`
    })
    expect(explained).toEqual([])
  })
})

// NOTE: the computed longhands of every property in the universe, so a shorthand that
// resets a longhand the table doesn't know about shows up as a mismatch.
const probedProperties = (): ReadonlyArray<string> => [
  ...new Set(
    UNIVERSE.flatMap(([property]) => [kebab(property)]).concat([
      'padding-top',
      'padding-right',
      'padding-bottom',
      'padding-left',
      'margin-top',
      'margin-right',
      'margin-bottom',
      'margin-left',
      'top',
      'right',
      'bottom',
      'left',
      'border-top-width',
      'border-top-style',
      'border-top-color',
      'border-left-width',
      'border-left-style',
      'border-left-color',
      'border-top-left-radius',
      'border-top-right-radius',
      'background-color',
      'background-repeat',
      'background-image',
      'font-style',
      'font-weight',
      'font-size',
      'line-height',
      'font-family',
      'font-variant-caps',
      'font-variant-numeric',
      'column-width',
      'column-count',
      'font-stretch',
      'font-kerning',
      'font-feature-settings',
      'flex-grow',
      'flex-shrink',
      'flex-basis',
      'row-gap',
      'column-gap',
      'overflow-x',
      'overflow-y',
      'text-decoration-line',
      'text-decoration-style',
      'text-decoration-color',
      'transition-property',
      'transition-duration',
      'transition-timing-function',
      'transition-delay',
      'animation-name',
      'animation-duration',
      'animation-timing-function',
      'animation-delay',
      'animation-iteration-count',
      'animation-timeline',
    ]),
  ),
]
