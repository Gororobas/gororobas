import { Effect, Exit, Option, Schema } from 'effect'
import { describe, expect, test } from 'vitest'

import { Recipe, Style, When } from '../src/index.ts'

const solid = Style.make({ backgroundColor: 'navy', color: 'white' })
const outlineify = (style: Style.Style) =>
  Style.make({
    backgroundColor: 'transparent',
    border: '1px solid currentColor',
    color: Option.getOrElse(Style.get(style, 'backgroundColor'), () => 'inherit'),
  })

const button = Recipe.make({
  name: 'Button',
  description: 'A clickable button.',
  base: { display: 'inline-flex', borderRadius: 6 },
  variants: {
    tone: { Primary: solid, Neutral: { backgroundColor: 'silver', color: 'black' } },
    size: { Small: { paddingInline: 8 }, Large: { paddingInline: 16 } },
    isOutline: { true: outlineify(solid), false: {} },
  },
  defaults: { tone: 'Neutral', isOutline: false },
  compounds: [{ when: { tone: 'Primary', size: 'Large' }, style: { fontWeight: 700 } }],
  descriptions: { tone: 'The emphasis of the button.' },
})

describe('Recipe', () => {
  test('applies base, variants, then compounds', () => {
    expect(Style.resolve(button({ size: 'Small' }))).toEqual({
      display: 'inline-flex',
      borderRadius: '6px',
      backgroundColor: 'silver',
      color: 'black',
      paddingInline: '8px',
    })
    expect(Style.resolve(button({ tone: 'Primary', size: 'Large' }))).toMatchObject({
      backgroundColor: 'navy',
      fontWeight: '700',
    })
  })

  test('boolean dimensions take booleans, and variants can derive from other styles statically', () => {
    expect(
      Style.resolve(button({ tone: 'Primary', size: 'Small', isOutline: true })),
    ).toMatchObject({ backgroundColor: 'transparent', color: 'navy' })
  })

  test('returns the same Style for the same props', () => {
    expect(button({ size: 'Small' })).toBe(button({ size: 'Small', tone: 'Neutral' }))
  })

  test('rejects options it does not have', () => {
    expect(() =>
      // @ts-expect-error Huge is not a size
      button({ size: 'Huge' }),
    ).toThrow(/Expected one of: Small, Large/)
  })

  test('lists every combination, and equal combinations share one Style', () => {
    const combinations = Recipe.combinations(button)
    expect(combinations).toHaveLength(8)
    expect(new Set(combinations.map(({ style }) => style)).size).toBe(7)
    expect(button({ tone: 'Primary', size: 'Small', isOutline: true })).toBe(
      button({ tone: 'Neutral', size: 'Small', isOutline: true }),
    )
  })

  test('every rule a recipe can produce exists before it is first called', () => {
    const lazy = Recipe.make({
      variants: {
        tone: { Calm: { color: 'rgb(1, 1, 1)' }, Loud: { color: 'rgb(2, 2, 2)' } },
      },
    })
    const loud = Style.make({ color: 'rgb(2, 2, 2)' })
    expect(loud.atoms[0]).toBeDefined()
    expect(lazy({ tone: 'Loud' })).toBe(loud)
  })

  test('works with conditions inside options', () => {
    const link = Recipe.make({
      variants: {
        tone: {
          Quiet: Style.make({ color: 'gray' }).pipe(
            Style.when(When.hover, { color: 'black' }),
          ),
        },
      },
    })
    expect(link({ tone: 'Quiet' }).atoms).toHaveLength(2)
  })
})

describe('one-sided boolean dimensions', () => {
  const busy = Style.make({ opacity: 0.5 })
  const spinner = Recipe.make({
    name: 'Spinner',
    variants: { isBusy: { true: busy } },
    compounds: [{ when: { isBusy: false }, style: { cursor: 'pointer' } }],
  })
  const idle = Recipe.make({
    variants: { isIdle: { false: busy } },
    defaults: { isIdle: false },
  })

  test('take both booleans, and the absent branch is an empty style', () => {
    expect(spinner({ isBusy: true })).toBe(busy)
    expect(spinner({ isBusy: false })).toBe(Style.make({ cursor: 'pointer' }))
    expect(idle({ isIdle: true })).toBe(Style.empty)
    expect(idle({})).toBe(busy)
  })

  test('list both values, decode both values, and default to the absent branch', () => {
    expect(spinner.dimensions.isBusy).toEqual([true, false])
    expect(Recipe.combinations(spinner)).toHaveLength(2)
    const decode = Schema.decodeUnknownSync(spinner.schema)
    expect(spinner(decode({ isBusy: false }))).toBe(Style.make({ cursor: 'pointer' }))
    const quiet = Recipe.make({
      variants: { isBusy: { true: busy } },
      defaults: { isBusy: false },
    })
    expect(quiet({})).toBe(Style.empty)
  })

  test('a dimension with no options is a configuration error', () => {
    expect(() => Recipe.make({ name: 'Broken', variants: { tone: {} } })).toThrow(
      /Recipe Broken: dimension tone has no options/,
    )
  })
})

describe('Recipe.schema', () => {
  test('decodes props, making defaulted dimensions optional', () => {
    const decode = Schema.decodeUnknownExit(button.schema)
    expect(decode({ size: 'Large' })).toEqual(Exit.succeed({ size: 'Large' }))
    expect(Exit.isFailure(decode({ tone: 'Primary' }))).toBe(true)
    expect(Exit.isFailure(decode({ size: 'Large', isOutline: 'yes' }))).toBe(true)
  })

  test('a decoded value renders', async () => {
    const props = await Effect.runPromise(
      Schema.decodeUnknownEffect(button.schema)({ tone: 'Primary', size: 'Large' }),
    )
    expect(button(props)).toBe(button({ tone: 'Primary', size: 'Large' }))
  })

  test('produces a JSON Schema a language model can fill in', () => {
    const document = Recipe.jsonSchema(button)
    expect(document).toMatchInlineSnapshot(`
      {
        "definitions": {
          "Button": {
            "additionalProperties": false,
            "description": "A clickable button.",
            "properties": {
              "isOutline": {
                "type": "boolean",
              },
              "size": {
                "enum": [
                  "Small",
                  "Large",
                ],
                "type": "string",
              },
              "tone": {
                "description": "The emphasis of the button.",
                "enum": [
                  "Primary",
                  "Neutral",
                ],
                "type": "string",
              },
            },
            "required": [
              "size",
            ],
            "title": "Button",
            "type": "object",
          },
        },
        "dialect": "draft-2020-12",
        "schema": {
          "$ref": "#/$defs/Button",
        },
      }
    `)
  })
})
