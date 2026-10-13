import { Style, When } from '../src/index.ts'

// NOTE: a small universe keeps collisions likely, so the laws are exercised
// on overlapping slots, shorthands over longhands, and stacked conditions.
// It leaves out shorthands that overlap without nesting (borderTop and
// borderColor), whose order atomic rules cannot keep. It has no fast-check
// import, so the browser tests can bundle it into a page.

export const CONDITIONS: ReadonlyArray<When.Condition> = [
  When.always,
  When.hover,
  When.focusVisible,
  When.open,
  When.disabled,
  When.dark,
  When.minWidth('40rem'),
  When.all(When.dark, When.hover),
  When.all(When.open, When.hover),
  When.all(When.minWidth('40rem'), When.disabled),
]

export const DECLARATIONS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['color', ['rgb(1, 2, 3)', 'rgb(200, 10, 10)', 'rgb(0, 128, 0)']],
  ['backgroundColor', ['rgb(255, 255, 255)', 'rgb(10, 20, 30)']],
  ['padding', ['4px', '8px']],
  ['paddingTop', ['0px', '12px']],
  ['paddingLeft', ['2px', '16px']],
  ['margin', ['1px', '3px']],
  ['marginTop', ['5px']],
  ['opacity', ['0.5', '0.25', '1']],
  ['borderTopWidth', ['1px', '2px']],
]

/** A style as plain data: blocks of declarations, each under a condition from CONDITIONS. */
export type Description = ReadonlyArray<
  readonly [conditionIndex: number, declarations: Readonly<Record<string, string>>]
>

/** Builds the style a description stands for, the same way in Node and in a page. */
export const fromDescription = (description: Description): Style.Style =>
  description.reduce(
    (accumulated, [conditionIndex, declarations]) =>
      Style.when(accumulated, CONDITIONS[conditionIndex] ?? When.always, declarations),
    Style.empty,
  )
