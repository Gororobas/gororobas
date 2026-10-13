import fc from 'fast-check'
import type { Browser, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { Sheet, Style, When } from '@pleat/core'

import { description } from '../../packages/core/test/arbitrary.ts'
import { type Description, fromDescription } from '../../packages/core/test/universe.ts'
import { bundle } from './bundle.ts'
import { launch } from './chromium.ts'

// The claim under test: for any style and any set of active conditions, the browser's
// cascade over Pleat's compiled rules gives exactly what Style.resolve says it means.

const SAMPLES_PER_ENVIRONMENT = 150
const SEED = 20_171_008

const PROBED = [
  'color',
  'backgroundColor',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'opacity',
  'borderTopWidth',
] as const

const LONGHANDS: Readonly<Record<string, ReadonlyArray<string>>> = {
  padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
  margin: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
}

type ElementState = Readonly<{
  isHovered: boolean
  isFocusVisible: boolean
  isOpen: boolean
  isDisabled: boolean
}>

type Environment = Readonly<{ isDark: boolean; isWide: boolean }>

type Sample = Readonly<{ description: Description; state: ElementState }>

const ENVIRONMENTS: ReadonlyArray<Environment> = [
  { isDark: false, isWide: false },
  { isDark: true, isWide: false },
  { isDark: false, isWide: true },
  { isDark: true, isWide: true },
]

const elementState: fc.Arbitrary<ElementState> = fc.record({
  isHovered: fc.boolean(),
  isFocusVisible: fc.boolean(),
  isOpen: fc.boolean(),
  isDisabled: fc.boolean(),
})

const samplesFor = (index: number): ReadonlyArray<Sample> =>
  fc.sample(fc.record({ description, state: elementState }), {
    numRuns: SAMPLES_PER_ENVIRONMENT,
    seed: SEED + index,
  })

const activeAtomKeys = (
  environment: Environment,
  state: ElementState,
): ReadonlySet<string> => {
  const keys = new Set<string>()
  const add = (condition: When.Condition, isActive: boolean) => {
    if (isActive) {
      for (const atom of condition.atoms) {
        keys.add(atom.key)
      }
    }
  }
  add(When.hover, state.isHovered)
  add(When.focusVisible, state.isFocusVisible)
  add(When.open, state.isOpen)
  add(When.disabled, state.isDisabled)
  add(When.dark, environment.isDark)
  add(When.minWidth('40rem'), environment.isWide)
  return keys
}

const expectedStyle = (
  style: Style.Style,
  active: ReadonlySet<string>,
  baseline: Readonly<Record<string, string>>,
): Record<string, string> => {
  const expected: Record<string, string> = { ...baseline }
  for (const [property, value] of Object.entries(
    Style.resolve(style, atom => active.has(atom.key)),
  )) {
    for (const longhand of LONGHANDS[property] ?? [property]) {
      expected[longhand] = value
    }
  }
  return expected
}

// PAGE

const PROBE_CSS = '.probe{border-top-style:solid}'

const renderElements = (
  samples: ReadonlyArray<Sample>,
  classNames: ReadonlyArray<string>,
): string =>
  samples
    .map(
      ({ state }, index) =>
        `<div id="e${index}" class="probe ${classNames[index] ?? ''}"` +
        `${state.isOpen ? ' data-open' : ''}${state.isDisabled ? ' data-disabled' : ''}></div>`,
    )
    .join('')

const forcePseudoStates = async (page: Page, samples: ReadonlyArray<Sample>) => {
  const session = await page.context().newCDPSession(page)
  await session.send('DOM.enable')
  await session.send('CSS.enable')
  const { root } = await session.send('DOM.getDocument')
  for (const [index, { state }] of samples.entries()) {
    const forced = [
      ...(state.isHovered ? ['hover'] : []),
      ...(state.isFocusVisible ? ['focus-visible'] : []),
    ]
    if (forced.length > 0) {
      const { nodeId } = await session.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: `#e${index}`,
      })
      await session.send('CSS.forcePseudoState', {
        nodeId,
        forcedPseudoClasses: forced,
      })
    }
  }
  return session
}

