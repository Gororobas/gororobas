import { Cause, Effect, Equal, Exit, Option, Schema } from 'effect'
import { describe, expect, test } from 'vitest'

import { Theme, Token, Var } from '../src/index.ts'

const tokens = Token.make({
  color: { canvas: Token.color, ink: Token.color, onAccent: Token.color },
  space: { 1: Token.length, 2: Token.length },
  font: { body: Token.fontFamily, weight: Token.number },
})

const light = Theme.make(tokens, {
  color: { canvas: '#ffffff', ink: 'oklch(20% 0.02 260)', onAccent: 'white' },
  space: { 1: '0.25rem', 2: '0.5rem' },
  font: { body: '"Inter", system-ui, sans-serif', weight: 450 },
})

describe('Token', () => {
  test('names custom properties after their path', () => {
    expect(tokens.color.onAccent.name).toBe('--color-on-accent')
    expect(String(tokens.space[2])).toBe('var(--space-2)')
    expect(Token.make({ ink: Token.color }, { prefix: 'brand-' }).ink.name).toBe(
      '--brand-ink',
    )
    expect(Token.leaves(tokens)).toHaveLength(7)
  })

  test('rejects two paths that name the same custom property', () => {
    expect(() => Token.make({ fooBar: Token.color, foo: { bar: Token.length } })).toThrow(
      'Token paths fooBar and foo.bar both name --foo-bar',
    )
  })
})

describe('Theme.merge', () => {
  const palette = Token.make({ blue: { 500: Token.color }, space: { 2: Token.length } })
  const semantic = Token.make({ accent: Token.color, inkSoft: Token.color })
  const base = Theme.make(palette, { blue: { 500: '#1d4ed8' }, space: { 2: '0.5rem' } })
  const roles = Theme.make(semantic, { accent: palette.blue[500], inkSoft: 'gray' })

  test('composes themes for independent token sets', () => {
    expect(Theme.css(Theme.merge(base, roles))).toBe(
      ':root{--blue-500:#1d4ed8;--space-2:0.5rem;--accent:var(--blue-500);--ink-soft:gray}',
    )
    expect(Theme.merge(base, Theme.empty)).toEqual(base)
    expect(Theme.merge(base, base)).toEqual(base)
  })

  test('rejects two token trees that name the same custom property', () => {
    const spacing = Token.make({ space: { 2: Token.length } })
    const other = Theme.make(spacing, { space: { 2: '0.5rem' } })
    expect(() => Theme.merge(base, other)).toThrow(
      'Two token trees both name --space-2 (space.2 and space.2)',
    )
    const inkBar = Token.make({ ink: { soft: Token.color } })
    expect(() =>
      Theme.merge(roles, Theme.make(inkBar, { ink: { soft: 'black' } })),
    ).toThrow('Two token trees both name --ink-soft (inkSoft and ink.soft)')
    expect(() => Theme.extend(base, spacing, { space: { 2: '1rem' } })).toThrow(
      'Two token trees both name --space-2',
    )
  })

  test('rejects two values for one token, which is what extend is for', () => {
    const wide = Theme.extend(base, palette, { space: { 2: '1rem' } })
    expect(() => Theme.merge(base, wide)).toThrow(
      'Both themes set --space-2 (0.5rem and 1rem)',
    )
  })
})

