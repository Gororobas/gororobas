import { Option } from 'effect'
import fc from 'fast-check'
import type { Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { Theme, Token, Var } from '@pleat/core'

import { launch } from './chromium.ts'

// The claim under test: Theme.resolve gives the value Chromium computes for a custom
// property inside nested scopes, each with its own theme. The browser computes one side,
// so Theme.resolve can't agree with itself.

const PROGRAMS = 200
const SEED = 20_261_009

let browser: Browser

beforeAll(async () => {
  browser = await launch()
})

afterAll(async () => {
  await browser?.close()
})

/** Nested scopes, outermost first, and the tokens to read in each. */
type Program = Readonly<{
  scopes: ReadonlyArray<Theme.Theme>
  tokens: ReadonlyArray<Token.Token>
}>

const scopeId = (program: number, depth: number): string => `p${program}s${depth}`

const markup = (program: Program, index: number): string =>
  program.scopes.reduceRight(
    (inner, _theme, depth) => `<div id="${scopeId(index, depth)}">${inner}</div>`,
    '',
  )

const rules = (program: Program, index: number): string =>
  program.scopes
    .map((theme, depth) => Theme.css(theme, `#${scopeId(index, depth)}`))
    .join('\n')

/** Every token in every scope where Chromium and Theme.resolve disagree. */
const mismatches = async (
  programs: ReadonlyArray<Program>,
): Promise<ReadonlyArray<string>> => {
  const page = await browser.newPage()
  await page.setContent(
    `<!doctype html><html><head><style>${programs.map(rules).join('\n')}</style></head>` +
      `<body>${programs.map(markup).join('')}</body></html>`,
  )
  const probes = programs.flatMap((program, index) =>
    program.scopes.flatMap((_theme, depth) =>
      program.tokens.map(token => ({
        id: scopeId(index, depth),
        name: token.name,
        expected: Option.getOrElse(
          Theme.resolve(program.scopes.slice(0, depth + 1), token),
          () => '',
        ),
      })),
    ),
  )
  const computed = await page.evaluate(
    probes =>
      probes.map(({ id, name }) => {
        const element = document.getElementById(id)
        return element === null
          ? `no element #${id}`
          : getComputedStyle(element).getPropertyValue(name)
      }),
    probes,
  )
  await page.close()
  return probes.flatMap((probe, index) =>
    computed[index] === probe.expected
      ? []
      : [
          `#${probe.id} ${probe.name}: Chromium ${computed[index]}, resolve ${probe.expected}`,
        ],
  )
}

describe('Theme.resolve follows aliases the way Chromium does', () => {
  test('in a primitive, semantic, and component system with nested scopes', async () => {
    const tokens = Token.make({
      brand: { 500: Token.color, 600: Token.color },
      accent: Token.color,
      accentSoft: Token.color,
      button: { background: Token.color, ring: Token.value },
      unset: Token.color,
    })
    const ring = Var.string('ring', { fallback: 'rgb(0, 0, 0)' })
    const root = Theme.make(
      { brand: tokens.brand, accent: tokens.accent, accentSoft: tokens.accentSoft },
      {
        brand: { 500: 'rgb(59, 130, 246)', 600: 'rgb(37, 99, 235)' },
        accent: tokens.brand[600],
        accentSoft: `color-mix(in srgb, ${tokens.accent} 20%, white)`,
      },
    )
    const components = Theme.make(tokens.button, {
      background: tokens.accent,
      ring: `0 0 0 2px ${ring}`,
    })
    const brandOnly = Theme.make(tokens.brand, {
      500: 'rgb(239, 68, 68)',
      600: 'rgb(220, 38, 38)',
    })
    const reAliased = Theme.extend(root, tokens, { accent: tokens.brand[500] })
    const all = Token.leaves(tokens)

    expect(
      await mismatches([
        { scopes: [Theme.merge(root, components)], tokens: all },
        { scopes: [root, components, brandOnly], tokens: all },
        { scopes: [root, components, brandOnly, reAliased], tokens: all },
      ]),
    ).toEqual([])

    // The trap, in Chromium's own terms: a scope that sets only the brand keeps the
    // root's accent, and the component built on it.
    const trapped = [root, components, brandOnly]
    expect(Theme.resolve(trapped, tokens.brand[600])).toEqual(
      Option.some('rgb(220, 38, 38)'),
    )
    expect(Theme.resolve(trapped, tokens.accent)).toEqual(Option.some('rgb(37, 99, 235)'))
    expect(Theme.resolve(trapped, tokens.button.background)).toEqual(
      Option.some('rgb(37, 99, 235)'),
    )
    expect(Theme.resolve(trapped, tokens.button.ring)).toEqual(
      Option.some('0 0 0 2px rgb(0, 0, 0)'),
    )
    expect(Theme.resolve(trapped, tokens.unset)).toEqual(Option.none())
  })

  test('for random alias graphs, overrides, and fallbacks', async () => {
    const programs = fc.sample(program, { numRuns: PROGRAMS, seed: SEED })
    const found = await mismatches(programs)
    expect(found.slice(0, 5)).toEqual([])
  })
})

/** A base theme applied at a root, and overrides applied inside it two ways: as a patch
 *  and as the whole extended theme. */
type Override = Readonly<{
  base: Theme.Theme
  tokens: object
  overrides: Theme.PartialValues<object>
}>

const inlineStyle = (theme: Theme.Theme): string =>
  Theme.bindings(theme)
    .map(({ name, value }) => `${name}:${value}`)
    .join(';')
    .replaceAll('"', '&quot;')

/** Every token whose value Chromium computes differently inside the patch than inside the
 *  whole extended theme. Every other patch goes inline, through Theme.bindings. */
const patchMismatches = async (
  cases: ReadonlyArray<Override>,
): Promise<ReadonlyArray<string>> => {
  const themes = cases.map(({ base, tokens, overrides }) => ({
    base,
    patch: Theme.patch(base, tokens, overrides),
    extended: Theme.extend(base, tokens, overrides),
    names: Token.leaves(tokens).map(token => token.name),
  }))
  const rules = themes.flatMap(({ base, patch, extended }, index) => [
    Theme.css(base, `#r${index}`),
    Theme.css(extended, `#e${index}`),
    ...(index % 2 === 0 ? [Theme.css(patch, `#p${index}`)] : []),
  ])
  const markup = themes.map(
    ({ patch }, index) =>
      `<div id="r${index}">` +
      `<div id="p${index}"${index % 2 === 0 ? '' : ` style="${inlineStyle(patch)}"`}></div>` +
      `<div id="e${index}"></div></div>`,
  )
  const page = await browser.newPage()
  await page.setContent(
    `<!doctype html><html><head><style>${rules.join('\n')}</style></head>` +
      `<body>${markup.join('')}</body></html>`,
  )
  const found = await page.evaluate(
    cases =>
      cases.flatMap((names, index) => {
        const patched = document.getElementById(`p${index}`)
        const extended = document.getElementById(`e${index}`)
        if (patched === null || extended === null) {
          return [`${index}: missing element`]
        }
        return names.flatMap(name => {
          const actual = getComputedStyle(patched).getPropertyValue(name)
          const expected = getComputedStyle(extended).getPropertyValue(name)
          return actual === expected
            ? []
            : [`${index} ${name}: patch ${actual}, extended ${expected}`]
        })
      }),
    themes.map(({ names }) => names),
  )
  await page.close()
  return found
}

describe('Theme.patch inside its base computes what the whole extended theme does', () => {
  const tokens = Token.make({
    brand: { 500: Token.color, 600: Token.color },
    accent: Token.color,
    button: { background: Token.color, label: Token.color },
    space: Token.length,
  })
  const base = Theme.make(tokens, {
    brand: { 500: 'rgb(59, 130, 246)', 600: 'rgb(37, 99, 235)' },
    accent: tokens.brand[600],
    button: { background: tokens.accent, label: 'rgb(255, 255, 255)' },
    space: '16px',
  })
  const orchard = { brand: { 600: 'rgb(194, 65, 12)' } }

  test('in a primitive, semantic, and component system, at a rule and inline', async () => {
    expect(
      await patchMismatches([
        { base, tokens, overrides: orchard },
        { base, tokens, overrides: orchard },
        { base, tokens, overrides: { accent: tokens.brand[500] } },
        { base, tokens, overrides: { accent: tokens.brand[500] } },
      ]),
    ).toEqual([])

    // Chromium agrees with Theme.resolve in the patched scope, and with a density set by a
    // scope in between, which the patch leaves alone.
    const patch = Theme.patch(base, tokens, orchard)
    const compact = Theme.make({ space: tokens.space }, { space: '8px' })
    expect(
      await mismatches([
        { scopes: [base, patch], tokens: Token.leaves(tokens) },
        { scopes: [base, compact, patch], tokens: Token.leaves(tokens) },
      ]),
    ).toEqual([])
    expect(Theme.resolve([base, compact, patch], tokens.button.background)).toEqual(
      Option.some('rgb(194, 65, 12)'),
    )
    expect(Theme.resolve([base, compact, patch], tokens.space)).toEqual(
      Option.some('8px'),
    )
  })

  test('for random alias graphs and overrides', async () => {
    const cases = fc.sample(override, { numRuns: PROGRAMS, seed: SEED })
    const found = await patchMismatches(cases)
    expect(found.slice(0, 5)).toEqual([])
    const scoped = await mismatches(
      cases.map(({ base, tokens, overrides }) => ({
        scopes: [base, Theme.patch(base, tokens, overrides)],
        tokens: all,
      })),
    )
    expect(scoped.slice(0, 5)).toEqual([])
  })
})

// RANDOM PROGRAMS

const SIZE = 6

const randomTokens = Token.make(
  Object.fromEntries(
    Array.from({ length: SIZE }, (_, index) => [`t${index}`, Token.value]),
  ),
) as Readonly<Record<string, Token.Token<string, 'Value'>>>

const all = Object.values(randomTokens)

const missing = Var.string('missing')

// NOTE: an alias only points at a token with a lower index, so a theme's
// aliases never form a cycle, which Theme.make would reject.
const valueFor = (index: number): fc.Arbitrary<string> => {
  const literal = fc.constantFrom('rgb(1, 2, 3)', '4px', '0 0 0 1px red', 'a b')
  if (index === 0) {
    return literal
  }
  const target = fc.integer({ min: 0, max: index - 1 }).map(target => all[target])
  return fc.oneof(
    literal,
    target.map(token => `${token}`),
    target.map(token => `calc(${token} + 1px)`),
    target.map(token => `var(${token?.name}, ${index}px)`),
    target.map(token => `var(${missing.name}, ${token})`),
    fc.constant(`${missing}`),
  )
}

const scope: fc.Arbitrary<Theme.Theme> = fc
  .subarray(
    all.map((_, index) => index),
    { minLength: 1 },
  )
  .chain(indices =>
    fc
      .tuple(...indices.map(valueFor))
      .map(values =>
        Theme.make(
          Object.fromEntries(indices.map(index => [`t${index}`, all[index]])),
          Object.fromEntries(indices.map((index, at) => [`t${index}`, values[at] ?? ''])),
        ),
      ),
  )

const program: fc.Arbitrary<Program> = fc
  .array(scope, { minLength: 1, maxLength: 4 })
  .map(scopes => ({ scopes, tokens: all }))

const indices = all.map((_, index) => index)

const valuesFor = (picked: ReadonlyArray<number>): fc.Arbitrary<Record<string, string>> =>
  fc
    .tuple(...picked.map(valueFor))
    .map(values =>
      Object.fromEntries(picked.map((index, at) => [`t${index}`, values[at] ?? ''])),
    )

const override: fc.Arbitrary<Override> = fc
  .tuple(valuesFor(indices), fc.subarray(indices).chain(valuesFor))
  .map(([values, overrides]) => ({
    base: Theme.make(randomTokens, values),
    tokens: randomTokens,
    overrides,
  }))
