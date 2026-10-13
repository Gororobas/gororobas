import { cva } from 'class-variance-authority'
import { Effect } from 'effect'
import { Server } from 'foldkit/experimental'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { twMerge } from 'tailwind-merge'

import { Recipe, Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

// The same button, written two ways: a Pleat recipe, and the common Tailwind stack
// (class-variance-authority for variants, tailwind-merge so overrides win).

const button = Recipe.make({
  name: 'Button',
  base: Style.make({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    borderRadius: 6,
    fontWeight: 600,
  }).pipe(Style.when(When.focusVisible, { outline: '2px solid rgb(29, 78, 216)' })),
  variants: {
    tone: {
      Primary: Style.make({ backgroundColor: 'rgb(29, 78, 216)', color: 'white' }).pipe(
        Style.when(When.hover, { backgroundColor: 'rgb(30, 64, 175)' }),
      ),
      Neutral: Style.make({
        backgroundColor: 'rgb(243, 244, 246)',
        color: 'rgb(17, 24, 39)',
      }).pipe(Style.when(When.hover, { backgroundColor: 'rgb(229, 231, 235)' })),
      Danger: Style.make({ backgroundColor: 'rgb(220, 38, 38)', color: 'white' }),
    },
    size: {
      Small: { paddingBlock: 4, paddingInline: 8, fontSize: 13 },
      Medium: { paddingBlock: 8, paddingInline: 12, fontSize: 14 },
      Large: { paddingBlock: 12, paddingInline: 16, fontSize: 16 },
    },
    isPending: { true: { opacity: 0.6, cursor: 'progress' }, false: {} },
  },
  defaults: { tone: 'Neutral', size: 'Medium', isPending: false },
})

const twButton = cva(
  'inline-flex items-center gap-2 rounded-md font-semibold focus-visible:outline-2 focus-visible:outline-blue-700',
  {
    variants: {
      tone: {
        Primary: 'bg-blue-700 text-white hover:bg-blue-800',
        Neutral: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
        Danger: 'bg-red-600 text-white',
      },
      size: {
        Small: 'py-1 px-2 text-[13px]',
        Medium: 'py-2 px-3 text-sm',
        Large: 'py-3 px-4 text-base',
      },
      isPending: { true: 'opacity-60 cursor-progress', false: '' },
    },
    defaultVariants: { tone: 'Neutral', size: 'Medium', isPending: false },
  },
)

const TONES = ['Primary', 'Neutral', 'Danger'] as const
const SIZES = ['Small', 'Medium', 'Large'] as const
const ROWS = 500

const override = Style.make({ paddingInline: 20 })

// HARNESS

const ROUNDS = 7
const TARGET_MILLISECONDS = 150

type Result = Readonly<{ name: string; nanosecondsPerOperation: number }>

const median = (values: ReadonlyArray<number>): number => {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN
}

const measure = async (name: string, operation: () => unknown): Promise<Result> => {
  let iterations = 1
  for (;;) {
    const start = performance.now()
    for (let index = 0; index < iterations; index += 1) {
      await operation()
    }
    if (performance.now() - start > TARGET_MILLISECONDS / 4) {
      break
    }
    iterations *= 2
  }
  const samples: Array<number> = []
  for (let round = 0; round < ROUNDS; round += 1) {
    const start = performance.now()
    for (let index = 0; index < iterations; index += 1) {
      await operation()
    }
    samples.push(((performance.now() - start) * 1e6) / iterations)
  }
  return { name, nanosecondsPerOperation: median(samples) }
}

const results: Array<Readonly<{ group: string; results: ReadonlyArray<Result> }>> = []
const cases: Array<Readonly<{ name: string; operation: () => unknown }>> = []
let currentGroup = ''
const describe = (group: string, define: () => void) => {
  currentGroup = group
  cases.length = 0
  define()
  pending.push({ group: currentGroup, cases: [...cases] })
}
const bench = (name: string, operation: () => unknown) => {
  cases.push({ name, operation })
}
const pending: Array<
  Readonly<{
    group: string
    cases: ReadonlyArray<Readonly<{ name: string; operation: () => unknown }>>
  }>
> = []

// CASES

describe('one styled element per render', () => {
  let index = 0
  const next = () => {
    index = (index + 1) % 18
    return {
      tone: TONES[index % 3] ?? 'Neutral',
      size: SIZES[Math.floor(index / 3) % 3] ?? 'Medium',
      isPending: index % 2 === 0,
    }
  }

  bench('Pleat: recipe → css()', () => {
    css(button(next()))
  })

  bench('Pleat: recipe + override → css()', () => {
    css(button(next()), override)
  })

  bench('cva', () => {
    twButton(next())
  })

  bench('cva + tailwind-merge with an override', () => {
    twMerge(twButton(next()), 'px-5')
  })
})

type Row = Readonly<{
  id: number
  tone: (typeof TONES)[number]
  size: (typeof SIZES)[number]
}>
const rows: ReadonlyArray<Row> = Array.from({ length: ROWS }, (_, id) => ({
  id,
  tone: TONES[id % 3] ?? 'Neutral',
  size: SIZES[id % 3] ?? 'Medium',
}))

const pleatView = (model: ReadonlyArray<Row>, h: HtmlBuilder<never>): Document => ({
  title: 'rows',
  body: h.ul(
    [],
    model.map(row => h.li([], [h.button([...css(button(row))], [`Row ${row.id}`])])),
  ),
})

const tailwindView = (model: ReadonlyArray<Row>, h: HtmlBuilder<never>): Document => ({
  title: 'rows',
  body: h.ul(
    [],
    model.map(row => h.li([], [h.button([h.Class(twButton(row))], [`Row ${row.id}`])])),
  ),
})

const renderStatic = (view: typeof pleatView) =>
  Effect.runPromise(
    Server.renderToString(
      { init: () => ({ model: rows }), view },
      { isHydratable: false },
    ),
  )

describe(`server render of ${ROWS} buttons with Foldkit`, () => {
  bench('Pleat', async () => {
    await renderStatic(pleatView)
  })

  bench('Tailwind classes via cva', async () => {
    await renderStatic(tailwindView)
  })
})

// REPORT

for (const { group, cases: groupCases } of pending) {
  const groupResults: Array<Result> = []
  for (const { name, operation } of groupCases) {
    groupResults.push(await measure(name, operation))
  }
  results.push({ group, results: groupResults })
}

const format = (nanoseconds: number): string =>
  nanoseconds >= 1e6
    ? `${(nanoseconds / 1e6).toFixed(2)} ms`
    : nanoseconds >= 1e3
      ? `${(nanoseconds / 1e3).toFixed(2)} µs`
      : `${nanoseconds.toFixed(0)} ns`

console.log(`Node ${process.version}, median of ${ROUNDS} rounds\n`)
for (const { group, results: groupResults } of results) {
  const fastest = Math.min(...groupResults.map(result => result.nanosecondsPerOperation))
  console.log(`| ${group} | time per operation | relative |`)
  console.log('| --- | ---: | ---: |')
  for (const result of groupResults) {
    console.log(
      `| ${result.name} | ${format(result.nanosecondsPerOperation)} | ${(result.nanosecondsPerOperation / fastest).toFixed(1)}× |`,
    )
  }
  console.log('')
}