describe('Theme', () => {
  test('renders custom properties at a selector', () => {
    expect(Theme.css(light)).toBe(
      ':root{--color-canvas:#ffffff;--color-ink:oklch(20% 0.02 260);--color-on-accent:white;' +
        '--space-1:0.25rem;--space-2:0.5rem;--font-body:"Inter", system-ui, sans-serif;--font-weight:450}',
    )
  })

  test('extends a theme and aliases tokens', () => {
    const night = Theme.extend(light, tokens, {
      color: { canvas: '#0b0d12', onAccent: tokens.color.canvas },
    })
    expect(Theme.css(night, '[data-theme="night"]')).toContain(
      '--color-canvas:#0b0d12;--color-ink:oklch(20% 0.02 260);--color-on-accent:var(--color-canvas)',
    )
  })

  test('rejects values that do not match their kind', () => {
    expect(() =>
      Theme.make(tokens, {
        color: { canvas: 'red;}body{display:none', ink: 'black', onAccent: 'white' },
        space: { 1: '4px', 2: '8px' },
        font: { body: 'serif', weight: 400 },
      }),
    ).toThrow(/color.canvas is not a valid Color/)
  })

  test('decodes generated values and reports what was wrong', async () => {
    const generated = {
      color: { canvas: '#fafafa', ink: '#111', onAccent: 'url(javascript:alert(1))' },
      space: { 1: '4px', 2: 'eight pixels' },
      font: { body: 'Georgia, serif', weight: 400 },
    }
    const exit = await Effect.runPromiseExit(Theme.decode(tokens, generated))
    expect(Exit.isFailure(exit)).toBe(true)
    const valid = await Effect.runPromise(
      Theme.decode(tokens, {
        ...generated,
        color: { ...generated.color, onAccent: 'white' },
        space: { 1: '4px', 2: '8px' },
      }),
    )
    expect(Theme.css(valid)).toContain('--space-2:8px')
  })

  test('names every wrong value and its kind when decoding fails', async () => {
    const exit = await Effect.runPromiseExit(
      Theme.decode(tokens, {
        color: { canvas: '#fafafa', ink: 'teal; } body {', onAccent: 'white' },
        space: { 1: '4px', 2: 'eight pixels' },
        font: { body: 'Georgia, serif', weight: 400 },
      }),
    )
    if (!Exit.isFailure(exit)) {
      throw new Error('expected the decode to fail')
    }
    const message = String(Cause.squash(exit.cause))
    expect(message).toContain('Expected a CSS color, such as #1d4ed8')
    expect(message).toContain('at ["color"]["ink"]')
    expect(message).toContain('Expected a CSS value without ;')
    expect(message).toContain('Expected a CSS length, such as 0.75rem or 12px')
    expect(message).toContain('at ["space"]["2"]')
    expect(message).not.toContain('RegExp')
  })

  test('describes values with JSON Schema patterns', () => {
    const decode = Theme.schema(tokens)
    expect(decode.ast._tag).toBe('Objects')
  })
})

describe('Theme.decodePartial', () => {
  test('overrides the tokens the input names and keeps the rest of the base', async () => {
    const night = Theme.extend(light, tokens, {
      color: { onAccent: tokens.color.canvas },
    })
    const branded = await Effect.runPromise(
      Theme.decodePartial(night, tokens, { color: { canvas: '#ff6600' }, space: {} }),
    )
    expect(branded.declarations).toEqual(
      night.declarations.map(([name, value]) =>
        name === '--color-canvas' ? [name, '#ff6600'] : [name, value],
      ),
    )
    expect(Theme.resolve(branded, tokens.color.onAccent)).toEqual(Option.some('#ff6600'))
    const unchanged = await Effect.runPromise(Theme.decodePartial(night, tokens, {}))
    expect(unchanged.declarations).toEqual(night.declarations)
  })

  test('names every wrong value and its kind', async () => {
    const exit = await Effect.runPromiseExit(
      Theme.decodePartial(light, tokens, {
        color: { ink: 'tealish' },
        space: { 2: 'eight pixels' },
        font: { weight: '400' },
      }),
    )
    if (!Exit.isFailure(exit)) {
      throw new Error('expected the decode to fail')
    }
    const message = String(Cause.squash(exit.cause))
    expect(message).toContain('at ["color"]["ink"]')
    expect(message).toContain('Expected a CSS length, such as 0.75rem or 12px')
    expect(message).toContain('at ["space"]["2"]')
    expect(message).toContain('at ["font"]["weight"]')
    for (const input of [null, 'red', { color: 'red' }, { color: { ink: undefined } }]) {
      const result = await Effect.runPromiseExit(
        Theme.decodePartial(light, tokens, input),
      )
      expect(Exit.isFailure(result)).toBe(true)
    }
  })

  test('has a schema with every key optional', () => {
    const decode = Schema.decodeUnknownSync(Theme.partialSchema(tokens))
    expect(decode({ color: { ink: '#111' } })).toEqual({ color: { ink: '#111' } })
    expect(decode({})).toEqual({})
    expect(() => decode({ color: { ink: 4 } })).toThrow()
  })
})