const computedStyles = (page: Page, count: number) =>
  page.evaluate(
    ({ count, probed }) => {
      const read = (element: Element) => {
        const computed = getComputedStyle(element)
        return Object.fromEntries(
          probed.map(property => [
            property,
            computed.getPropertyValue(
              property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`),
            ),
          ]),
        )
      }
      const baselineElement = document.createElement('div')
      baselineElement.className = 'probe'
      document.body.append(baselineElement)
      const baseline = read(baselineElement)
      const elements = Array.from({ length: count }, (_, index) => {
        const element = document.getElementById(`e${index}`)
        return element === null ? {} : read(element)
      })
      return { baseline, elements }
    },
    { count, probed: [...PROBED] },
  )

const configure = async (page: Page, environment: Environment) => {
  await page.setViewportSize({ width: environment.isWide ? 1000 : 500, height: 600 })
  await page.emulateMedia({ colorScheme: environment.isDark ? 'dark' : 'light' })
}

const compare = (
  samples: ReadonlyArray<Sample>,
  environment: Environment,
  measured: Awaited<ReturnType<typeof computedStyles>>,
) => {
  const mismatches: Array<string> = []
  for (const [index, sample] of samples.entries()) {
    const style = fromDescription(sample.description)
    const expected = expectedStyle(
      style,
      activeAtomKeys(environment, sample.state),
      measured.baseline,
    )
    const actual = measured.elements[index] ?? {}
    for (const property of PROBED) {
      if (actual[property] !== expected[property]) {
        mismatches.push(
          `${JSON.stringify(environment)} ${JSON.stringify(sample.state)} ${property}: ` +
            `browser ${actual[property]}, resolve ${expected[property]}\n` +
            JSON.stringify(Style.declarations(style), null, 1),
        )
      }
    }
  }
  return mismatches
}

// TESTS

let browser: Browser
let fixtureScript: string

beforeAll(async () => {
  browser = await launch()
  fixtureScript = await bundle(new URL('./fixture.ts', import.meta.url))
})

afterAll(async () => {
  await browser?.close()
})

describe('the compiled CSS means what Style.resolve says', () => {
  for (const [index, environment] of ENVIRONMENTS.entries()) {
    test(`server-rendered sheet, ${JSON.stringify(environment)}`, async () => {
      const samples = samplesFor(index)
      const classNames = samples.map(
        ({ description }) => fromDescription(description).className,
      )
      const page = await browser.newPage()
      await configure(page, environment)
      await page.setContent(
        `<!doctype html><html><head>${Sheet.styleTag()}<style>${PROBE_CSS}</style></head>` +
          `<body>${renderElements(samples, classNames)}</body></html>`,
      )
      await forcePseudoStates(page, samples)
      const mismatches = compare(
        samples,
        environment,
        await computedStyles(page, samples.length),
      )
      await page.close()
      expect(mismatches.slice(0, 3)).toEqual([])
    })
  }

  for (const [index, environment] of ENVIRONMENTS.entries()) {
    test(`browser insertion next to a partial server sheet, ${JSON.stringify(environment)}`, async () => {
      const samples = samplesFor(index + ENVIRONMENTS.length)
      const nodeClassNames = samples.map(
        ({ description }) => fromDescription(description).className,
      )
      const half = Math.floor(samples.length / 2)
      const serverHtml = renderElements(samples.slice(0, half), nodeClassNames)
      const page = await browser.newPage()
      await configure(page, environment)
      await page.setContent(
        `<!doctype html><html><head>${Sheet.styleTag(serverHtml)}<style>${PROBE_CSS}</style>` +
          `</head><body></body></html>`,
      )
      await page.addScriptTag({ content: fixtureScript })
      const pageClassNames = await page.evaluate(
        descriptions =>
          (
            globalThis as unknown as {
              pleatFixture: { useAll: (all: unknown) => ReadonlyArray<string> }
            }
          ).pleatFixture.useAll(descriptions),
        [...samples].reverse().map(({ description }) => description),
      )
      expect([...pageClassNames].reverse()).toEqual(nodeClassNames)
      await page.evaluate(
        html => {
          document.body.innerHTML = html
        },
        renderElements(samples, nodeClassNames),
      )
      await forcePseudoStates(page, samples)
      const mismatches = compare(
        samples,
        environment,
        await computedStyles(page, samples.length),
      )
      await page.close()
      expect(mismatches.slice(0, 3)).toEqual([])
    })
  }
})
