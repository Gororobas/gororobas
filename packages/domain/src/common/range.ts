import { Schema, Struct } from "effect"

import type { RangeWithOptionalEnds } from "./primitives.js"

interface RangeOptions<T, E> {
  readonly bound: Schema.Codec<T, E>
  readonly isLessThanOrEqual: (self: T, that: T) => boolean
  readonly identifier: string
  readonly title: string
}

interface RangeKeys {
  readonly min: string
  readonly max: string
}

type RangeSchema<T, E, Keys extends RangeKeys> = Schema.Struct<{
  readonly [Key in Keys["min" | "max"]]: Schema.optionalKey<Schema.Codec<T, E>>
}>

/**
 * A range with either end optional, as today's `heightMin`/`heightMax` are, validated together.
 * The edit form renders every range with one component: two inputs and the schema's message.
 */
export function makeRange<T, E, const Keys extends RangeKeys>(
  options: RangeOptions<T, E> & { readonly keys: Keys },
): RangeSchema<T, E, Keys>
export function makeRange<T, E>(
  options: RangeOptions<T, E> & { readonly keys?: never },
): RangeSchema<T, E, { min: "min"; max: "max" }>

export function makeRange<T, E>({
  bound,
  isLessThanOrEqual,
  identifier,
  title,
  keys = { min: "min", max: "max" },
}: RangeOptions<T, E> & { readonly keys?: RangeKeys }) {
  const optionalBound = Schema.optionalKey(bound)

  return Schema.Struct(Struct.renameKeys({ min: optionalBound, max: optionalBound }, keys)).check(
    Schema.makeFilter(
      (range) => {
        const min = range[keys.min]
        const max = range[keys.max]
        if (min === undefined && max === undefined) return "a range needs an end"
        if (min === undefined || max === undefined) return true
        return isLessThanOrEqual(min, max) || `"${keys.min}" exceeds "${keys.max}"`
      },
      {
        identifier,
        title,
        description: `${title}: at least one end, "${keys.min}" at or before "${keys.max}".`,
      },
    ),
  )
}

/** Compiles only while default `makeRange` values are `RangeWithOptionalEnds`, which code reading ranges takes. */
export const rangeValuesAreRangesWithOptionalEnds = <T>(
  range: ReturnType<typeof makeRange<T, unknown>>["Type"],
): RangeWithOptionalEnds<T> => range