describe('Theme.patch', () => {
  const system = Token.make({
    brand: { 500: Token.color, 600: Token.color },
    accent: Token.color,
    button: Token.color,
    ink: Token.color,
    gap: Token.length,
  })
  const base = Theme.make(system, {
    brand: { 500: '#3b82f6', 600: '#2563eb' },
    accent: system.brand[600],
    button: system.accent,
    ink: '#111111',
    gap: '1rem',
  })
  const orchard = { brand: { 600: '#c2410c' } }

  test('declares the overrides and every alias that depends on them, in base order', () => {
    expect(Theme.patch(base, system, orchard).declarations).toEqual([
      ['--brand-600', '#c2410c'],
      ['--accent', 'var(--brand-600)'],
      ['--button', 'var(--accent)'],
    ])
    expect(
      Theme.patch(base, system, { accent: system.brand[500], ink: '#000' }).declarations,
    ).toEqual([
      ['--accent', 'var(--brand-500)'],
      ['--button', 'var(--accent)'],
      ['--ink', '#000'],
    ])
    expect(Theme.patch(base, system, {}).declarations).toEqual([])
  })

  test('inside the base, gives every token the value of the whole extended theme', () => {
    const patched = [base, Theme.patch(base, system, orchard)]
    const extended = Theme.extend(base, system, orchard)
    for (const token of Token.leaves(system)) {
      expect(Theme.resolve(patched, token)).toEqual(Theme.resolve(extended, token))
    }
    expect(Theme.resolve(patched, system.button)).toEqual(Option.some('#c2410c'))
  })

  test('keeps what a scope in between set, where a whole theme would reset it', () => {
    const compact = Theme.make({ gap: system.gap }, { gap: '0.5rem' })
    const patched = [base, compact, Theme.patch(base, system, orchard)]
    expect(Theme.resolve(patched, system.gap)).toEqual(Option.some('0.5rem'))
    expect(Theme.resolve(patched, system.button)).toEqual(Option.some('#c2410c'))
    const extended = [base, compact, Theme.extend(base, system, orchard)]
    expect(Theme.resolve(extended, system.gap)).toEqual(Option.some('1rem'))
  })

  test('checks values and aliases the way make does', () => {
    expect(() => Theme.patch(base, system, { gap: 'wide' })).toThrow(
      'gap is not a valid Length',
    )
    expect(() => Theme.patch(base, system, { brand: { 600: system.button } })).toThrow(
      /Theme aliases form a cycle/,
    )
  })
})

describe('decode checks', () => {
  const valid = {
    color: { canvas: '#ffffff', ink: '#111111', onAccent: 'white' },
    space: { 1: '0.25rem', 2: '0.5rem' },
    font: { body: 'serif', weight: 400 },
  }
  const sameAs =
    (token: Token.Token, other: Token.Token): Theme.Check =>
    theme =>
      Equal.equals(Theme.resolve(theme, token), Theme.resolve(theme, other))
        ? {
            path: token.path,
            issue: `${token.path.join('.')} is the same as ${other.path.join('.')}`,
          }
        : undefined
  const inkStandsOut = sameAs(tokens.color.ink, tokens.color.canvas)

  const failure = async (effect: Effect.Effect<Theme.Theme, Schema.SchemaError>) => {
    const exit = await Effect.runPromiseExit(effect)
    if (!Exit.isFailure(exit)) {
      throw new Error('expected the decode to fail')
    }
    return String(Cause.squash(exit.cause))
  }

  test('reject a theme whose values each have their kind but break a rule', async () => {
    const message = await failure(
      Theme.decode(
        tokens,
        { ...valid, color: { ...valid.color, ink: '#ffffff' } },
        {
          checks: [inkStandsOut],
        },
      ),
    )
    expect(message).toContain('color.ink is the same as color.canvas')
    expect(message).toContain('at ["color"]["ink"]')
    const theme = await Effect.runPromise(
      Theme.decode(tokens, valid, { checks: [inkStandsOut] }),
    )
    expect(Theme.css(theme)).toBe(Theme.css(Theme.make(tokens, valid)))
  })

  test('report every failing check together', async () => {
    const message = await failure(
      Theme.decode(
        tokens,
        { ...valid, color: { canvas: '#ffffff', ink: '#ffffff', onAccent: '#ffffff' } },
        { checks: [inkStandsOut, sameAs(tokens.color.onAccent, tokens.color.canvas)] },
      ),
    )
    expect(message).toContain('at ["color"]["ink"]')
    expect(message).toContain('at ["color"]["onAccent"]')
  })

  test('run once on one built theme, which is the result, and only when every value has its kind', async () => {
    const seen: Array<Theme.Theme> = []
    const record: Theme.Check = theme => {
      seen.push(theme)
      return undefined
    }
    const theme = await Effect.runPromise(
      Theme.decode(tokens, valid, { checks: [record, record] }),
    )
    expect(seen).toHaveLength(2)
    expect(seen[0]).toBe(theme)
    expect(seen[1]).toBe(theme)
    seen.length = 0
    const message = await failure(
      Theme.decode(
        tokens,
        { ...valid, space: { 1: '4px', 2: 'eight' } },
        { checks: [record] },
      ),
    )
    expect(message).toContain('at ["space"]["2"]')
    expect(seen).toEqual([])
  })

  test('run on the extended theme in decodePartial, aliases and all', async () => {
    const night = Theme.extend(light, tokens, {
      color: { onAccent: tokens.color.canvas },
    })
    const onAccentStandsOut = sameAs(tokens.color.onAccent, tokens.color.ink)
    const message = await failure(
      Theme.decodePartial(
        night,
        tokens,
        { color: { canvas: 'oklch(20% 0.02 260)' } },
        {
          checks: [onAccentStandsOut],
        },
      ),
    )
    expect(message).toContain('color.onAccent is the same as color.ink')
    const theme = await Effect.runPromise(
      Theme.decodePartial(
        night,
        tokens,
        { color: { canvas: '#000' } },
        {
          checks: [onAccentStandsOut],
        },
      ),
    )
    expect(Theme.resolve(theme, tokens.color.onAccent)).toEqual(Option.some('#000'))
  })
})

