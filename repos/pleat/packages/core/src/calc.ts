import type { Value } from './var.ts'

const format = (value: Value): string =>
  typeof value === 'number' ? `${value}px` : String(value)

const formatFactor = (value: Value): string => String(value)

/** `calc(a + b)`. Numbers are pixels. */
export const add = (left: Value, right: Value): string =>
  `calc(${format(left)} + ${format(right)})`

/** `calc(a - b)`. Numbers are pixels. */
export const subtract = (left: Value, right: Value): string =>
  `calc(${format(left)} - ${format(right)})`

/** `calc(a * factor)`. The factor is unitless. */
export const multiply = (value: Value, factor: Value): string =>
  `calc(${format(value)} * ${formatFactor(factor)})`

/** `calc(a / divisor)`. The divisor is unitless. */
export const divide = (value: Value, divisor: Value): string =>
  `calc(${format(value)} / ${formatFactor(divisor)})`

/** `calc(-1 * a)`. */
export const negate = (value: Value): string => `calc(-1 * ${format(value)})`

/** `clamp(min, preferred, max)`. */
export const clamp = (min: Value, preferred: Value, max: Value): string =>
  `clamp(${format(min)}, ${format(preferred)}, ${format(max)})`

/** `min(...values)`. */
export const min = (...values: ReadonlyArray<Value>): string =>
  `min(${values.map(format).join(', ')})`

/** `max(...values)`. */
export const max = (...values: ReadonlyArray<Value>): string =>
  `max(${values.map(format).join(', ')})`
