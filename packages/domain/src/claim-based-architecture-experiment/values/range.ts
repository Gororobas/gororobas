import { Schema } from "effect"

/**
 * A range with either end optional, as today's `heightMin`/`heightMax` are, validated together.
 * The edit form renders every range with one component: two inputs and the schema's message.
 */
export const makeRange = <T, E>({
  bound,
  isLessThanOrEqual,
  identifier,
  title,
}: {
  readonly bound: Schema.Codec<T, E>
  readonly isLessThanOrEqual: (self: T, that: T) => boolean
  readonly identifier: string
  readonly title: string
}) =>
  Schema.Struct({ min: Schema.optionalKey(bound), max: Schema.optionalKey(bound) }).check(
    Schema.makeFilter(
      (range: { readonly min?: T; readonly max?: T }) => {
        if (range.min === undefined && range.max === undefined) return "a range needs an end"
        if (range.min === undefined || range.max === undefined) return true
        return isLessThanOrEqual(range.min, range.max) || "the minimum exceeds the maximum"
      },
      {
        identifier,
        title,
        description: `${title}: at least one end, the minimum not above the maximum.`,
      },
    ),
  )