describe('Theme.bindings', () => {
  test('binds every declaration, in order, for one element', () => {
    const night = Theme.extend(light, tokens, {
      color: { onAccent: tokens.color.canvas },
    })
    expect(Theme.bindings(night)).toEqual(
      night.declarations.map(([name, value]) => ({ _tag: 'Binding', name, value })),
    )
    expect(Theme.bindings(night).every(Var.isBinding)).toBe(true)
    expect(Theme.bindings(Theme.empty)).toEqual([])
  })
})

describe('Theme.resolve', () => {
  const layered = Token.make({
    brand: Token.color,
    accent: Token.color,
    soft: Token.color,
    ring: Token.value,
  })
  const root = Theme.make(layered, {
    brand: '#2563eb',
    accent: layered.brand,
    soft: `color-mix(in srgb, ${layered.accent} 20%, white)`,
    ring: `0 0 0 2px ${Var.string('focus', { fallback: 'black' })}`,
  })
  const brandOnly = Theme.make({ brand: layered.brand }, { brand: '#dc2626' })

  test('follows aliases to a literal, inside other values too', () => {
    expect(Theme.resolve(light, tokens.color.ink)).toEqual(
      Option.some('oklch(20% 0.02 260)'),
    )
    expect(Theme.resolve(light, tokens.font.weight)).toEqual(Option.some('450'))
    expect(Theme.resolve(root, layered.accent)).toEqual(Option.some('#2563eb'))
    expect(Theme.resolve(root, layered.soft)).toEqual(
      Option.some('color-mix(in srgb, #2563eb 20%, white)'),
    )
  })

  test('uses a fallback when the reference has no value, and None when there is none', () => {
    expect(Theme.resolve(root, layered.ring)).toEqual(Option.some('0 0 0 2px black'))
    const hue = Var.string('hue')
    const tinted = Theme.make({ brand: layered.brand }, { brand: hue })
    expect(Theme.resolve(tinted, layered.brand)).toEqual(Option.none())
    expect(Theme.resolve([tinted, brandOnly], layered.brand)).toEqual(
      Option.some('#dc2626'),
    )
    expect(Theme.resolve(light, layered.brand)).toEqual(Option.none())
    expect(Theme.resolve([], layered.brand)).toEqual(Option.none())
  })

  test('resolves an alias in the scope that declares it, as CSS does', () => {
    const scopes = [root, brandOnly]
    expect(Theme.resolve(scopes, layered.brand)).toEqual(Option.some('#dc2626'))
    expect(Theme.resolve(scopes, layered.accent)).toEqual(Option.some('#2563eb'))
    const redeclared = [...scopes, Theme.extend(root, layered, {})]
    expect(Theme.resolve(redeclared, layered.accent)).toEqual(Option.some('#2563eb'))
    const extended = [root, Theme.extend(root, layered, { brand: '#dc2626' })]
    expect(Theme.resolve(extended, layered.accent)).toEqual(Option.some('#dc2626'))
  })

  test('a declaration whose reference has no value is unset, not inherited', () => {
    const hue = Var.string('hue')
    const broken = Theme.make({ accent: layered.accent }, { accent: hue })
    expect(Theme.resolve([root, broken], layered.accent)).toEqual(Option.none())
  })
})

