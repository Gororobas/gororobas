import { Option } from 'effect'
import { describe, expect, test, vi } from 'vitest'

import { Color, Sheet, Style, Token, When } from '../src/index.ts'

const declarations = (style: Style.Style) =>
  Style.declarations(style).map(
    ({ condition, property, value }) => `${condition} ${property}: ${value}`,
  )

describe('Style.make', () => {
  test('formats numbers as pixels except for unitless properties', () => {
    const style = Style.make({ padding: 8, opacity: 0.5, lineHeight: 1.4, margin: 0 })
    expect(Style.resolve(style)).toEqual({
      padding: '8px',
      opacity: '0.5',
      lineHeight: '1.4',
      margin: '0',
    })
  })

  test('renders tokens and variables as var() references', () => {
    const tokens = Token.make({ color: { ink: Token.color } })
    const style = Style.make({
      color: tokens.color.ink,
      borderBottom: `1px solid ${tokens.color.ink}`,
    })
    expect(Style.resolve(style)).toEqual({
      color: 'var(--color-ink)',
      borderBottom: '1px solid var(--color-ink)',
    })
  })

  test('a later key wins, including a shorthand written after its longhands', () => {
    expect(Style.resolve(Style.make({ paddingTop: 2, padding: 8 }))).toEqual({
      padding: '8px',
    })
    expect(Style.resolve(Style.make({ padding: 8, paddingTop: 2 }))).toEqual({
      padding: '8px',
      paddingTop: '2px',
    })
  })

  test('skips undefined values', () => {
    expect(Style.make({ color: 'red', backgroundColor: undefined })).toBe(
      Style.make({ color: 'red' }),
    )
  })

  test('rejects values that could escape their declaration', () => {
    expect(() => Style.make({ color: 'red; background: url(x)' })).toThrow(/not a value/)
    expect(() => Style.make({ color: 'red } body { color: blue' })).toThrow(/not a value/)
    expect(() => Style.make({ content: '"</style>"' })).toThrow(/not a value/)
    expect(() => Style.make({ color: 'red !important' })).toThrow(/not a value/)
    expect(() => Style.make({ color: 'rgb(1, 2, 3' })).toThrow(/not a value/)
  })

  test('rejects property names that are not CSS properties', () => {
    expect(() => Style.make({ ['color;x' as 'color']: 'red' })).toThrow(
      /not a CSS property/,
    )
  })
  test('rejects `all`, which resets properties atomic rules cannot order it against', () => {
    expect(() => Style.make({ all: 'initial' })).toThrow(/Style can't hold `all`/)
    expect(() =>
      Style.make({ color: 'red' }).pipe(Style.when(When.hover, { all: 'unset' })),
    ).toThrow(/Style can't hold `all`/)
  })
})

describe('Style.merge', () => {
  test('reads like object spread', () => {
    const base = Style.make({ color: 'black', padding: 8 })
    const override = Style.make({ color: 'white', paddingLeft: 12 })
    expect(Style.resolve(Style.merge(base, override))).toEqual({
      color: 'white',
      padding: '8px',
      paddingLeft: '12px',
    })
  })

  test('a shorthand applied later clears longhands it covers', () => {
    const merged = Style.merge(
      Style.make({ borderTopColor: 'red', borderWidth: 2 }),
      Style.make({ border: '1px solid blue' }),
    )
    expect(Style.resolve(merged)).toEqual({ border: '1px solid blue' })
  })

  test('keeps conditions apart', () => {
    const style = Style.make({ color: 'black' }).pipe(
      Style.when(When.hover, { color: 'blue' }),
      Style.merge(Style.make({ color: 'gray' })),
    )
    expect(declarations(style)).toEqual(['always color: gray', ':hover color: blue'])
  })

  test('warns once when partially overlapping shorthands meet', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    Style.merge(
      Style.make({ borderTop: '1px solid red' }),
      Style.make({ borderColor: 'blue' }),
    )
    Style.merge(
      Style.make({ borderTop: '2px solid red' }),
      Style.make({ borderColor: 'green' }),
    )
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('Style.when', () => {
  test('nests conditions', () => {
    const style = Style.empty.pipe(
      Style.when(
        When.dark,
        Style.make({ color: 'white' }).pipe(Style.when(When.hover, { color: 'cyan' })),
      ),
    )
    expect(declarations(style)).toEqual([
      '@media (prefers-color-scheme: dark) color: white',
      '@media (prefers-color-scheme: dark) & :hover color: cyan',
    ])
  })
})

describe('Style.resolve', () => {
  const button = Style.make({ color: 'black', backgroundColor: 'white' }).pipe(
    Style.when(When.hover, { backgroundColor: 'silver' }),
    Style.when(When.disabled, { backgroundColor: 'gainsboro', color: 'gray' }),
    Style.when(When.all(When.dark, When.hover), { backgroundColor: 'dimgray' }),
  )
  const activeAtoms = (...conditions: ReadonlyArray<When.Condition>) => {
    const keys = new Set(
      conditions.flatMap(condition => condition.atoms.map(atom => atom.key)),
    )
    return (atom: When.Atom) => keys.has(atom.key)
  }

  test('applies the strongest active condition per property', () => {
    expect(Style.resolve(button)).toEqual({ color: 'black', backgroundColor: 'white' })
    expect(Style.resolve(button, activeAtoms(When.hover))).toEqual({
      color: 'black',
      backgroundColor: 'silver',
    })
    expect(Style.resolve(button, activeAtoms(When.hover, When.disabled))).toEqual({
      color: 'gray',
      backgroundColor: 'gainsboro',
    })
    expect(Style.resolve(button, activeAtoms(When.hover, When.dark))).toEqual({
      color: 'black',
      backgroundColor: 'dimgray',
    })
  })
})

describe('Style transforms', () => {
  test('evolve maps values where the style is defined', () => {
    const darkenText = Style.evolve({
      color: (color: string) => Color.darken(color, 0.1),
    })
    const style = darkenText(
      Style.make({ color: 'oklch(70% 0.1 200)' }).pipe(
        Style.when(When.hover, { color: 'teal' }),
      ),
    )
    expect(declarations(style)).toEqual([
      'always color: oklch(from oklch(70% 0.1 200) calc(l - 0.1) c h)',
      ':hover color: oklch(from teal calc(l - 0.1) c h)',
    ])
  })

  test('get reads a declaration under a condition', () => {
    const style = Style.make({ backgroundColor: 'navy' }).pipe(
      Style.when(When.hover, { backgroundColor: 'blue' }),
    )
    expect(Style.get(style, 'backgroundColor')).toEqual(Option.some('navy'))
    expect(Style.get(style, 'backgroundColor', When.hover)).toEqual(Option.some('blue'))
    expect(Style.get(style, 'color')).toEqual(Option.none())
  })
})

describe('markers', () => {
  test('relational conditions point at marked ancestors', () => {
    const card = When.marker('card')
    const title = Style.make({ color: 'black' }).pipe(
      Style.when(When.within(card, When.hover), { color: 'blue' }),
    )
    const rules = title.atoms.map(atom => atom.rule)
    expect(rules).toContain(
      `.${title.atoms.find(atom => atom.condition.key !== '')?.className}:where(.pm-card:where(:hover) *){color:blue}`,
    )
    expect(Style.mark(card).className).toBe('pm-card')
  })
})

describe('class names are a stable contract', () => {
  test('they do not change between releases without a reason', () => {
    expect(Style.make({ color: 'red' }).className).toMatchInlineSnapshot(`"pn0a7n80f"`)
    expect(
      Style.empty.pipe(Style.when(When.hover, { color: 'red' })).className,
    ).toMatchInlineSnapshot(`"pqu69y5ub"`)
  })

  test('rules equalize specificity so precedence comes from order alone', () => {
    const style = Style.empty.pipe(
      Style.when(When.all(When.dark, When.disabled), { color: 'gray' }),
    )
    const [atom] = style.atoms
    expect(atom?.rule).toBe(
      `@media (prefers-color-scheme: dark){.${atom?.className}:where(:disabled, [data-disabled], [aria-disabled="true"]){color:gray}}`,
    )
    expect(Sheet.atoms()).toContain(atom)
  })
})