describe('aliases', () => {
  const values = {
    color: { canvas: '#ffffff', ink: '#111111', onAccent: 'white' },
    space: { 1: '0.25rem', 2: '0.5rem' },
    font: { body: 'serif', weight: 400 },
  }

  test('an alias holds the same kind as its token', () => {
    expect(() =>
      Theme.extend(light, tokens, {
        // @ts-expect-error a length is not a color
        color: { canvas: tokens.space[2] },
      }),
    ).toThrow('color.canvas aliases space.2, which holds a Length, not a Color')
    const shadows = Token.make({ shadow: Token.value, tint: Token.color })
    const theme = Theme.make(shadows, { shadow: tokens.space[1], tint: tokens.color.ink })
    expect(Theme.css(theme)).toBe(
      ':root{--shadow:var(--space-1);--tint:var(--color-ink)}',
    )
    const hue = Var.string('hue')
    expect(Theme.css(Theme.extend(light, tokens, { color: { ink: hue } }))).toContain(
      '--color-ink:var(--hue)',
    )
  })

  test('aliases that form a cycle are rejected', () => {
    expect(() =>
      Theme.extend(light, tokens, {
        color: { canvas: tokens.color.onAccent, onAccent: tokens.color.canvas },
      }),
    ).toThrow(
      'Theme aliases form a cycle: --color-canvas → --color-on-accent → --color-canvas',
    )
    expect(() =>
      Theme.extend(light, tokens, {
        color: { ink: 'color-mix(in oklch, var(--color-ink), white)' },
      }),
    ).toThrow('Theme aliases form a cycle: --color-ink → --color-ink')
    const roles = Token.make({ accent: Token.color })
    const accented = Theme.make(roles, { accent: tokens.color.ink })
    expect(() =>
      Theme.merge(
        accented,
        Theme.extend(light, tokens, { color: { ink: roles.accent } }),
      ),
    ).toThrow('Theme aliases form a cycle: --accent → --color-ink → --accent')
  })

  test('a complete theme sets every token, so its aliases have targets', () => {
    expect(() =>
      Theme.make(tokens, {
        ...values,
        color: { ink: '#111111', onAccent: tokens.color.canvas },
      } as never),
    ).toThrow('Theme.make has no value for color.canvas')
  })

  test('decoded values are literals, never aliases', () => {
    const schema = Theme.schema(tokens)
    const decoded: typeof schema.Type = Schema.decodeUnknownSync(schema)(values)
    expect(decoded.color.canvas).toBe('#ffffff')
    const aliased = { ...values, color: { ...values.color, ink: tokens.color.canvas } }
    // @ts-expect-error a decoded theme holds values, not tokens
    const typed: typeof schema.Type = aliased
    expect(Exit.isFailure(Schema.decodeUnknownExit(schema)(typed))).toBe(true)
  })
})

describe('Token.color', () => {
  const decode = Schema.decodeUnknownExit(Token.color.schema)

  test('accepts hex of 3, 4, 6, or 8 digits, named and system colors, and color functions', () => {
    for (const color of [
      '#abc',
      '#abcd',
      '#aabbcc',
      '#aabbccdd',
      'rebeccapurple',
      'transparent',
      'currentColor',
      'Canvas',
      'oklch(62% 0.19 255)',
      'var(--brand)',
    ]) {
      expect(Exit.isSuccess(decode(color)), color).toBe(true)
    }
  })

  test('rejects words that are not colors and hex of other lengths', () => {
    for (const color of ['bananas', 'tealish', '#12345', '#1234567', '#ab', 'inherit']) {
      expect(Exit.isFailure(decode(color)), color).toBe(true)
    }
  })
})
